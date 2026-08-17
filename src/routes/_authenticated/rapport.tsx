import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow, StatCard } from "@/components/PageShell";
import { money, qty, periodLabel, periodOptions, currentPeriod } from "@/lib/format";
import { useSite } from "@/hooks/useSite";

export const Route = createFileRoute("/_authenticated/rapport")({
  head: () => ({
    meta: [
      { title: "Rapport mensuel — Stocka" },
      { name: "description", content: "Synthèse mensuelle : ventes, dépenses, pertes, top articles et tendance." },
      { property: "og:title", content: "Rapport mensuel — Stocka" },
      { property: "og:description", content: "Le rapport complet du mois, prêt à imprimer en PDF." },
    ],
  }),
  component: ReportPage,
});

function bounds(period: string) {
  const [y, m] = period.split("-").map(Number);
  return {
    start: new Date(Number(y), Number(m) - 1, 1).toISOString(),
    end: new Date(Number(y), Number(m), 1).toISOString(),
  };
}

function ReportPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const { start, end } = bounds(period);
  const { siteId, siteName, allSites } = useSite();

  const { data } = useQuery({
    queryKey: ["report", period, siteId ?? "all"],
    queryFn: async () => {
      let itemsQ = supabase
        .from("sale_items")
        .select("product_name, quantity_units, line_total, unit_label, created_at, sales!inner(site_id)")
        .gte("created_at", start)
        .lt("created_at", end);
      let expensesQ = supabase
        .from("expenses")
        .select("amount, category")
        .gte("spent_on", start.slice(0, 10))
        .lt("spent_on", end.slice(0, 10));
      let lossesQ = supabase.from("losses").select("amount, kind").eq("period", period);
      if (siteId) {
        itemsQ = itemsQ.eq("sales.site_id", siteId);
        expensesQ = expensesQ.eq("site_id", siteId);
        lossesQ = lossesQ.eq("site_id", siteId);
      }
      const [items, expenses, losses] = await Promise.all([itemsQ, expensesQ, lossesQ]);
      return {
        items: items.data ?? [],
        expenses: expenses.data ?? [],
        losses: losses.data ?? [],
      };
    },
  });

  // Compte d'exploitation du mois (anciennement page « Comptes »)
  const { data: accounts } = useQuery({
    queryKey: ["report-accounts", period, siteId ?? "all"],
    queryFn: async () => {
      let salesQ = supabase.from("sales").select("total, paid").gte("created_at", start).lt("created_at", end);
      let expensesQ = supabase
        .from("expenses")
        .select("amount")
        .gte("spent_on", start.slice(0, 10))
        .lt("spent_on", end.slice(0, 10));
      let purchasesQ = supabase
        .from("movements")
        .select("quantity_units, unit_price")
        .eq("kind", "entree")
        .gte("created_at", start)
        .lt("created_at", end);
      if (siteId) {
        salesQ = salesQ.eq("site_id", siteId);
        expensesQ = expensesQ.eq("site_id", siteId);
        purchasesQ = purchasesQ.eq("site_id", siteId);
      }

      // Employés du point de vente actif pour filtrer salaires & épargne.
      let employeeIds: string[] | null = null;
      if (siteId) {
        const { data: us, error: usErr } = await supabase
          .from("user_sites")
          .select("user_id")
          .eq("site_id", siteId);
        if (usErr) throw usErr;
        employeeIds = (us ?? []).map((r) => r.user_id);
      }

      let salariesQ = supabase
        .from("salaries")
        .select("base_salary, bonus, other_deduction, losses_deduction, savings_transfer, paid, employee_id")
        .eq("period", period);
      let savingsQ = supabase.from("savings_accounts").select("balance, employee_id");
      if (employeeIds) {
        salariesQ = salariesQ.in("employee_id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"]);
        savingsQ = savingsQ.in("employee_id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"]);
      }

      const [sales, expenses, salaries, purchases, savings] = await Promise.all([
        salesQ,
        expensesQ,
        salariesQ,
        purchasesQ,
        savingsQ,
      ]);

      const revenue = (sales.data ?? []).reduce((s, r) => s + Number(r.total), 0);
      const collected = (sales.data ?? []).reduce((s, r) => s + Number(r.paid), 0);
      const expenseTotal = (expenses.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const purchaseTotal = (purchases.data ?? []).reduce(
        (s, r) => s + Number(r.quantity_units) * Number(r.unit_price),
        0,
      );
      const salaryTotal = (salaries.data ?? []).reduce(
        (s, r) =>
          s +
          Number(r.base_salary) +
          Number(r.bonus) -
          Number(r.other_deduction) -
          Number(r.losses_deduction) -
          Number(r.savings_transfer),
        0,
      );
      const savingsTotal = (savings.data ?? []).reduce((s, r) => s + Number(r.balance), 0);

      return { revenue, collected, expenseTotal, purchaseTotal, salaryTotal, savingsTotal };
    },
  });


  const { data: trend } = useQuery({
    queryKey: ["report-trend", siteId ?? "all"],
    queryFn: async () => {
      const periods = periodOptions(6).reverse();
      const out: Array<{ mois: string; ventes: number; depenses: number }> = [];
      for (const p of periods) {
        const b = bounds(p);
        let salesQ = supabase.from("sales").select("total").gte("created_at", b.start).lt("created_at", b.end);
        let expQ = supabase
          .from("expenses")
          .select("amount")
          .gte("spent_on", b.start.slice(0, 10))
          .lt("spent_on", b.end.slice(0, 10));
        if (siteId) {
          salesQ = salesQ.eq("site_id", siteId);
          expQ = expQ.eq("site_id", siteId);
        }
        const [sales, exp] = await Promise.all([salesQ, expQ]);
        out.push({
          mois: periodLabel(p).split(" ")[0] ?? p,
          ventes: (sales.data ?? []).reduce((s, r) => s + Number(r.total), 0),
          depenses: (exp.data ?? []).reduce((s, r) => s + Number(r.amount), 0),
        });
      }
      return out;
    },
  });

  const items = data?.items ?? [];
  const revenue = items.reduce((s, i) => s + Number(i.line_total), 0);
  const expenseTotal = (data?.expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const lossTotal = (data?.losses ?? []).reduce((s, l) => s + Number(l.amount), 0);

  const byProduct = Object.values(
    items.reduce<Record<string, { name: string; units: number; total: number; unit: string }>>(
      (acc, i) => {
        const key = i.product_name;
        const current = acc[key] ?? { name: key, units: 0, total: 0, unit: i.unit_label };
        current.units += Number(i.quantity_units);
        current.total += Number(i.line_total);
        acc[key] = current;
        return acc;
      },
      {},
    ),
  ).sort((a, b) => b.total - a.total);

  const accRevenue = accounts?.revenue ?? 0;
  const accCharges =
    (accounts?.expenseTotal ?? 0) + (accounts?.purchaseTotal ?? 0) + (accounts?.salaryTotal ?? 0);
  const accResult = accRevenue - accCharges;
  const accountLines = [
    { label: "Ventes du mois (facturé)", value: accRevenue, sign: "+" },
    { label: "Ventes encaissées", value: accounts?.collected ?? 0, sign: "=" },
    { label: "Achats de marchandise (entrées)", value: accounts?.purchaseTotal ?? 0, sign: "−" },
    { label: "Dépenses de fonctionnement", value: accounts?.expenseTotal ?? 0, sign: "−" },
    { label: "Salaires nets", value: accounts?.salaryTotal ?? 0, sign: "−" },
  ];

  return (
    <PageShell
      title={`Rapport mensuel — ${allSites ? "Tous les points de vente" : siteName(siteId)}`}
      description={`Synthèse et compte d'exploitation de ${periodLabel(period)} pour ${allSites ? "tous les points de vente" : siteName(siteId)} — imprimez ce rapport en PDF pour vos archives.`}
      actions={
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {periodOptions().map((p) => (
            <option key={p} value={p}>
              {periodLabel(p)}
            </option>
          ))}
        </select>
      }
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Chiffre d'affaires" value={money(revenue)} />
        <StatCard label="Dépenses" value={money(expenseTotal)} />
        <StatCard label="Manques & pertes" value={money(lossTotal)} />
        <StatCard label="Marge brute" value={money(revenue - expenseTotal - lossTotal)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Recettes" value={money(accRevenue)} />
        <StatCard label="Charges totales" value={money(accCharges)} />
        <StatCard
          label="Résultat"
          value={money(accResult)}
          hint={accResult >= 0 ? "Bénéfice" : "Perte"}
        />
        <StatCard label="Épargne collaborateurs" value={money(accounts?.savingsTotal ?? 0)} />
      </div>

      <Panel title="Compte d'exploitation du mois">
        <table className="w-full text-sm">
          <tbody>
            {accountLines.map((l) => (
              <tr key={l.label} className="border-t border-border">
                <td className="px-4 py-2 text-muted-foreground">{l.sign}</td>
                <td className="px-4 py-2">{l.label}</td>
                <td className="px-4 py-2 num text-right">{money(l.value)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-muted/30">
              <td className="px-4 py-3" />
              <td className="px-4 py-3 font-display font-bold">Résultat du mois</td>
              <td className="px-4 py-3 num text-right font-display font-bold">{money(accResult)}</td>
            </tr>
          </tbody>
        </table>
      </Panel>


      <Panel title="Tendance sur 6 mois">
        <div className="h-72 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="mois" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip
                formatter={(v: number) => money(v)}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }}
              />
              <Legend />
              <Bar dataKey="ventes" name="Ventes" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="depenses" name="Dépenses" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Articles les plus vendus">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Article</th>
                <th className="px-4 py-2">Quantité vendue (détail)</th>
                <th className="px-4 py-2">Chiffre d'affaires</th>
                <th className="px-4 py-2">Part</th>
              </tr>
            </thead>
            <tbody>
              {byProduct.length === 0 ? (
                <EmptyRow colSpan={4} label="Aucune vente sur la période." />
              ) : (
                byProduct.map((p) => (
                  <tr key={p.name} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2 num">{qty(p.units)}</td>
                    <td className="px-4 py-2 num">{money(p.total)}</td>
                    <td className="px-4 py-2 num">
                      {revenue > 0 ? `${Math.round((p.total / revenue) * 100)} %` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </PageShell>
  );
}
