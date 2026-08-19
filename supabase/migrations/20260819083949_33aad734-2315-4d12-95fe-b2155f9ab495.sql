DELETE FROM public.user_sites WHERE site_id IN (SELECT id FROM public.sites WHERE company_id = (SELECT id FROM public.companies WHERE slug='test-patron-sarl'));
DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM public.profiles WHERE login_id='patron.test');
DELETE FROM public.app_settings WHERE company_id = (SELECT id FROM public.companies WHERE slug='test-patron-sarl');
DELETE FROM public.sites WHERE company_id = (SELECT id FROM public.companies WHERE slug='test-patron-sarl');
DELETE FROM public.profiles WHERE login_id='test-patron-none';
DELETE FROM auth.users WHERE id IN (SELECT id FROM public.profiles WHERE login_id='patron.test');
DELETE FROM public.companies WHERE slug='test-patron-sarl';