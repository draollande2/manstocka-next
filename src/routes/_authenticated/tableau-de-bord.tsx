import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, StatCard, Panel, EmptyRow } from "@/components/PageShell";
import { money, qty, dateTime, currentPeriod } from "@/lib/format";
import { Link, Navigate } from "@tanstack/react-router";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSite } from "@/hooks/useSite";
import { useProductStocks, stockOf } from "@/hooks/useStocks";

export const Route = createFileRoute("/_authenticated/tableau-de-bord")({
  head: () => ({
    meta: [
      { title: "Tableau de bord — Stocka" },
      { name: "description", content: "Vue d'ensemble des stocks, ventes, dépenses et alertes." },
      { property: "og:title", content: "Tableau de bord — Stocka" },
      { property: "og:description", content: "Chiffre d'affaires, stock, dépenses et alertes en un coup d'œil." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const isEmployee = me ? !me.isAdmin : false;
  const period = currentPeriod();
  const monthStart = `${period}-01T00:00:00.000Z`;
  const { siteId, siteName, allSites } = useSite();
  const { data: stockMap } = useProductStocks();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", period, siteId ?? "all"],
    enabled: Boolean(me?.isAdmin),
    queryFn: async () => {
      let salesQ = supabase
        .from("sales")
        .select("*")
        .gte("created_at", monthStart)
        .order("created_at", { ascending: false });
      let expensesQ = supabase.from("expenses").select("amount, category").gte("spent_on", `${period}-01`);
      let lossesQ = supabase.from("losses").select("amount").eq("period", period);
      let movementsQ = supabase
        .from("movements")
        .select("*, products(name, retail_unit)")
        .order("created_at", { ascending: false })
        .limit(8);
      if (siteId) {
        salesQ = salesQ.eq("site_id", siteId);
        expensesQ = expensesQ.eq("site_id", siteId);
        lossesQ = lossesQ.eq("site_id", siteId);
        movementsQ = movementsQ.eq("site_id", siteId);
      }
      const [products, sales, expenses, losses, movements] = await Promise.all([
        siteId
          ? supabase
              .from("products")
              .select("*, product_stocks!inner(site_id)")
              .eq("product_stocks.site_id", siteId)
          : supabase.from("products").select("*"),
        salesQ,
        expensesQ,
        lossesQ,
        movementsQ,
      ]);
      if (products.error) throw products.error;
      return {
        products: products.data ?? [],
        sales: sales.data ?? [],
        expenses: expenses.data ?? [],
        losses: losses.data ?? [],
        movements: (movements.data ?? []) as Array<{
          id: string;
          kind: string;
          quantity_units: number;
          created_at: string;
          products: { name: string; retail_unit: string } | null;
        }>,
      };
    },
  });

  const products = data?.products ?? [];
  const revenue = (data?.sales ?? []).reduce((s, r) => s + Number(r.total), 0);
  const expensesTotal = (data?.expenses ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const lossesTotal = (data?.losses ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const stockValue = products.reduce((s, p) => {
    const stock = stockOf(stockMap, p.id);
    return s + Number(stock.stock_units) * Number(p.cost_price || 0);
  }, 0);
  const alerts = products
    .map((p) => ({ p, stock: stockOf(stockMap, p.id) }))
    .filter(({ stock }) => Number(stock.stock_units) <= Number(stock.min_stock_units));
  if (isEmployee) return <Navigate to="/mon-espace" replace />;
  if (meLoading) return null;

  const scopeLabel = allSites ? "Tous les points de vente" : siteName(siteId);

  return (
    <PageShell
      title={`Tableau de bord — ${scopeLabel}`}
      description={`Activité du mois en cours, valeur du stock et alertes de réapprovisionnement pour ${scopeLabel}.`}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ventes du mois" value={money(revenue)} hint={`${data?.sales.length ?? 0} facture(s)`} />
        <StatCard label="Dépenses du mois" value={money(expensesTotal)} />
        <StatCard label="Manques & pertes" value={money(lossesTotal)} hint="Déduits des salaires" />
        <StatCard
          label="Résultat brut"
          value={money(revenue - expensesTotal)}
          hint="Ventes − dépenses"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard label="Valeur du stock (prix d'achat)" value={money(stockValue)} />
        <StatCard label="Articles référencés" value={qty(products.length)} />
        <StatCard label="Alertes de stock" value={qty(alerts.length)} hint="Stock ≤ seuil" />
      </div>

      <Panel title="Alertes de stock">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Article</th>
                <th className="px-4 py-2">Stock</th>
                <th className="px-4 py-2">Seuil</th>
                <th className="px-4 py-2">Équivalent gros</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <EmptyRow colSpan={4} label={isLoading ? "Chargement…" : "Aucune alerte, stocks suffisants."} />
              ) : (
                alerts.map(({ p, stock }) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2 num text-destructive">
                      {qty(stock.stock_units)} {p.retail_unit}
                    </td>
                    <td className="px-4 py-2 num">{qty(stock.min_stock_units)}</td>
                    <td className="px-4 py-2 num">
                      {qty(Number(stock.stock_units) / Number(p.units_per_package))} {p.wholesale_unit}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Derniers mouvements">
          <ul className="divide-y divide-border">
            {(data?.movements ?? []).length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun mouvement.</li>
            ) : (
              (data?.movements ?? []).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{m.products?.name ?? "Article supprimé"}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(m.created_at)}</p>
                  </div>
                  <span
                    className={
                      m.kind === "entree"
                        ? "num text-sm font-semibold text-success"
                        : "num text-sm font-semibold text-destructive"
                    }
                  >
                    {m.kind === "entree" ? "+" : "−"}
                    {qty(m.quantity_units)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </Panel>

        <Panel title="Dernières ventes">
          <ul className="divide-y divide-border">
            {(data?.sales ?? []).slice(0, 8).length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aucune vente ce mois.{" "}
                <Link to="/vente" className="text-primary underline-offset-4 hover:underline">
                  Enregistrer une vente
                </Link>
              </li>
            ) : (
              (data?.sales ?? []).slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{s.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.client_name || "Client de passage"} · {dateTime(s.created_at)}
                    </p>
                  </div>
                  <span className="num font-semibold">{money(Number(s.total))}</span>
                </li>
              ))
            )}
          </ul>
        </Panel>
      </div>
    </PageShell>
  );
}
