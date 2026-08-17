ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

CREATE TABLE public.error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind text NOT NULL DEFAULT 'vente',
  target_id uuid,
  target_label text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'ouvert',
  resolved_by uuid REFERENCES auth.users(id),
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.error_reports TO authenticated;
GRANT ALL ON public.error_reports TO service_role;

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_read ON public.error_reports FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY reports_insert ON public.error_reports FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY reports_update ON public.error_reports FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY reports_delete ON public.error_reports FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_reports_touch BEFORE UPDATE ON public.error_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();