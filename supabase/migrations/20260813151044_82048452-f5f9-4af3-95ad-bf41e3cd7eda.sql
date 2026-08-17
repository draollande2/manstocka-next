-- 1. COMPANIES
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  address text,
  phone text,
  email text,
  currency text NOT NULL DEFAULT 'F CFA',
  status text NOT NULL DEFAULT 'actif',
  max_sites integer NOT NULL DEFAULT 2,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_companies_touch BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.companies (id, name, slug, currency, max_sites)
VALUES ('11111111-1111-4111-8111-111111111111', 'Boinzemwende SARL', 'boinzemwende', 'F CFA', 5);

-- 2. COMPANY COLUMNS
ALTER TABLE public.sites ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.product_stocks ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.movements ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.sales ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.sale_items ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.losses ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.salaries ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.transfers ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.stock_audits ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.savings_accounts ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.savings_transactions ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.activity_logs ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.error_reports ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.user_sites ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.app_settings ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.sites SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.profiles SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.products SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.product_stocks SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.movements SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.sales SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.sale_items SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.invoices SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.expenses SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.losses SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.salaries SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.transfers SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.stock_audits SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.savings_accounts SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.savings_transactions SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.activity_logs SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.error_reports SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.user_sites SET company_id = '11111111-1111-4111-8111-111111111111';
UPDATE public.app_settings SET company_id = '11111111-1111-4111-8111-111111111111', company_name = 'Boinzemwende SARL';
UPDATE public.sites SET name = 'Dépôt SODIBO' WHERE name = 'Cave dépot';

ALTER TABLE public.sites ALTER COLUMN company_id SET NOT NULL;
CREATE UNIQUE INDEX app_settings_company_uidx ON public.app_settings(company_id);
CREATE INDEX sites_company_idx ON public.sites(company_id);
CREATE INDEX products_company_idx ON public.products(company_id);
CREATE INDEX product_stocks_company_idx ON public.product_stocks(company_id);

-- 3. HELPERS
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin')
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.in_my_company(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_superadmin(auth.uid())
      OR (_company_id IS NOT NULL AND _company_id = public.current_company_id())
$$;

CREATE OR REPLACE FUNCTION public.same_company_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_superadmin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.company_id = public.current_company_id())
$$;

-- is_admin excludes superadmin scoping issues but keeps behaviour
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','superadmin'))
$$;

CREATE OR REPLACE FUNCTION public.has_site_access(_user_id uuid, _site_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_superadmin(_user_id)
     OR (
       (_site_id IS NULL OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = _site_id AND s.company_id = public.current_company_id()))
       AND (public.is_admin(_user_id) OR _site_id IS NULL
            OR EXISTS (SELECT 1 FROM public.user_sites us WHERE us.user_id = _user_id AND us.site_id = _site_id))
     )
$$;

-- 4. SITE QUOTA
CREATE OR REPLACE FUNCTION public.enforce_site_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE quota integer; used integer;
BEGIN
  SELECT max_sites INTO quota FROM public.companies WHERE id = NEW.company_id;
  SELECT count(*) INTO used FROM public.sites WHERE company_id = NEW.company_id AND deleted_at IS NULL;
  IF quota IS NOT NULL AND used >= quota THEN
    RAISE EXCEPTION 'Quota de points de vente atteint (% autorisés). Contactez le super-administrateur.', quota;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_site_quota BEFORE INSERT ON public.sites FOR EACH ROW EXECUTE FUNCTION public.enforce_site_quota();

-- 5. ANNOUNCEMENTS
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  message text NOT NULL,
  file_url text,
  file_name text,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_announcements_touch BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. BILLING
CREATE TABLE public.company_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period text NOT NULL,
  label text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'F CFA',
  due_date date NOT NULL DEFAULT (now()::date + 30),
  status text NOT NULL DEFAULT 'impayee',
  payment_method text,
  payment_ref text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_invoices TO authenticated;
GRANT ALL ON public.company_invoices TO service_role;
ALTER TABLE public.company_invoices ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_company_invoices_touch BEFORE UPDATE ON public.company_invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. RLS REWRITE
DROP POLICY IF EXISTS logs_insert ON public.activity_logs;
DROP POLICY IF EXISTS logs_read ON public.activity_logs;
CREATE POLICY logs_insert ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY logs_read ON public.activity_logs FOR SELECT TO authenticated USING (user_id = auth.uid() OR (public.in_my_company(company_id) AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS settings_insert ON public.app_settings;
DROP POLICY IF EXISTS settings_read ON public.app_settings;
DROP POLICY IF EXISTS settings_update ON public.app_settings;
CREATE POLICY settings_read ON public.app_settings FOR SELECT TO authenticated USING (public.in_my_company(company_id));
CREATE POLICY settings_insert ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND public.is_admin(auth.uid()));
CREATE POLICY settings_update ON public.app_settings FOR UPDATE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid())) WITH CHECK (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS reports_delete ON public.error_reports;
DROP POLICY IF EXISTS reports_insert ON public.error_reports;
DROP POLICY IF EXISTS reports_read ON public.error_reports;
DROP POLICY IF EXISTS reports_update ON public.error_reports;
CREATE POLICY reports_read ON public.error_reports FOR SELECT TO authenticated USING (user_id = auth.uid() OR (public.in_my_company(company_id) AND public.is_admin(auth.uid())));
CREATE POLICY reports_insert ON public.error_reports FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY reports_update ON public.error_reports FOR UPDATE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid())) WITH CHECK (public.in_my_company(company_id) AND public.is_admin(auth.uid()));
CREATE POLICY reports_delete ON public.error_reports FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS expenses_delete ON public.expenses;
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
DROP POLICY IF EXISTS expenses_read ON public.expenses;
DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_read ON public.expenses FOR SELECT TO authenticated USING (public.in_my_company(company_id));
CREATE POLICY expenses_insert ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND auth.uid() IS NOT NULL);
CREATE POLICY expenses_update ON public.expenses FOR UPDATE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid())) WITH CHECK (public.in_my_company(company_id));
CREATE POLICY expenses_delete ON public.expenses FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS invoices_delete ON public.invoices;
DROP POLICY IF EXISTS invoices_insert ON public.invoices;
DROP POLICY IF EXISTS invoices_read ON public.invoices;
CREATE POLICY invoices_read ON public.invoices FOR SELECT TO authenticated USING (public.in_my_company(company_id));
CREATE POLICY invoices_insert ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND auth.uid() IS NOT NULL);
CREATE POLICY invoices_delete ON public.invoices FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS losses_delete ON public.losses;
DROP POLICY IF EXISTS losses_insert ON public.losses;
DROP POLICY IF EXISTS losses_read ON public.losses;
DROP POLICY IF EXISTS losses_update ON public.losses;
CREATE POLICY losses_read ON public.losses FOR SELECT TO authenticated USING (public.in_my_company(company_id));
CREATE POLICY losses_insert ON public.losses FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND auth.uid() IS NOT NULL);
CREATE POLICY losses_update ON public.losses FOR UPDATE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid())) WITH CHECK (public.in_my_company(company_id));
CREATE POLICY losses_delete ON public.losses FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS movements_delete ON public.movements;
DROP POLICY IF EXISTS movements_insert ON public.movements;
DROP POLICY IF EXISTS movements_read ON public.movements;
DROP POLICY IF EXISTS movements_update ON public.movements;
CREATE POLICY movements_read ON public.movements FOR SELECT TO authenticated USING (public.in_my_company(company_id));
CREATE POLICY movements_insert ON public.movements FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND auth.uid() IS NOT NULL);
CREATE POLICY movements_update ON public.movements FOR UPDATE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid())) WITH CHECK (public.in_my_company(company_id));
CREATE POLICY movements_delete ON public.movements FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS product_stocks_delete ON public.product_stocks;
DROP POLICY IF EXISTS product_stocks_insert ON public.product_stocks;
DROP POLICY IF EXISTS product_stocks_select ON public.product_stocks;
DROP POLICY IF EXISTS product_stocks_update ON public.product_stocks;
CREATE POLICY product_stocks_select ON public.product_stocks FOR SELECT TO authenticated USING (public.in_my_company(company_id));
CREATE POLICY product_stocks_insert ON public.product_stocks FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id));
CREATE POLICY product_stocks_update ON public.product_stocks FOR UPDATE TO authenticated USING (public.in_my_company(company_id)) WITH CHECK (public.in_my_company(company_id));
CREATE POLICY product_stocks_delete ON public.product_stocks FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS products_delete ON public.products;
DROP POLICY IF EXISTS products_read ON public.products;
DROP POLICY IF EXISTS products_update ON public.products;
DROP POLICY IF EXISTS products_write ON public.products;
CREATE POLICY products_read ON public.products FOR SELECT TO authenticated USING (public.in_my_company(company_id));
CREATE POLICY products_write ON public.products FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND public.is_admin(auth.uid()));
CREATE POLICY products_update ON public.products FOR UPDATE TO authenticated USING (public.in_my_company(company_id)) WITH CHECK (public.in_my_company(company_id));
CREATE POLICY products_delete ON public.products FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS profiles_admin_delete ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_read ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.in_my_company(company_id));
CREATE POLICY profiles_admin_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND public.is_admin(auth.uid()));
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR (public.in_my_company(company_id) AND public.is_admin(auth.uid()))) WITH CHECK (id = auth.uid() OR (public.in_my_company(company_id) AND public.is_admin(auth.uid())));
CREATE POLICY profiles_admin_delete ON public.profiles FOR DELETE TO authenticated USING (public.is_superadmin(auth.uid()) OR (public.in_my_company(company_id) AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS salaries_delete ON public.salaries;
DROP POLICY IF EXISTS salaries_insert ON public.salaries;
DROP POLICY IF EXISTS salaries_read ON public.salaries;
DROP POLICY IF EXISTS salaries_update ON public.salaries;
CREATE POLICY salaries_read ON public.salaries FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.in_my_company(company_id));
CREATE POLICY salaries_insert ON public.salaries FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND public.is_admin(auth.uid()));
CREATE POLICY salaries_update ON public.salaries FOR UPDATE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid())) WITH CHECK (public.in_my_company(company_id));
CREATE POLICY salaries_delete ON public.salaries FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS sale_items_delete ON public.sale_items;
DROP POLICY IF EXISTS sale_items_insert ON public.sale_items;
DROP POLICY IF EXISTS sale_items_read ON public.sale_items;
CREATE POLICY sale_items_read ON public.sale_items FOR SELECT TO authenticated USING (public.in_my_company(company_id));
CREATE POLICY sale_items_insert ON public.sale_items FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND auth.uid() IS NOT NULL);
CREATE POLICY sale_items_delete ON public.sale_items FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS sales_delete ON public.sales;
DROP POLICY IF EXISTS sales_insert ON public.sales;
DROP POLICY IF EXISTS sales_read ON public.sales;
DROP POLICY IF EXISTS sales_update ON public.sales;
CREATE POLICY sales_read ON public.sales FOR SELECT TO authenticated USING (public.in_my_company(company_id));
CREATE POLICY sales_insert ON public.sales FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND auth.uid() IS NOT NULL);
CREATE POLICY sales_update ON public.sales FOR UPDATE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid())) WITH CHECK (public.in_my_company(company_id));
CREATE POLICY sales_delete ON public.sales FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS savings_delete ON public.savings_accounts;
DROP POLICY IF EXISTS savings_insert ON public.savings_accounts;
DROP POLICY IF EXISTS savings_read ON public.savings_accounts;
DROP POLICY IF EXISTS savings_update ON public.savings_accounts;
CREATE POLICY savings_read ON public.savings_accounts FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.in_my_company(company_id));
CREATE POLICY savings_insert ON public.savings_accounts FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND auth.uid() IS NOT NULL);
CREATE POLICY savings_update ON public.savings_accounts FOR UPDATE TO authenticated USING (public.in_my_company(company_id)) WITH CHECK (public.in_my_company(company_id));
CREATE POLICY savings_delete ON public.savings_accounts FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS savings_tx_delete ON public.savings_transactions;
DROP POLICY IF EXISTS savings_tx_insert ON public.savings_transactions;
DROP POLICY IF EXISTS savings_tx_read ON public.savings_transactions;
DROP POLICY IF EXISTS savings_tx_update ON public.savings_transactions;
CREATE POLICY savings_tx_read ON public.savings_transactions FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.in_my_company(company_id));
CREATE POLICY savings_tx_insert ON public.savings_transactions FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND auth.uid() IS NOT NULL);
CREATE POLICY savings_tx_update ON public.savings_transactions FOR UPDATE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid())) WITH CHECK (public.in_my_company(company_id));
CREATE POLICY savings_tx_delete ON public.savings_transactions FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS sites_read ON public.sites;
DROP POLICY IF EXISTS sites_write ON public.sites;
DROP POLICY IF EXISTS sites_admin ON public.sites;
CREATE POLICY sites_read ON public.sites FOR SELECT TO authenticated USING (public.in_my_company(company_id));
CREATE POLICY sites_insert ON public.sites FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND public.is_admin(auth.uid()));
CREATE POLICY sites_update ON public.sites FOR UPDATE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid())) WITH CHECK (public.in_my_company(company_id) AND public.is_admin(auth.uid()));
CREATE POLICY sites_delete ON public.sites FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS audits_insert ON public.stock_audits;
DROP POLICY IF EXISTS audits_read ON public.stock_audits;
DROP POLICY IF EXISTS audits_delete ON public.stock_audits;
CREATE POLICY audits_read ON public.stock_audits FOR SELECT TO authenticated USING (public.in_my_company(company_id));
CREATE POLICY audits_insert ON public.stock_audits FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND auth.uid() IS NOT NULL);
CREATE POLICY audits_delete ON public.stock_audits FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS transfers_read ON public.transfers;
DROP POLICY IF EXISTS transfers_insert ON public.transfers;
DROP POLICY IF EXISTS transfers_delete ON public.transfers;
CREATE POLICY transfers_read ON public.transfers FOR SELECT TO authenticated USING (public.in_my_company(company_id));
CREATE POLICY transfers_insert ON public.transfers FOR INSERT TO authenticated WITH CHECK (public.in_my_company(company_id) AND auth.uid() IS NOT NULL);
CREATE POLICY transfers_delete ON public.transfers FOR DELETE TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS roles_read ON public.user_roles;
DROP POLICY IF EXISTS roles_insert ON public.user_roles;
DROP POLICY IF EXISTS roles_update ON public.user_roles;
DROP POLICY IF EXISTS roles_delete ON public.user_roles;
CREATE POLICY roles_read ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.same_company_user(user_id));
CREATE POLICY roles_insert ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.same_company_user(user_id) AND public.is_admin(auth.uid()) AND role <> 'superadmin');
CREATE POLICY roles_update ON public.user_roles FOR UPDATE TO authenticated USING (public.same_company_user(user_id) AND public.is_admin(auth.uid())) WITH CHECK (public.same_company_user(user_id) AND role <> 'superadmin');
CREATE POLICY roles_delete ON public.user_roles FOR DELETE TO authenticated USING (public.same_company_user(user_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS user_sites_read ON public.user_sites;
DROP POLICY IF EXISTS user_sites_write ON public.user_sites;
CREATE POLICY user_sites_read ON public.user_sites FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.in_my_company(company_id));
CREATE POLICY user_sites_write ON public.user_sites FOR ALL TO authenticated USING (public.in_my_company(company_id) AND public.is_admin(auth.uid())) WITH CHECK (public.in_my_company(company_id) AND public.is_admin(auth.uid()));

CREATE POLICY companies_read ON public.companies FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()) OR id = public.current_company_id());
CREATE POLICY companies_insert ON public.companies FOR INSERT TO authenticated WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated USING (public.is_superadmin(auth.uid()) OR (id = public.current_company_id() AND public.is_admin(auth.uid()))) WITH CHECK (public.is_superadmin(auth.uid()) OR id = public.current_company_id());
CREATE POLICY companies_delete ON public.companies FOR DELETE TO authenticated USING (public.is_superadmin(auth.uid()));

CREATE POLICY announcements_read ON public.announcements FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()) OR company_id IS NULL OR company_id = public.current_company_id());
CREATE POLICY announcements_write ON public.announcements FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY company_invoices_read ON public.company_invoices FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()) OR company_id = public.current_company_id());
CREATE POLICY company_invoices_manage ON public.company_invoices FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY company_invoices_pay ON public.company_invoices FOR UPDATE TO authenticated USING (company_id = public.current_company_id() AND public.is_admin(auth.uid())) WITH CHECK (company_id = public.current_company_id());

-- 8. BUSINESS FUNCTIONS (company aware)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_user boolean; cid uuid;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO first_user;
  cid := NULLIF(NEW.raw_user_meta_data->>'company_id','')::uuid;
  INSERT INTO public.profiles (id, full_name, login_id, company_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'login_id', split_part(NEW.email,'@',1)), cid);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE
    WHEN NEW.raw_user_meta_data->>'role' = 'superadmin' THEN 'superadmin'::public.app_role
    WHEN first_user THEN 'admin'::public.app_role
    ELSE 'employe'::public.app_role END);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.next_document_number(_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p text; n bigint; cid uuid;
BEGIN
  cid := public.current_company_id();
  IF _kind = 'entree' THEN
    SELECT entry_prefix INTO p FROM public.app_settings WHERE company_id = cid;
    n := nextval('public.entry_seq');
  ELSIF _kind = 'transfert' THEN
    SELECT transfer_prefix INTO p FROM public.app_settings WHERE company_id = cid;
    n := nextval('public.transfer_seq');
  ELSE
    SELECT invoice_prefix INTO p FROM public.app_settings WHERE company_id = cid;
    n := nextval('public.invoice_seq');
  END IF;
  RETURN COALESCE(p,'FV') || '-' || to_char(now(),'YYYY') || '-' || lpad(n::text, 5, '0');
END; $$;

CREATE OR REPLACE FUNCTION public.apply_movement_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s uuid; cid uuid;
BEGIN
  cid := COALESCE(NEW.company_id, (SELECT company_id FROM public.products WHERE id = NEW.product_id));
  s := COALESCE(NEW.site_id, (SELECT id FROM public.sites WHERE company_id = cid ORDER BY created_at LIMIT 1));
  INSERT INTO public.product_stocks (product_id, site_id, stock_units, company_id)
  VALUES (NEW.product_id, s, 0, cid)
  ON CONFLICT (product_id, site_id) DO NOTHING;

  IF NEW.kind = 'entree' THEN
    UPDATE public.product_stocks SET stock_units = stock_units + NEW.quantity_units
      WHERE product_id = NEW.product_id AND site_id = s;
    UPDATE public.products SET stock_units = stock_units + NEW.quantity_units WHERE id = NEW.product_id;
  ELSE
    UPDATE public.product_stocks SET stock_units = stock_units - NEW.quantity_units
      WHERE product_id = NEW.product_id AND site_id = s;
    UPDATE public.products SET stock_units = stock_units - NEW.quantity_units WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.apply_stock_count(_site_id uuid, _product_id uuid, _counted numeric, _note text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE expected numeric; diff numeric; cid uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Action réservée aux administrateurs'; END IF;
  IF _site_id IS NULL THEN RAISE EXCEPTION 'Choisissez un point de vente précis'; END IF;
  IF _counted IS NULL OR _counted < 0 THEN RAISE EXCEPTION 'Quantité comptée invalide'; END IF;
  SELECT company_id INTO cid FROM public.sites WHERE id = _site_id;
  IF NOT public.in_my_company(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;

  INSERT INTO public.product_stocks (product_id, site_id, stock_units, company_id)
  VALUES (_product_id, _site_id, 0, cid)
  ON CONFLICT (product_id, site_id) DO NOTHING;

  SELECT stock_units INTO expected FROM public.product_stocks WHERE product_id = _product_id AND site_id = _site_id;
  diff := _counted - COALESCE(expected, 0);

  UPDATE public.product_stocks SET stock_units = _counted WHERE product_id = _product_id AND site_id = _site_id;
  UPDATE public.products SET stock_units = GREATEST(stock_units + diff, 0) WHERE id = _product_id;

  INSERT INTO public.stock_audits (product_id, site_id, expected_units, counted_units, difference_units, note, user_id, company_id)
  VALUES (_product_id, _site_id, COALESCE(expected,0), _counted, diff, _note, auth.uid(), cid);

  RETURN diff;
END; $$;

CREATE OR REPLACE FUNCTION public.perform_transfer(_from_site uuid, _to_site uuid, _product_id uuid, _quantity_units numeric, _unit_price numeric, _note text)
RETURNS transfers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.transfers; num text; available numeric; cid uuid; cid2 uuid;
BEGIN
  SELECT company_id INTO cid FROM public.sites WHERE id = _from_site;
  SELECT company_id INTO cid2 FROM public.sites WHERE id = _to_site;
  IF cid IS NULL OR cid <> cid2 THEN RAISE EXCEPTION 'Transfert impossible entre deux entreprises'; END IF;
  IF NOT public.in_my_company(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF NOT (public.is_admin(auth.uid()) OR public.has_site_access(auth.uid(), _from_site)) THEN
    RAISE EXCEPTION 'Accès refusé sur le point de départ';
  END IF;
  IF _from_site = _to_site THEN RAISE EXCEPTION 'Les deux points de vente doivent être différents'; END IF;
  IF _quantity_units IS NULL OR _quantity_units <= 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;

  SELECT stock_units INTO available FROM public.product_stocks WHERE product_id = _product_id AND site_id = _from_site;
  IF COALESCE(available,0) < _quantity_units THEN RAISE EXCEPTION 'Stock insuffisant dans le point de départ'; END IF;

  UPDATE public.product_stocks SET stock_units = stock_units - _quantity_units
    WHERE product_id = _product_id AND site_id = _from_site;

  INSERT INTO public.product_stocks (product_id, site_id, stock_units, company_id)
    VALUES (_product_id, _to_site, _quantity_units, cid)
    ON CONFLICT (product_id, site_id) DO UPDATE SET stock_units = product_stocks.stock_units + _quantity_units;

  num := public.next_document_number('transfert');
  INSERT INTO public.transfers (number, from_site_id, to_site_id, product_id, quantity_units, unit_price, note, user_id, company_id)
  VALUES (num, _from_site, _to_site, _product_id, _quantity_units, COALESCE(_unit_price,0), _note, auth.uid(), cid)
  RETURNING * INTO t;

  INSERT INTO public.invoices (number, kind, client_name, amount, transfer_id, site_id, user_id, company_id)
  VALUES (num, 'transfert', NULL, COALESCE(_unit_price,0) * _quantity_units, t.id, _from_site, auth.uid(), cid);

  RETURN t;
END; $$;

-- 9. AUTO-STAMP company_id on insert
CREATE OR REPLACE FUNCTION public.stamp_company_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_company_id();
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_stamp_products BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_product_stocks BEFORE INSERT ON public.product_stocks FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_movements BEFORE INSERT ON public.movements FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_sales BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_sale_items BEFORE INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_invoices BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_expenses BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_losses BEFORE INSERT ON public.losses FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_salaries BEFORE INSERT ON public.salaries FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_transfers BEFORE INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_stock_audits BEFORE INSERT ON public.stock_audits FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_savings_accounts BEFORE INSERT ON public.savings_accounts FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_savings_tx BEFORE INSERT ON public.savings_transactions FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_activity_logs BEFORE INSERT ON public.activity_logs FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_error_reports BEFORE INSERT ON public.error_reports FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_user_sites BEFORE INSERT ON public.user_sites FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_sites BEFORE INSERT ON public.sites FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();
CREATE TRIGGER trg_stamp_app_settings BEFORE INSERT ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.stamp_company_id();