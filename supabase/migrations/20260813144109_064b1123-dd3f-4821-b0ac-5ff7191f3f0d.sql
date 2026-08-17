-- ROLES
CREATE TYPE public.app_role AS ENUM ('employe', 'admin', 'superadmin');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  login_id text,
  phone text,
  base_salary numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','superadmin'))
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_user boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO first_user;
  INSERT INTO public.profiles (id, full_name, login_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'login_id', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN first_user THEN 'superadmin'::public.app_role ELSE 'employe'::public.app_role END);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'superadmin'));

CREATE POLICY "roles_read" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_admin_write" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "roles_admin_update" ON public.user_roles FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text,
  category text,
  retail_unit text NOT NULL DEFAULT 'Unité',
  wholesale_unit text NOT NULL DEFAULT 'Lot',
  units_per_package numeric NOT NULL DEFAULT 1 CHECK (units_per_package > 0),
  cost_price numeric NOT NULL DEFAULT 0,
  retail_price numeric NOT NULL DEFAULT 0,
  wholesale_price numeric NOT NULL DEFAULT 0,
  stock_units numeric NOT NULL DEFAULT 0,
  min_stock_units numeric NOT NULL DEFAULT 0,
  sale_mode text NOT NULL DEFAULT 'both' CHECK (sale_mode IN ('detail','gros','both')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_products_touch BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "products_read" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_write" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "products_update" ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "products_delete" ON public.products FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- MOVEMENTS
CREATE TABLE public.movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('entree','sortie')),
  mode text NOT NULL DEFAULT 'detail' CHECK (mode IN ('detail','gros')),
  quantity numeric NOT NULL,
  quantity_units numeric NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  reason text,
  reference text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movements TO authenticated;
GRANT ALL ON public.movements TO service_role;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movements_read" ON public.movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "movements_insert" ON public.movements FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "movements_update" ON public.movements FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "movements_delete" ON public.movements FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- SALES
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  client_name text,
  total numeric NOT NULL DEFAULT 0,
  paid numeric NOT NULL DEFAULT 0,
  note text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_read" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_insert" ON public.sales FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sales_update" ON public.sales FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "sales_delete" ON public.sales FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  mode text NOT NULL DEFAULT 'detail' CHECK (mode IN ('detail','gros')),
  unit_label text NOT NULL DEFAULT '',
  quantity numeric NOT NULL,
  quantity_units numeric NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_items_read" ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sale_items_insert" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sale_items_delete" ON public.sale_items FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- INVOICES
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('vente','entree')),
  client_name text,
  amount numeric NOT NULL DEFAULT 0,
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  movement_id uuid REFERENCES public.movements(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_read" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- EXPENSES
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  label text,
  amount numeric NOT NULL DEFAULT 0,
  spent_on date NOT NULL DEFAULT CURRENT_DATE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_read" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- LOSSES
CREATE TABLE public.losses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'manque' CHECK (kind IN ('manque','perte')),
  quantity_units numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  period text NOT NULL DEFAULT to_char(CURRENT_DATE,'YYYY-MM'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.losses TO authenticated;
GRANT ALL ON public.losses TO service_role;
ALTER TABLE public.losses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "losses_read" ON public.losses FOR SELECT TO authenticated USING (true);
CREATE POLICY "losses_insert" ON public.losses FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "losses_update" ON public.losses FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "losses_delete" ON public.losses FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- SALARIES
CREATE TABLE public.salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period text NOT NULL,
  base_salary numeric NOT NULL DEFAULT 0,
  bonus numeric NOT NULL DEFAULT 0,
  other_deduction numeric NOT NULL DEFAULT 0,
  losses_deduction numeric NOT NULL DEFAULT 0,
  savings_transfer numeric NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salaries TO authenticated;
GRANT ALL ON public.salaries TO service_role;
ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_salaries_touch BEFORE UPDATE ON public.salaries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "salaries_read" ON public.salaries FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "salaries_insert" ON public.salaries FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "salaries_update" ON public.salaries FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "salaries_delete" ON public.salaries FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ACTIVITY LOGS
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text,
  action text NOT NULL,
  entity text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs_read" ON public.activity_logs FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "logs_insert" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- STOCK ADJUSTMENTS (Comptes)
CREATE TABLE public.stock_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  expected_units numeric NOT NULL DEFAULT 0,
  counted_units numeric NOT NULL DEFAULT 0,
  difference_units numeric NOT NULL DEFAULT 0,
  note text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_audits TO authenticated;
GRANT ALL ON public.stock_audits TO service_role;
ALTER TABLE public.stock_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audits_read" ON public.stock_audits FOR SELECT TO authenticated USING (true);
CREATE POLICY "audits_insert" ON public.stock_audits FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "audits_delete" ON public.stock_audits FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- SAVINGS
CREATE TABLE public.savings_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_accounts TO authenticated;
GRANT ALL ON public.savings_accounts TO service_role;
ALTER TABLE public.savings_accounts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_savings_touch BEFORE UPDATE ON public.savings_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "savings_read" ON public.savings_accounts FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "savings_insert" ON public.savings_accounts FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "savings_update" ON public.savings_accounts FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "savings_delete" ON public.savings_accounts FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'superadmin'));

CREATE TABLE public.savings_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.savings_accounts(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('depot','retrait')),
  amount numeric NOT NULL CHECK (amount > 0),
  source text NOT NULL DEFAULT 'manuel',
  status text NOT NULL DEFAULT 'valide' CHECK (status IN ('en_attente','valide','refuse')),
  note text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_transactions TO authenticated;
GRANT ALL ON public.savings_transactions TO service_role;
ALTER TABLE public.savings_transactions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_savings_tx_touch BEFORE UPDATE ON public.savings_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "savings_tx_read" ON public.savings_transactions FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "savings_tx_insert" ON public.savings_transactions FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid())) OR (employee_id = auth.uid() AND kind = 'retrait' AND status = 'en_attente'));
CREATE POLICY "savings_tx_update" ON public.savings_transactions FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "savings_tx_delete" ON public.savings_transactions FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- SETTINGS
CREATE TABLE public.app_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name text NOT NULL DEFAULT 'Ma Boutique',
  address text,
  phone text,
  currency text NOT NULL DEFAULT 'FCFA',
  invoice_prefix text NOT NULL DEFAULT 'FV',
  entry_prefix text NOT NULL DEFAULT 'BE',
  footer_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_settings_touch BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "settings_read" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_update" ON public.app_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "settings_insert" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.app_settings (id) VALUES (1);

-- Numbering helper
CREATE SEQUENCE public.invoice_seq START 1;
CREATE SEQUENCE public.entry_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE public.invoice_seq TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.entry_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.next_document_number(_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p text; n bigint;
BEGIN
  IF _kind = 'entree' THEN
    SELECT entry_prefix INTO p FROM public.app_settings WHERE id = 1;
    n := nextval('public.entry_seq');
  ELSE
    SELECT invoice_prefix INTO p FROM public.app_settings WHERE id = 1;
    n := nextval('public.invoice_seq');
  END IF;
  RETURN COALESCE(p,'FV') || '-' || to_char(now(),'YYYY') || '-' || lpad(n::text, 5, '0');
END; $$;

-- Stock update on movement
CREATE OR REPLACE FUNCTION public.apply_movement_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'entree' THEN
    UPDATE public.products SET stock_units = stock_units + NEW.quantity_units WHERE id = NEW.product_id;
  ELSE
    UPDATE public.products SET stock_units = stock_units - NEW.quantity_units WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_movement_stock AFTER INSERT ON public.movements
FOR EACH ROW EXECUTE FUNCTION public.apply_movement_stock();