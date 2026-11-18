CREATE TABLE public.content_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  parent_folder_id UUID REFERENCES public.content_folders(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_folders_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT content_folders_parent_same_module CHECK (
    parent_folder_id IS NULL OR parent_folder_id <> id
  )
);

ALTER TABLE public.content_items
  ADD COLUMN folder_id UUID REFERENCES public.content_folders(id) ON DELETE SET NULL;

CREATE INDEX content_folders_module_idx ON public.content_folders(module_id, position);
CREATE INDEX content_folders_parent_idx ON public.content_folders(parent_folder_id, position);
CREATE INDEX content_items_folder_idx ON public.content_items(folder_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_folders TO authenticated;
GRANT ALL ON public.content_folders TO service_role;

ALTER TABLE public.content_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assigned students can read module folders"
  ON public.content_folders
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.student_modules sm
      WHERE sm.student_id = auth.uid()
        AND sm.module_id = content_folders.module_id
    )
  );

CREATE POLICY "Admins manage content folders"
  ON public.content_folders
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Students can view published content in assigned modules"
  ON public.content_items;

CREATE POLICY "Students can view published content in assigned modules"
  ON public.content_items
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      is_hidden = FALSE
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.student_modules sm
        WHERE sm.student_id = auth.uid()
          AND sm.module_id = content_items.module_id
      )
    )
  );
