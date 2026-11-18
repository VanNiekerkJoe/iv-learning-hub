CREATE TYPE public.registration_status AS ENUM ('draft', 'pending', 'approved', 'rejected');
CREATE TYPE public.registration_payment_plan AS ENUM ('once_off', 'monthly');

CREATE TABLE public.student_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status public.registration_status NOT NULL DEFAULT 'draft',
  submission_token_hash text NOT NULL,
  full_names text NOT NULL,
  surname text NOT NULL,
  cell_phone text NOT NULL,
  south_african_id_number text,
  passport_number text,
  passport_country text,
  gender text NOT NULL,
  ethnicity text NOT NULL,
  home_language text NOT NULL,
  full_home_address text NOT NULL,
  province text NOT NULL,
  postal_code text NOT NULL,
  email text NOT NULL,
  passed_grade_12 boolean NOT NULL,
  qualification_name text NOT NULL,
  employed_at_real_estate_company boolean NOT NULL,
  real_estate_company text NOT NULL DEFAULT '',
  payment_plan public.registration_payment_plan NOT NULL,
  id_document_path text NOT NULL,
  id_document_name text NOT NULL,
  education_document_path text NOT NULL,
  education_document_name text NOT NULL,
  payment_proof_path text NOT NULL,
  payment_proof_name text NOT NULL,
  declaration_accepted boolean NOT NULL,
  signature_name text NOT NULL,
  signature_date date NOT NULL,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  review_notes text NOT NULL DEFAULT '',
  student_profile_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registration_identity_check CHECK (
    (south_african_id_number IS NOT NULL AND south_african_id_number <> '')
    OR (passport_number IS NOT NULL AND passport_number <> '')
  ),
  CONSTRAINT registration_passport_country_check CHECK (
    passport_number IS NULL OR passport_number = '' OR NULLIF(passport_country, '') IS NOT NULL
  ),
  CONSTRAINT registration_company_check CHECK (
    NOT employed_at_real_estate_company OR real_estate_company <> ''
  )
);

CREATE INDEX student_registrations_status_created_idx
  ON public.student_registrations(status, created_at DESC);
CREATE INDEX student_registrations_email_idx
  ON public.student_registrations(lower(email));

ALTER TABLE public.student_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read student registrations"
  ON public.student_registrations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage student registrations"
  ON public.student_registrations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_registrations TO authenticated;
GRANT ALL ON public.student_registrations TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-registration-documents',
  'student-registration-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Admins can read registration documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-registration-documents'
    AND public.has_role(auth.uid(), 'admin')
  );
