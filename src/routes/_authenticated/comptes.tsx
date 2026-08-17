import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow, StatCard } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { money, qty, dateTime } from "@/lib/format";
import { logActivity, useCurrentUser } from "@/hooks/useCurrentUser";
import { useSite } from "@/hooks/useSite";
import { useProductStocks, stockOf } from "@/hooks/useStocks";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/comptes")({
  head: () => ({
    meta: [
      { title: "États des stocks — Stocka" },
      {
        name: "description",
        content:
          "Confrontez le stock théorique de chaque article avec l'inventaire papier, calculez les écarts et soumettez-les pour correction.",
      },
      { property: "og:title", content: "États des stocks — Stocka" },
      { property: "og:description", content: "Inventaire physique, écarts automatiques et correction validée par l'administrateur." },
    ],
  }),
  component: StockStatePage,
});

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  retail_unit: string;
  stock_units: number;
  min_stock_units: number;
  cost_price: number;
};

type ReportRow = {
  id: string;
  user_id: string;
  target_kind: string;
  target_id: string | null;
  target_label: string | null;
  message: string;
  status: string;
  resolution_note: string | null;
  created_at: string;
};

function StockStatePage() {
  const { data: user } = useCurrentUser();
  const isAdmin = Boolean(user?.isAdmin);
  const { siteId, siteName } = useSite();
  const { data: siteStocks } = useProductStocks();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const { data: products, isLoading } = useQuery({
    queryKey: ["stock-state-products", siteId ?? "all"],
    queryFn: async () => {
      const columns =
        "id, name, sku, category, retail_unit, stock_units, min_stock_units, cost_price";
      if (siteId) {
        const { data, error } = await supabase
          .from("products")
          .select(`${columns}, product_stocks!inner(site_id)`)
          .eq("product_stocks.site_id", siteId)
          .order("name");
        if (error) throw error;
        return (data ?? []).map(({ product_stocks: _s, ...p }) => p) as ProductRow[];
      }
      const { data, error } = await supabase.from("products").select(columns).order("name");
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const { data: reports } = useQuery({
    queryKey: ["stock-state-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("error_reports")
        .select("id, user_id, target_kind, target_id, target_label, message, status, resolution_note, created_at")
        .eq("target_kind", "stock")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
  });

  const { data: audits } = useQuery({
    queryKey: ["stock-state-audits", siteId ?? "all"],
    queryFn: async () => {
      let request = supabase
        .from("stock_audits")
        .select("id, product_id, expected_units, counted_units, difference_units, note, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (siteId) request = request.eq("site_id", siteId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        product_id: string;
        expected_units: number;
        counted_units: number;
        difference_units: number;
        note: string | null;
        created_at: string;
      }>;
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products ?? [])
      .filter(
        (p) =>
          !term ||
          p.name.toLowerCase().includes(term) ||
          (p.sku ?? "").toLowerCase().includes(term) ||
          (p.category ?? "").toLowerCase().includes(term),
      )
      .map((p) => {
        const entry = stockOf(siteStocks, p.id);
        const raw = counted[p.id];
        const hasCount = raw !== undefined && raw !== "";
        const countedUnits = hasCount ? Number(raw) || 0 : null;
        const diff = countedUnits === null ? null : countedUnits - Number(entry.stock_units);
        return {
          product: p,
          expected: Number(entry.stock_units),
          minUnits: Number(entry.min_stock_units),
          countedUnits,
          diff,
        };
      });
  }, [products, search, counted, siteStocks]);

  const withGap = rows.filter((r) => r.diff !== null && r.diff !== 0);
  const checked = rows.filter((r) => r.diff !== null);
  const stockValue = rows.reduce((s, r) => s + r.expected * Number(r.product.cost_price), 0);
  const gapValue = withGap.reduce((s, r) => s + (r.diff ?? 0) * Number(r.product.cost_price), 0);
  const lowStock = rows.filter((r) => r.expected <= r.minUnits);

  const productName = (id: string | null) =>
    (products ?? []).find((p) => p.id === id)?.name ?? "—";


  const submitGaps = useMutation({
    mutationFn: async () => {
      if (withGap.length === 0) throw new Error("Aucun écart à soumettre.");
      if (!user?.id) throw new Error("Session expirée.");
      const payload = withGap.map((r) => ({
        user_id: user.id,
        target_kind: "stock",
        target_id: r.product.id,
        target_label: r.product.name,
        message: `Inventaire ${siteName(siteId)} : théorique ${qty(r.expected)} ${r.product.retail_unit}, compté ${qty(
          r.countedUnits ?? 0,
        )} ${r.product.retail_unit}, écart ${(r.diff ?? 0) > 0 ? "+" : ""}${qty(r.diff ?? 0)}.${
          note.trim() ? ` Note : ${note.trim()}` : ""
        }`,
        status: "ouvert",
      }));
      const { error } = await supabase.from("error_reports").insert(payload);
      if (error) throw error;
      await logActivity("Écarts d'inventaire soumis", "stocks", `${withGap.length} article(s)`);
    },
    onSuccess: () => {
      toast.success("Écarts soumis à l'administrateur pour correction.");
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["stock-state-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyCorrection = useMutation({
    mutationFn: async () => {
      if (checked.length === 0) throw new Error("Saisissez au moins un comptage.");
      if (!siteId)
        throw new Error("Choisissez un point de vente précis avant de valider l'inventaire.");
      for (const r of checked) {
        // Aligne le stock du point de vente choisi et enregistre l'écart.
        const { error } = await supabase.rpc("apply_stock_count", {
          _site_id: siteId,
          _product_id: r.product.id,
          _counted: r.countedUnits ?? 0,
          _note: note.trim() || "",
        });
        if (error) throw error;
      }
      await logActivity("Inventaire validé", "stocks", `${checked.length} article(s)`);
    },
    onSuccess: () => {
      toast.success("Inventaire enregistré, les stocks sont corrigés.");
      setCounted({});
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["stock-state-products"] });
      void queryClient.invalidateQueries({ queryKey: ["stock-state-audits"] });
      void queryClient.invalidateQueries({ queryKey: ["product-stocks"] });
      void queryClient.invalidateQueries({ queryKey: ["product-stocks-by-site"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const resolveReport = useMutation({
    mutationFn: async (report: ReportRow) => {
      const { error } = await supabase
        .from("error_reports")
        .update({
          status: "resolu",
          resolved_by: user?.id ?? null,
          resolution_note: "Écart de stock traité.",
        })
        .eq("id", report.id);
      if (error) throw error;
      await logActivity("Écart de stock traité", "stocks", report.target_label ?? "");
    },
    onSuccess: () => {
      toast.success("Signalement clôturé.");
      void queryClient.invalidateQueries({ queryKey: ["stock-state-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageShell
      title="États des stocks"
      description="Comparez le stock théorique de chaque article avec votre inventaire papier : les écarts sont calculés automatiquement, puis soumis pour correction."
      actions={
        <div className="flex flex-wrap items-center gap-2" data-print="hide">
          <Input
            placeholder="Rechercher un article…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-56"
          />
          <Button size="sm" variant="outline" onClick={() => setCounted({})}>
            Réinitialiser
          </Button>
          {isAdmin ? (
            <Button size="sm" onClick={() => applyCorrection.mutate()} disabled={applyCorrection.isPending}>
              Valider l'inventaire &amp; corriger
            </Button>
          ) : (
            <Button size="sm" onClick={() => submitGaps.mutate()} disabled={submitGaps.isPending}>
              Soumettre les écarts
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Articles suivis" value={String((products ?? []).length)} />
        <StatCard label="Valeur du stock" value={money(stockValue)} />
        <StatCard
          label="Articles comptés"
          value={`${checked.length} / ${rows.length}`}
          hint={`${withGap.length} écart(s)`}
        />
        <StatCard label="Impact des écarts" value={money(gapValue)} hint={gapValue < 0 ? "Manquant" : "Excédent"} />
      </div>

      <Panel title="Confrontation stock théorique / inventaire physique">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Article</th>
                <th className="px-4 py-2">Catégorie</th>
                <th className="px-4 py-2">Unité</th>
                <th className="px-4 py-2">Stock théorique</th>
                <th className="px-4 py-2">Compté (papier)</th>
                <th className="px-4 py-2">Écart</th>
                <th className="px-4 py-2">Valeur écart</th>
                <th className="px-4 py-2">État</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8} label={isLoading ? "Chargement…" : "Aucun article."} />
              ) : (
                rows.map(({ product, expected, minUnits, countedUnits, diff }) => (
                  <tr key={product.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{product.name}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{product.category ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{product.retail_unit}</td>
                    <td className="px-4 py-2 num">{qty(expected)}</td>
                    <td className="px-4 py-2">
                      <Input
                        className="h-8 w-28"
                        type="number"
                        step="any"
                        min="0"
                        value={counted[product.id] ?? ""}
                        placeholder="—"
                        onChange={(e) => setCounted((c) => ({ ...c, [product.id]: e.target.value }))}
                      />
                    </td>
                    <td
                      className={`px-4 py-2 num ${
                        diff === null ? "" : diff === 0 ? "text-muted-foreground" : "text-destructive font-semibold"
                      }`}
                    >
                      {diff === null ? "—" : `${diff > 0 ? "+" : ""}${qty(diff)}`}
                    </td>
                    <td className="px-4 py-2 num">
                      {diff === null ? "—" : money(diff * Number(product.cost_price))}
                    </td>
                    <td className="px-4 py-2">
                      {expected <= minUnits ? (
                        <Badge variant="destructive">Stock bas</Badge>
                      ) : diff === null ? (
                        <Badge variant="secondary">À vérifier</Badge>
                      ) : diff === 0 ? (
                        <Badge>Conforme</Badge>
                      ) : (
                        <Badge variant="destructive">Écart</Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border p-4" data-print="hide">
          <Input
            placeholder="Note d'inventaire (optionnelle)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {isAdmin
              ? "La validation enregistre l'inventaire et aligne le stock de l'application sur les quantités comptées."
              : "Vos écarts sont transmis à l'administrateur, qui applique la correction du stock."}
          </p>
        </div>
      </Panel>

      {lowStock.length > 0 && (
        <Panel title="Articles sous le seuil minimum">
          <ul className="divide-y divide-border">
            {lowStock.map((r) => (
              <li key={r.product.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{r.product.name}</span>
                <span className="num text-destructive">
                  {qty(r.expected)} / {qty(r.minUnits)} {r.product.retail_unit}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Écarts soumis pour correction">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Article</th>
                <th className="px-4 py-2">Détail</th>
                <th className="px-4 py-2">Statut</th>
                {isAdmin && <th className="px-4 py-2" data-print="hide" />}
              </tr>
            </thead>
            <tbody>
              {(reports ?? []).length === 0 ? (
                <EmptyRow colSpan={5} label="Aucun écart soumis." />
              ) : (
                (reports ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2 text-xs">{dateTime(r.created_at)}</td>
                    <td className="px-4 py-2 font-medium">{r.target_label ?? productName(r.target_id)}</td>
                    <td className="px-4 py-2 text-xs">{r.message}</td>
                    <td className="px-4 py-2">
                      <Badge variant={r.status === "resolu" ? "default" : "secondary"}>
                        {r.status === "resolu" ? "Traité" : "En attente"}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2 text-right" data-print="hide">
                        {r.status !== "resolu" && (
                          <Button size="sm" variant="outline" onClick={() => resolveReport.mutate(r)}>
                            Marquer traité
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Derniers inventaires enregistrés">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Article</th>
                <th className="px-4 py-2">Théorique</th>
                <th className="px-4 py-2">Compté</th>
                <th className="px-4 py-2">Écart</th>
              </tr>
            </thead>
            <tbody>
              {(audits ?? []).length === 0 ? (
                <EmptyRow colSpan={5} label="Aucun inventaire enregistré." />
              ) : (
                (audits ?? []).map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-4 py-2 text-xs">{dateTime(a.created_at)}</td>
                    <td className="px-4 py-2 font-medium">{productName(a.product_id)}</td>
                    <td className="px-4 py-2 num">{qty(a.expected_units)}</td>
                    <td className="px-4 py-2 num">{qty(a.counted_units)}</td>
                    <td className="px-4 py-2 num">
                      {Number(a.difference_units) > 0 ? "+" : ""}
                      {qty(a.difference_units)}
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
