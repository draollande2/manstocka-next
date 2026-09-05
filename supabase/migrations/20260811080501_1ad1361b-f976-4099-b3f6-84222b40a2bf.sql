-- 1. Rôles : suppression du super-administrateur
UPDATE public.user_roles SET role = 'admin' WHERE role = 'superadmin';
DELETE FROM public.user_roles a USING public.user_roles b
  WHERE a.user_id = b.user_id AND a.role = b.role AND a.ctid > b.ctid;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE first_user boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO first_user;
  INSERT INTO public.profiles (id, full_name, login_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'login_id', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN first_user THEN 'admin'::public.app_role ELSE 'employe'::public.app_role END);
  RETURN NEW;
END; $$;

-- 2. Points de vente
CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'boutique',
  address text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites TO authenticated;
GRANT ALL ON public.sites TO service_role;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_sites_touch BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.sites (name, kind) VALUES ('Principal', 'boutique');

-- 3. Affectations
CREATE TABLE public.user_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, site_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sites TO authenticated;
GRANT ALL ON public.user_sites TO service_role;
ALTER TABLE public.user_sites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ADD COLUMN default_site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
UPDATE public.profiles SET default_site_id = (SELECT id FROM public.sites LIMIT 1);

CREATE OR REPLACE FUNCTION public.has_site_access(_user_id uuid, _site_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_admin(_user_id)
     OR _site_id IS NULL
     OR EXISTS (SELECT 1 FROM public.user_sites WHERE user_id = _user_id AND site_id = _site_id)
$$;

CREATE POLICY "sites_select" ON public.sites FOR SELECT TO authenticated USING (true);
CREATE POLICY "sites_write" ON public.sites FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "user_sites_select" ON public.user_sites FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "user_sites_write" ON public.user_sites FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 4. Stock par point de vente
CREATE TABLE public.product_stocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  stock_units numeric NOT NULL DEFAULT 0,
  min_stock_units numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, site_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_stocks TO authenticated;
GRANT ALL ON public.product_stocks TO service_role;
ALTER TABLE public.product_stocks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_product_stocks_touch BEFORE UPDATE ON public.product_stocks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "product_stocks_select" ON public.product_stocks FOR SELECT TO authenticated
  USING (public.has_site_access(auth.uid(), site_id));
CREATE POLICY "product_stocks_insert" ON public.product_stocks FOR INSERT TO authenticated
  WITH CHECK (public.has_site_access(auth.uid(), site_id));
CREATE POLICY "product_stocks_update" ON public.product_stocks FOR UPDATE TO authenticated
  USING (public.has_site_access(auth.uid(), site_id)) WITH CHECK (public.has_site_access(auth.uid(), site_id));
CREATE POLICY "product_stocks_delete" ON public.product_stocks FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

INSERT INTO public.product_stocks (product_id, site_id, stock_units, min_stock_units)
SELECT p.id, (SELECT id FROM public.sites LIMIT 1), p.stock_units, p.min_stock_units FROM public.products p;

-- 5. site_id sur les tables opérationnelles
ALTER TABLE public.movements ADD COLUMN site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD COLUMN site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.losses ADD COLUMN site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.stock_audits ADD COLUMN site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;

UPDATE public.movements SET site_id = (SELECT id FROM public.sites LIMIT 1);
UPDATE public.sales SET site_id = (SELECT id FROM public.sites LIMIT 1);
UPDATE public.invoices SET site_id = (SELECT id FROM public.sites LIMIT 1);
UPDATE public.expenses SET site_id = (SELECT id FROM public.sites LIMIT 1);
UPDATE public.losses SET site_id = (SELECT id FROM public.sites LIMIT 1);
UPDATE public.stock_audits SET site_id = (SELECT id FROM public.sites LIMIT 1);

-- 6. Trigger stock : applique le mouvement sur le point de vente
CREATE OR REPLACE FUNCTION public.apply_movement_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s uuid;
BEGIN
  s := COALESCE(NEW.site_id, (SELECT id FROM public.sites ORDER BY created_at LIMIT 1));
  INSERT INTO public.product_stocks (product_id, site_id, stock_units)
  VALUES (NEW.product_id, s, 0)
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

-- 7. Transferts inter-boutiques
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS transfer_prefix text NOT NULL DEFAULT 'BT';
CREATE SEQUENCE IF NOT EXISTS public.transfer_seq;

CREATE TABLE public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL,
  from_site_id uuid NOT NULL REFERENCES public.sites(id),
  to_site_id uuid NOT NULL REFERENCES public.sites(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity_units numeric NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  note text,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfers_select" ON public.transfers FOR SELECT TO authenticated
  USING (public.has_site_access(auth.uid(), from_site_id) OR public.has_site_access(auth.uid(), to_site_id));
CREATE POLICY "transfers_insert" ON public.transfers FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_site_access(auth.uid(), from_site_id));
CREATE POLICY "transfers_delete" ON public.transfers FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

ALTER TABLE public.invoices ADD COLUMN transfer_id uuid REFERENCES public.transfers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.next_document_number(_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p text; n bigint;
BEGIN
  IF _kind = 'entree' THEN
    SELECT entry_prefix INTO p FROM public.app_settings WHERE id = 1;
    n := nextval('public.entry_seq');
  ELSIF _kind = 'transfert' THEN
    SELECT transfer_prefix INTO p FROM public.app_settings WHERE id = 1;
    n := nextval('public.transfer_seq');
  ELSE
    SELECT invoice_prefix INTO p FROM public.app_settings WHERE id = 1;
    n := nextval('public.invoice_seq');
  END IF;
  RETURN COALESCE(p,'FV') || '-' || to_char(now(),'YYYY') || '-' || lpad(n::text, 5, '0');
END; $$;

-- Transfert atomique
CREATE OR REPLACE FUNCTION public.perform_transfer(
  _from_site uuid, _to_site uuid, _product_id uuid, _quantity_units numeric, _unit_price numeric, _note text
) RETURNS public.transfers LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.transfers; num text; available numeric;
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.has_site_access(auth.uid(), _from_site)) THEN
    RAISE EXCEPTION 'Accès refusé sur le point de départ';
  END IF;
  IF _from_site = _to_site THEN RAISE EXCEPTION 'Les deux points de vente doivent être différents'; END IF;
  IF _quantity_units IS NULL OR _quantity_units <= 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;

  SELECT stock_units INTO available FROM public.product_stocks WHERE product_id = _product_id AND site_id = _from_site;
  IF COALESCE(available,0) < _quantity_units THEN RAISE EXCEPTION 'Stock insuffisant dans le point de départ'; END IF;

  UPDATE public.product_stocks SET stock_units = stock_units - _quantity_units
    WHERE product_id = _product_id AND site_id = _from_site;
  INSERT INTO public.product_stocks (product_id, site_id, stock_units)
    VALUES (_product_id, _to_site, _quantity_units)
    ON CONFLICT (product_id, site_id) DO UPDATE SET stock_units = public.product_stocks.stock_units + _quantity_units;

  num := public.next_document_number('transfert');
  INSERT INTO public.transfers (number, from_site_id, to_site_id, product_id, quantity_units, unit_price, note, user_id)
  VALUES (num, _from_site, _to_site, _product_id, _quantity_units, COALESCE(_unit_price,0), _note, auth.uid())
  RETURNING * INTO t;

  INSERT INTO public.invoices (number, kind, client_name, amount, transfer_id, site_id, user_id)
  VALUES (num, 'transfert', NULL, COALESCE(_unit_price,0) * _quantity_units, t.id, _from_site, auth.uid());

  RETURN t;
END; $$;

REVOKE ALL ON FUNCTION public.perform_transfer(uuid,uuid,uuid,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perform_transfer(uuid,uuid,uuid,numeric,numeric,text) TO authenticated;