
-- Movements: allow admin correction / deletion with stock reversal
CREATE OR REPLACE FUNCTION public.update_movement(
  _id uuid, _mode text, _quantity numeric, _unit_price numeric, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.movements; s uuid; new_units numeric; upp numeric;
BEGIN
  SELECT * INTO m FROM public.movements WHERE id = _id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Mouvement introuvable'; END IF;
  IF NOT (public.in_my_company(m.company_id) AND public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;

  SELECT COALESCE(units_per_package,1) INTO upp FROM public.products WHERE id = m.product_id;
  new_units := _quantity * (CASE WHEN _mode = 'gros' THEN COALESCE(upp,1) ELSE 1 END);

  s := COALESCE(m.site_id, (SELECT id FROM public.sites WHERE company_id = m.company_id ORDER BY created_at LIMIT 1));

  -- reverse old effect
  IF m.kind = 'entree' THEN
    UPDATE public.product_stocks SET stock_units = stock_units - m.quantity_units WHERE product_id = m.product_id AND site_id = s;
    UPDATE public.products SET stock_units = stock_units - m.quantity_units WHERE id = m.product_id;
  ELSE
    UPDATE public.product_stocks SET stock_units = stock_units + m.quantity_units WHERE product_id = m.product_id AND site_id = s;
    UPDATE public.products SET stock_units = stock_units + m.quantity_units WHERE id = m.product_id;
  END IF;

  -- apply new effect
  IF m.kind = 'entree' THEN
    UPDATE public.product_stocks SET stock_units = stock_units + new_units WHERE product_id = m.product_id AND site_id = s;
    UPDATE public.products SET stock_units = stock_units + new_units WHERE id = m.product_id;
  ELSE
    UPDATE public.product_stocks SET stock_units = stock_units - new_units WHERE product_id = m.product_id AND site_id = s;
    UPDATE public.products SET stock_units = stock_units - new_units WHERE id = m.product_id;
  END IF;

  UPDATE public.movements
     SET mode = _mode, quantity = _quantity, quantity_units = new_units,
         unit_price = COALESCE(_unit_price, 0), reason = NULLIF(btrim(COALESCE(_reason,'')), '')
   WHERE id = _id;

  UPDATE public.invoices
     SET amount = COALESCE(_unit_price,0) * new_units,
         client_name = COALESCE(NULLIF(btrim(COALESCE(_reason,'')), ''), client_name)
   WHERE movement_id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_movement(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.movements; s uuid;
BEGIN
  SELECT * INTO m FROM public.movements WHERE id = _id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Mouvement introuvable'; END IF;
  IF NOT (public.in_my_company(m.company_id) AND public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  s := COALESCE(m.site_id, (SELECT id FROM public.sites WHERE company_id = m.company_id ORDER BY created_at LIMIT 1));

  IF m.kind = 'entree' THEN
    UPDATE public.product_stocks SET stock_units = stock_units - m.quantity_units WHERE product_id = m.product_id AND site_id = s;
    UPDATE public.products SET stock_units = stock_units - m.quantity_units WHERE id = m.product_id;
  ELSE
    UPDATE public.product_stocks SET stock_units = stock_units + m.quantity_units WHERE product_id = m.product_id AND site_id = s;
    UPDATE public.products SET stock_units = stock_units + m.quantity_units WHERE id = m.product_id;
  END IF;

  DELETE FROM public.invoices WHERE movement_id = _id;
  DELETE FROM public.movements WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_transfer(_id uuid, _quantity_units numeric, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.transfers; diff numeric; available numeric;
BEGIN
  SELECT * INTO t FROM public.transfers WHERE id = _id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Transfert introuvable'; END IF;
  IF NOT (public.in_my_company(t.company_id) AND public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF _quantity_units IS NULL OR _quantity_units <= 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;

  diff := _quantity_units - t.quantity_units;
  IF diff > 0 THEN
    SELECT stock_units INTO available FROM public.product_stocks WHERE product_id = t.product_id AND site_id = t.from_site_id;
    IF COALESCE(available,0) < diff THEN RAISE EXCEPTION 'Stock insuffisant dans le point de départ'; END IF;
  ELSE
    SELECT stock_units INTO available FROM public.product_stocks WHERE product_id = t.product_id AND site_id = t.to_site_id;
    IF COALESCE(available,0) < -diff THEN RAISE EXCEPTION 'Stock insuffisant dans le point d''arrivée'; END IF;
  END IF;

  UPDATE public.product_stocks SET stock_units = stock_units - diff WHERE product_id = t.product_id AND site_id = t.from_site_id;
  UPDATE public.product_stocks SET stock_units = stock_units + diff WHERE product_id = t.product_id AND site_id = t.to_site_id;

  UPDATE public.transfers SET quantity_units = _quantity_units, note = NULLIF(btrim(COALESCE(_note,'')), '') WHERE id = _id;
  UPDATE public.invoices SET amount = COALESCE(t.unit_price,0) * _quantity_units WHERE transfer_id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_transfer(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.transfers; available numeric;
BEGIN
  SELECT * INTO t FROM public.transfers WHERE id = _id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Transfert introuvable'; END IF;
  IF NOT (public.in_my_company(t.company_id) AND public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT stock_units INTO available FROM public.product_stocks WHERE product_id = t.product_id AND site_id = t.to_site_id;
  IF COALESCE(available,0) < t.quantity_units THEN
    RAISE EXCEPTION 'Annulation impossible : le stock du point d''arrivée est insuffisant';
  END IF;

  UPDATE public.product_stocks SET stock_units = stock_units - t.quantity_units WHERE product_id = t.product_id AND site_id = t.to_site_id;
  UPDATE public.product_stocks SET stock_units = stock_units + t.quantity_units WHERE product_id = t.product_id AND site_id = t.from_site_id;

  DELETE FROM public.invoices WHERE transfer_id = _id;
  DELETE FROM public.transfers WHERE id = _id;
END; $$;

REVOKE ALL ON FUNCTION public.update_movement(uuid, text, numeric, numeric, text) FROM public;
REVOKE ALL ON FUNCTION public.delete_movement(uuid) FROM public;
REVOKE ALL ON FUNCTION public.update_transfer(uuid, numeric, text) FROM public;
REVOKE ALL ON FUNCTION public.delete_transfer(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.update_movement(uuid, text, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_movement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_transfer(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_transfer(uuid) TO authenticated;
