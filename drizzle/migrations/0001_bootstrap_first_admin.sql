ALTER TABLE public.access_logs ADD COLUMN ip TEXT NOT NULL DEFAULT '';
CREATE INDEX progress_content_idx ON public.progress(content_id);
CREATE INDEX access_logs_content_idx ON public.access_logs(content_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT _user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = _role) $$;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_learning_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE assigned_name TEXT;
BEGIN
  assigned_name := COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''), split_part(COALESCE(NEW.email, 'Student'), '@', 1));
  INSERT INTO public.profiles (id, full_name, student_id, role)
  VALUES (NEW.id, assigned_name, 'IV-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8)), 'student')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_learning_user() FROM PUBLIC, anon, authenticated;