CREATE SEQUENCE IF NOT EXISTS public.app_settings_id_seq;
SELECT setval('public.app_settings_id_seq', GREATEST((SELECT COALESCE(MAX(id),1) FROM public.app_settings), 1));
ALTER TABLE public.app_settings ALTER COLUMN id SET DEFAULT nextval('public.app_settings_id_seq');
ALTER SEQUENCE public.app_settings_id_seq OWNED BY public.app_settings.id;
GRANT USAGE, SELECT ON SEQUENCE public.app_settings_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.app_settings_id_seq TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS app_settings_company_id_key ON public.app_settings(company_id);