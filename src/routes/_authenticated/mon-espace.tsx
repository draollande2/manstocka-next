import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow, StatCard } from "@/components/PageShell";
import { money, dateTime, periodLabel, currentPeriod } from "@/lib/format";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSite } from "@/hooks/useSite";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/mon-espace")({
  head: () => ({
    meta: [
      { title: "Mon espace employé — Stocka" },
      { name: "description", content: "Tableau de bord personnel : ventes réalisées, retenues, activité du mois." },
      { property: "og:title", content: "Mon espace employé — Stocka" },
      { property: "og:description", content: "Chaque collaborateur suit son activité et son activité." },
    ],
  }),
  component: EmployeeSpace,
});

function EmployeeSpace() {
  const { data: user } = useCurrentUser();
  const { siteId } = useSite();
  const period = currentPeriod();

  const { data, isLoading } = useQuery({
    queryKey: ["my-space", user?.id, period, siteId ?? "all"],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      let salesRequest = supabase
        .from("sales")
        .select("id, invoice_number, client_name, total, created_at")
        .eq("user_id", user?.id ?? "")
        .gte("created_at", start)
        .order("created_at", { ascending: false });
      if (siteId != null) salesRequest = salesRequest.eq("site_id", siteId);
      const [sales, losses, logs, salary, savingsAccount, savingsTransactions] = await Promise.all([
        salesRequest,
        supabase
          .from("losses")
          .select("id, kind, amount, description, created_at")
          .eq("employee_id", user?.id ?? "")
          .eq("period", period),
        supabase
          .from("activity_logs")
          .select("id, action, entity, details, created_at")
          .eq("user_id", user?.id ?? "")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("salaries")
          .select("id, period, base_salary, bonus, losses_deduction, other_deduction, savings_transfer, paid")
          .eq("employee_id", user?.id ?? "")
          .eq("period", period)
          .maybeSingle(),
        supabase
          .from("savings_accounts")
          .select("id, balance")
          .eq("employee_id", user?.id ?? "")
          .maybeSingle(),
        supabase
          .from("savings_transactions")
          .select("id, kind, amount, source, status, note, created_at")
          .eq("employee_id", user?.id ?? "")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      return {
        sales: sales.data ?? [],
        losses: losses.data ?? [],
        logs: logs.data ?? [],
        salary: salary.data,
        savingsAccount: savingsAccount.data,
        savingsTransactions: savingsTransactions.data ?? [],
      };
    },
  });

  const salesTotal = (data?.sales ?? []).reduce((s, r) => s + Number(r.total), 0);
  const lossTotal = (data?.losses ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const salary = data?.salary;
  const salaryNet = salary
    ? Number(salary.base_salary) +
      Number(salary.bonus) -
      Number(salary.losses_deduction) -
      Number(salary.other_deduction) -
      Number(salary.savings_transfer)
    : 0;

  return (
    <PageShell
      title="Mon espace employé"
      description={`Bonjour ${user?.fullName ?? ""} — activité de ${periodLabel(period)}.`}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Mes ventes du mois" value={money(salesTotal)} hint={`${data?.sales.length ?? 0} vente(s)`} />
        <StatCard label="Mes retenues" value={money(lossTotal)} />
        <StatCard
          label="Mon salaire net"
          value={salary ? money(salaryNet) : "—"}
          hint={salary ? (salary.paid ? "Payé" : "En attente de paiement") : "Bulletin non préparé"}
        />
        <StatCard
          label="Mon compte d'épargne"
          value={money(data?.savingsAccount?.balance)}
          hint="Solde disponible"
        />
      </div>

      <Panel title={`Mon bulletin de salaire — ${periodLabel(period)}`}>
        {salary ? (
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-card p-4">
              <p className="text-xs text-muted-foreground">Salaire de base</p>
              <p className="mt-1 font-semibold num">{money(salary.base_salary)}</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-xs text-muted-foreground">Prime</p>
              <p className="mt-1 font-semibold num">{money(salary.bonus)}</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-xs text-muted-foreground">Manques et autres retenues</p>
              <p className="mt-1 font-semibold text-destructive num">
                − {money(Number(salary.losses_deduction) + Number(salary.other_deduction))}
              </p>
            </div>
            <div className="bg-card p-4">
              <p className="text-xs text-muted-foreground">Versé à mon épargne</p>
              <p className="mt-1 font-semibold num">{money(salary.savings_transfer)}</p>
            </div>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Votre bulletin de ce mois n'a pas encore été préparé.
          </p>
        )}
      </Panel>

      <Panel title="Mes dernières opérations d'épargne">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Opération</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Montant</th>
                <th className="px-4 py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {(data?.savingsTransactions ?? []).length === 0 ? (
                <EmptyRow colSpan={5} label={isLoading ? "Chargement…" : "Aucune opération d'épargne."} />
              ) : (
                (data?.savingsTransactions ?? []).map((transaction) => (
                  <tr key={transaction.id} className="border-t border-border">
                    <td className="px-4 py-2 text-xs">{dateTime(transaction.created_at)}</td>
                    <td className="px-4 py-2">{transaction.kind === "depot" ? "Dépôt" : "Retrait"}</td>
                    <td className="px-4 py-2">{transaction.source === "salaire" ? "Bulletin de salaire" : "Manuel"}</td>
                    <td className="px-4 py-2 font-medium num">{money(transaction.amount)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={transaction.status === "valide" ? "default" : transaction.status === "refuse" ? "destructive" : "secondary"}>
                        {transaction.status === "valide" ? "Validé" : transaction.status === "refuse" ? "Refusé" : "En attente"}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Mes ventes du mois">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Facture</th>
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Montant</th>
              </tr>
            </thead>
            <tbody>
              {(data?.sales ?? []).length === 0 ? (
                <EmptyRow colSpan={4} label={isLoading ? "Chargement…" : "Aucune vente ce mois."} />
              ) : (
                (data?.sales ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{s.invoice_number}</td>
                    <td className="px-4 py-2">{s.client_name}</td>
                    <td className="px-4 py-2 text-xs">{dateTime(s.created_at)}</td>
                    <td className="px-4 py-2 num">{money(s.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Mes manques & pertes du mois">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Montant retenu</th>
                <th className="px-4 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {(data?.losses ?? []).length === 0 ? (
                <EmptyRow colSpan={4} label="Aucune retenue — bravo !" />
              ) : (
                (data?.losses ?? []).map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-4 py-2 text-xs">{dateTime(l.created_at)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={l.kind === "manque" ? "destructive" : "secondary"}>
                        {l.kind === "manque" ? "Manque" : "Perte"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 num">{money(l.amount)}</td>
                    <td className="px-4 py-2 text-xs">{l.description ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Mes dernières actions">
        <ul className="divide-y divide-border">
          {(data?.logs ?? []).length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune action.</li>
          ) : (
            (data?.logs ?? []).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                <span>
                  {l.action}
                  {l.details ? <span className="text-muted-foreground"> — {l.details}</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">{dateTime(l.created_at)}</span>
              </li>
            ))
          )}
        </ul>
      </Panel>
    </PageShell>
  );
}
