ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'actif',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.perform_transfer(_from_site uuid, _to_site uuid, _product_id uuid, _quantity_units numeric, _unit_price numeric, _note text)
 RETURNS transfers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    ON CONFLICT (product_id, site_id) DO UPDATE SET stock_units = product_stocks.stock_units + _quantity_units;

  num := public.next_document_number('transfert');
  INSERT INTO public.transfers (number, from_site_id, to_site_id, product_id, quantity_units, unit_price, note, user_id)
  VALUES (num, _from_site, _to_site, _product_id, _quantity_units, COALESCE(_unit_price,0), _note, auth.uid())
  RETURNING * INTO t;

  INSERT INTO public.invoices (number, kind, client_name, amount, transfer_id, site_id, user_id)
  VALUES (num, 'transfert', NULL, COALESCE(_unit_price,0) * _quantity_units, t.id, _from_site, auth.uid());

  RETURN t;
END; $function$;

CREATE OR REPLACE FUNCTION public.apply_stock_count(_site_id uuid, _product_id uuid, _counted numeric, _note text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE expected numeric; diff numeric;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Action réservée aux administrateurs'; END IF;
  IF _site_id IS NULL THEN RAISE EXCEPTION 'Choisissez un point de vente précis'; END IF;
  IF _counted IS NULL OR _counted < 0 THEN RAISE EXCEPTION 'Quantité comptée invalide'; END IF;

  INSERT INTO public.product_stocks (product_id, site_id, stock_units)
  VALUES (_product_id, _site_id, 0)
  ON CONFLICT (product_id, site_id) DO NOTHING;

  SELECT stock_units INTO expected FROM public.product_stocks WHERE product_id = _product_id AND site_id = _site_id;
  diff := _counted - COALESCE(expected, 0);

  UPDATE public.product_stocks SET stock_units = _counted
    WHERE product_id = _product_id AND site_id = _site_id;
  UPDATE public.products SET stock_units = GREATEST(stock_units + diff, 0) WHERE id = _product_id;

  INSERT INTO public.stock_audits (product_id, site_id, expected_units, counted_units, difference_units, note, user_id)
  VALUES (_product_id, _site_id, COALESCE(expected,0), _counted, diff, _note, auth.uid());

  RETURN diff;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_invoice_document(_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inv public.invoices; it record; mv public.movements; tr public.transfers; s_site uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Action réservée aux administrateurs'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Document introuvable'; END IF;

  IF inv.kind = 'vente' AND inv.sale_id IS NOT NULL THEN
    SELECT site_id INTO s_site FROM public.sales WHERE id = inv.sale_id;
    FOR it IN SELECT product_id, quantity_units FROM public.sale_items WHERE sale_id = inv.sale_id LOOP
      IF it.product_id IS NOT NULL THEN
        INSERT INTO public.product_stocks (product_id, site_id, stock_units)
        VALUES (it.product_id, s_site, 0)
        ON CONFLICT (product_id, site_id) DO NOTHING;
        UPDATE public.product_stocks SET stock_units = stock_units + it.quantity_units
          WHERE product_id = it.product_id AND site_id = s_site;
        UPDATE public.products SET stock_units = stock_units + it.quantity_units WHERE id = it.product_id;
      END IF;
    END LOOP;
    DELETE FROM public.movements WHERE reference = inv.number AND kind = 'sortie';
    DELETE FROM public.sale_items WHERE sale_id = inv.sale_id;
    DELETE FROM public.invoices WHERE id = inv.id;
    DELETE FROM public.sales WHERE id = inv.sale_id;
    RETURN;
  END IF;

  IF inv.kind = 'entree' AND inv.movement_id IS NOT NULL THEN
    SELECT * INTO mv FROM public.movements WHERE id = inv.movement_id;
    IF mv.id IS NOT NULL THEN
      UPDATE public.product_stocks SET stock_units = GREATEST(stock_units - mv.quantity_units, 0)
        WHERE product_id = mv.product_id AND site_id = mv.site_id;
      UPDATE public.products SET stock_units = GREATEST(stock_units - mv.quantity_units, 0) WHERE id = mv.product_id;
    END IF;
    DELETE FROM public.invoices WHERE id = inv.id;
    DELETE FROM public.movements WHERE id = inv.movement_id;
    RETURN;
  END IF;

  IF inv.kind = 'transfert' AND inv.transfer_id IS NOT NULL THEN
    SELECT * INTO tr FROM public.transfers WHERE id = inv.transfer_id;
    IF tr.id IS NOT NULL THEN
      UPDATE public.product_stocks SET stock_units = stock_units + tr.quantity_units
        WHERE product_id = tr.product_id AND site_id = tr.from_site_id;
      UPDATE public.product_stocks SET stock_units = GREATEST(stock_units - tr.quantity_units, 0)
        WHERE product_id = tr.product_id AND site_id = tr.to_site_id;
    END IF;
    DELETE FROM public.invoices WHERE id = inv.id;
    DELETE FROM public.transfers WHERE id = inv.transfer_id;
    RETURN;
  END IF;

  DELETE FROM public.invoices WHERE id = inv.id;
END; $function$;