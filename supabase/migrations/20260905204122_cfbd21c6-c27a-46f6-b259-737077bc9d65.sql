ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_number_key;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_kind_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_kind_check CHECK (kind = ANY (ARRAY['vente'::text,'entree'::text,'transfert'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_number_key ON public.invoices (company_id, number);

CREATE OR REPLACE FUNCTION public.next_document_number(_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE p text; n bigint; cid uuid; yr text; pat text;
BEGIN
  cid := public.current_company_id();
  yr := to_char(now(),'YYYY');
  IF _kind = 'entree' THEN
    SELECT entry_prefix INTO p FROM public.app_settings WHERE company_id = cid;
    p := COALESCE(p,'BE');
  ELSIF _kind = 'transfert' THEN
    SELECT transfer_prefix INTO p FROM public.app_settings WHERE company_id = cid;
    p := COALESCE(p,'BT');
  ELSE
    SELECT invoice_prefix INTO p FROM public.app_settings WHERE company_id = cid;
    p := COALESCE(p,'FV');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(COALESCE(cid::text,'none') || ':' || p || ':' || yr));

  pat := p || '-' || yr || '-%';
  SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '^.*-', ''), '')::bigint), 0) + 1
    INTO n
  FROM public.invoices
  WHERE (cid IS NULL OR company_id = cid)
    AND number LIKE pat
    AND regexp_replace(number, '^.*-', '') ~ '^[0-9]+$';

  RETURN p || '-' || yr || '-' || lpad(n::text, 5, '0');
END;
$$;