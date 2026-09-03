DROP POLICY IF EXISTS salaries_read ON public.salaries;
CREATE POLICY salaries_read ON public.salaries FOR SELECT TO authenticated
  USING (in_my_company(company_id) AND is_admin(auth.uid()));

DROP POLICY IF EXISTS savings_read ON public.savings_accounts;
CREATE POLICY savings_read ON public.savings_accounts FOR SELECT TO authenticated
  USING (in_my_company(company_id) AND is_admin(auth.uid()));

DROP POLICY IF EXISTS savings_tx_read ON public.savings_transactions;
CREATE POLICY savings_tx_read ON public.savings_transactions FOR SELECT TO authenticated
  USING (in_my_company(company_id) AND is_admin(auth.uid()));

DROP POLICY IF EXISTS savings_update ON public.savings_accounts;
CREATE POLICY savings_update ON public.savings_accounts FOR UPDATE TO authenticated
  USING (in_my_company(company_id) AND is_admin(auth.uid()))
  WITH CHECK (in_my_company(company_id) AND is_admin(auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS app_settings_company_id_key ON public.app_settings (company_id);