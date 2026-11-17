CREATE TYPE public.app_role AS ENUM ('admin', 'student');
CREATE TYPE public.content_kind AS ENUM ('pdf', 'video', 'audio');
CREATE TYPE public.learning_status AS ENUM ('not_started', 'in_progress', 'completed');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  student_id TEXT NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'student',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'student',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

CREATE TABLE public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modules TO authenticated;
GRANT ALL ON public.modules TO service_role;

CREATE TABLE public.student_modules (
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, module_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_modules TO authenticated;
GRANT ALL ON public.student_modules TO service_role;

CREATE TABLE public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  type public.content_kind NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  storage_path TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_hidden BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_items TO authenticated;
GRANT ALL ON public.content_items TO service_role;

CREATE TABLE public.progress (
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  status public.learning_status NOT NULL DEFAULT 'not_started',
  position_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, content_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progress TO authenticated;
GRANT ALL ON public.progress TO service_role;

CREATE TABLE public.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  event TEXT NOT NULL DEFAULT 'opened',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.access_logs TO authenticated;
GRANT ALL ON public.access_logs TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_learning_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE assigned_name TEXT;
BEGIN
  assigned_name := COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''), split_part(COALESCE(NEW.email, 'Student'), '@', 1));
  INSERT INTO public.profiles (id, full_name, student_id, role)
  VALUES (NEW.id, assigned_name, 'IV-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8)), 'student') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student') ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_learning_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created_learning_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_learning_user();

CREATE OR REPLACE FUNCTION public.protect_profile_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.id <> OLD.id OR NEW.student_id <> OLD.student_id OR NEW.role <> OLD.role OR NEW.active <> OLD.active THEN
      RAISE EXCEPTION 'Only an administrator can change protected student account details';
    END IF;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.role = 'admin' THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT (user_id, role) DO NOTHING;
      DELETE FROM public.user_roles WHERE user_id = NEW.id AND role = 'student';
    ELSE
      DELETE FROM public.user_roles WHERE user_id = NEW.id AND role = 'admin';
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student') ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_profile_changes() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_profile_changes BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_changes();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profile owners and admins can read profiles" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Profile owners may edit their name and terms" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin')) WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own roles and admins can read all" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assigned students can read modules" ON public.modules FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.student_modules sm WHERE sm.module_id = id AND sm.student_id = auth.uid()));
CREATE POLICY "Admins manage modules" ON public.modules FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.student_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can read own module assignments" ON public.student_modules FOR SELECT TO authenticated USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage module assignments" ON public.student_modules FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can view published content in assigned modules" ON public.content_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR (is_hidden = FALSE AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.student_modules sm WHERE sm.student_id = auth.uid() AND sm.module_id = content_items.module_id)));
CREATE POLICY "Admins manage course content" ON public.content_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can read their own learning progress" ON public.progress FOR SELECT TO authenticated USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Students can save progress for assigned published content" ON public.progress FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid() AND EXISTS (SELECT 1 FROM public.content_items ci JOIN public.student_modules sm ON sm.module_id = ci.module_id WHERE ci.id = content_id AND ci.is_hidden = FALSE AND ci.deleted_at IS NULL AND sm.student_id = auth.uid()));
CREATE POLICY "Students can update their own progress" ON public.progress FOR UPDATE TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "Admins can manage progress" ON public.progress FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can view their own activity" ON public.access_logs FOR SELECT TO authenticated USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Students can log activity for assigned published content" ON public.access_logs FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid() AND (content_id IS NULL OR EXISTS (SELECT 1 FROM public.content_items ci JOIN public.student_modules sm ON sm.module_id = ci.module_id WHERE ci.id = content_id AND ci.is_hidden = FALSE AND ci.deleted_at IS NULL AND sm.student_id = auth.uid())));

CREATE INDEX profiles_role_idx ON public.profiles(role, active);
CREATE INDEX student_modules_module_idx ON public.student_modules(module_id);
CREATE INDEX content_items_module_visible_idx ON public.content_items(module_id, is_hidden, position) WHERE deleted_at IS NULL;
CREATE INDEX progress_student_updated_idx ON public.progress(student_id, updated_at DESC);
CREATE INDEX access_logs_student_created_idx ON public.access_logs(student_id, created_at DESC);

CREATE POLICY "Learning files are available to assigned students and admins" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'iv-learning-content' AND (
    public.has_role(auth.uid(), 'admin') OR EXISTS (
      SELECT 1 FROM public.content_items ci JOIN public.student_modules sm ON sm.module_id = ci.module_id
      WHERE ci.storage_path = name AND ci.is_hidden = FALSE AND ci.deleted_at IS NULL AND sm.student_id = auth.uid()
    )
  )
);
CREATE POLICY "Admins upload learning files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'iv-learning-content' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update learning files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'iv-learning-content' AND public.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'iv-learning-content' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins remove learning files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'iv-learning-content' AND public.has_role(auth.uid(), 'admin'));

COMMENT ON COLUMN public.profiles.role IS 'Display label synchronized to the protected user_roles authorization table; user_roles is authoritative for permissions.';