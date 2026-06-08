-- scan_jobs: durable user-scoped scan lifecycle mirror
-- scanned_cards: extracted contact fields (1:1 with completed scan_jobs)

CREATE TABLE public.scan_jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  image_gcs_uri text NOT NULL,
  raw_ocr_text text,
  error text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE INDEX idx_scan_jobs_user_created_at
  ON public.scan_jobs (user_id, created_at DESC);

CREATE INDEX idx_scan_jobs_user_status
  ON public.scan_jobs (user_id, status);

CREATE TABLE public.scanned_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid NOT NULL UNIQUE REFERENCES public.scan_jobs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text,
  company text,
  title text,
  phone text,
  email text,
  website text,
  address text,
  business_category text,
  others text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scanned_cards_user_created_at
  ON public.scanned_cards (user_id, created_at DESC);

ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanned_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY scan_jobs_select_own
  ON public.scan_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY scanned_cards_select_own
  ON public.scanned_cards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Backend mirrors via PostgREST with the service_role key (bypasses RLS but still needs GRANTs).
GRANT SELECT, INSERT, UPDATE ON public.scan_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.scanned_cards TO service_role;
