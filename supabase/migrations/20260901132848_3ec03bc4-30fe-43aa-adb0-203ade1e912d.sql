INSERT INTO public.user_roles (user_id, role)
VALUES ('65a9eb9c-cb50-4284-96c9-df8d313ae646', 'superadmin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles
WHERE user_id = '65a9eb9c-cb50-4284-96c9-df8d313ae646'
  AND role = 'admin'::public.app_role;