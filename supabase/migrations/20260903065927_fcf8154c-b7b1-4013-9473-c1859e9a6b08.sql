DROP POLICY IF EXISTS salaries_read ON public.salaries;
CREATE POLICY salaries_read ON public.salaries
FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR (public.in_my_company(company_id) AND public.is_admin(auth.uid()))
);

DROP POLICY IF EXISTS savings_read ON public.savings_accounts;
CREATE POLICY savings_read ON public.savings_accounts
FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR (public.in_my_company(company_id) AND public.is_admin(auth.uid()))
);

DROP POLICY IF EXISTS savings_tx_read ON public.savings_transactions;
CREATE POLICY savings_tx_read ON public.savings_transactions
FOR SELECT TO authenticated
USING (
  employee_id = auth.uid()
  OR (public.in_my_company(company_id) AND public.is_admin(auth.uid()))
);