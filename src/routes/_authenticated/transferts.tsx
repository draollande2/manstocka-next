import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow, StatCard, useSettings } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money, qty, dateTime } from "@/lib/format";
import { logActivity, useCurrentUser } from "@/hooks/useCurrentUser";
import { useSite } from "@/hooks/useSite";
import { useProducts } from "@/routes/_authenticated/produits";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transferts")({
  head: () => ({
    meta: [
      { title: "Transferts de stock — Stocka" },
      {
        name: "description",
        content: "Transférez des articles d'un point de vente à un autre avec bon de transfert numéroté.",
      },
      { property: "og:title", content: "Transferts de stock — Stocka" },
      { property: "og:description", content: "Mouvements inter-boutiques et bons de transfert imprimables." },
    ],
  }),
  component: TransfersPage,
});

type TransferRow = {
  id: string;
  number: string;
  from_site_id: string;
  to_site_id: string;
  product_id: string;
  quantity_units: number;
  unit_price: number;
  note: string | null;
  created_at: string;
};

function TransfersPage() {
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { sites, siteId, siteName, allSites } = useSite();
  const { data: products } = useProducts();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<TransferRow | null>(null);
  const [form, setForm] = useState({
    from_site: "",
    to_site: "",
    product_id: "",
    quantity_units: "",
    note: "",
  });

  useEffect(() => {
    if (!open) return;
    // Le point de départ est verrouillé sur le point de vente actif, si défini.
    setForm((f) => ({ ...f, from_site: siteId ?? f.from_site ?? sites[0]?.id ?? "" }));
  }, [open, siteId, sites]);

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["transfers", siteId ?? "all"],
    queryFn: async () => {
      let request = supabase
        .from("transfers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (siteId) request = request.or(`from_site_id.eq.${siteId},to_site_id.eq.${siteId}`);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as TransferRow[];
    },
  });

  const { data: stockRows } = useQuery({
    queryKey: ["stocks-for-transfer", form.from_site],
    enabled: Boolean(form.from_site),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stocks")
        .select("product_id, stock_units")
        .eq("site_id", form.from_site);
      if (error) throw error;
      return (data ?? []) as Array<{ product_id: string; stock_units: number }>;
    },
  });

  const stockMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of stockRows ?? []) map[r.product_id] = Number(r.stock_units);
    return map;
  }, [stockRows]);

  const product = (products ?? []).find((p) => p.id === form.product_id) ?? null;
  const available = product ? (stockMap[product.id] ?? 0) : 0;

  const submit = useMutation({
    mutationFn: async () => {
      if (!siteId) throw new Error("Choisissez un point de vente précis avant d'effectuer un transfert.");
      if (!form.from_site || !form.to_site) throw new Error("Choisissez le point de départ et d'arrivée.");
      if (form.from_site !== siteId) throw new Error("Le point de départ doit être le point de vente actif.");
      if (form.from_site === form.to_site) throw new Error("Les deux points de vente doivent être différents.");
      if (!product) throw new Error("Choisissez un article.");
      const quantity = Number(form.quantity_units);
      if (!quantity || quantity <= 0) throw new Error("Quantité invalide.");
      if (quantity > available) throw new Error("Stock insuffisant dans le point de départ.");
      const { data, error } = await supabase.rpc("perform_transfer", {
        _from_site: form.from_site,
        _to_site: form.to_site,
        _product_id: product.id,
        _quantity_units: quantity,
        _unit_price: Number(product.cost_price) || 0,
        _note: form.note.trim() || "",
      });
      if (error) throw error;
      await logActivity("Transfert de stock", "transferts", `${product.name} — ${qty(quantity)}`);
      return data as unknown as TransferRow;
    },
    onSuccess: (row) => {
      toast.success(`Transfert enregistré (${row.number}).`);
      setOpen(false);
      setForm({ from_site: form.from_site, to_site: "", product_id: "", quantity_units: "", note: "" });
      setReceipt(row);
      void queryClient.invalidateQueries({ queryKey: ["transfers"] });
      void queryClient.invalidateQueries({ queryKey: ["product-stocks"] });
      void queryClient.invalidateQueries({ queryKey: ["product-stocks-by-site"] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["stocks-for-transfer"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = transfers ?? [];
  const productName = (id: string) => (products ?? []).find((p) => p.id === id)?.name ?? "Article supprimé";

  // Page réservée aux administrateurs.
  if (meLoading) return null;
  if (me && !me.isAdmin) return <Navigate to="/mon-espace" replace />;

  return (
    <PageShell
      title="Transferts de stock"
      description="Déplacez des articles d'un point de vente à un autre. Chaque transfert génère un bon numéroté enregistré dans les factures."
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          <ArrowRightLeft className="size-4" /> Nouveau transfert
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Transferts enregistrés" value={String(rows.length)} />
        <StatCard label="Points de vente" value={String(sites.length)} />
        <StatCard
          label="Valeur transférée"
          value={money(rows.reduce((s, r) => s + Number(r.unit_price) * Number(r.quantity_units), 0))}
        />
      </div>

      <Panel title="Historique des transferts">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Bon</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Article</th>
                <th className="px-4 py-2">Quantité</th>
                <th className="px-4 py-2">De</th>
                <th className="px-4 py-2">Vers</th>
                <th className="px-4 py-2">Valeur</th>
                <th className="px-4 py-2" data-print="hide" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8} label={isLoading ? "Chargement…" : "Aucun transfert."} />
              ) : (
                rows.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{t.number}</td>
                    <td className="px-4 py-2 text-xs">{dateTime(t.created_at)}</td>
                    <td className="px-4 py-2">{productName(t.product_id)}</td>
                    <td className="px-4 py-2 num">{qty(t.quantity_units)}</td>
                    <td className="px-4 py-2 text-xs">{siteName(t.from_site_id)}</td>
                    <td className="px-4 py-2 text-xs">{siteName(t.to_site_id)}</td>
                    <td className="px-4 py-2 num">{money(Number(t.unit_price) * Number(t.quantity_units))}</td>
                    <td className="px-4 py-2 text-right" data-print="hide">
                      <Button variant="outline" size="sm" onClick={() => setReceipt(t)}>
                        Voir
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouveau transfert</DialogTitle>
            <DialogDescription>
              La quantité est retirée du point de départ et ajoutée automatiquement au point d'arrivée.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="from">Point de départ</Label>
              <select
                id="from"
                value={form.from_site}
                onChange={(e) => setForm({ ...form, from_site: e.target.value })}
                disabled={Boolean(siteId)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-70"
              >
                <option value="">— Choisir —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {siteId && (
                <p className="text-xs text-muted-foreground">
                  Départ verrouillé sur le point de vente actif : {siteName(siteId)}.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Point d'arrivée</Label>
              <select
                id="to"
                value={form.to_site}
                onChange={(e) => setForm({ ...form, to_site: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Choisir —</option>
                {sites
                  .filter((s) => s.id !== form.from_site)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="prod">Article</Label>
              <select
                id="prod"
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Choisir —</option>
                {(products ?? []).map((p) => {
                  const st = stockMap[p.id] ?? 0;
                  return (
                    <option key={p.id} value={p.id} disabled={st <= 0}>
                      {p.name} — {qty(st)} {p.retail_unit} disponible
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="q">Quantité ({product?.retail_unit ?? "unité"})</Label>
              <Input
                id="q"
                type="number"
                min="0"
                step="any"
                value={form.quantity_units}
                onChange={(e) => setForm({ ...form, quantity_units: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Motif (facultatif)</Label>
              <Input id="note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={200} />
            </div>
            {product && (
              <div className="rounded-md border border-border p-3 text-xs sm:col-span-2">
                <p>
                  Stock actuel à {siteName(form.from_site)} :{" "}
                  <span className="num font-semibold">
                    {qty(available)} {product.retail_unit}
                  </span>
                </p>
                <p>
                  Après transfert :{" "}
                  <span className="num font-semibold">
                    {qty(available - (Number(form.quantity_units) || 0))} {product.retail_unit}
                  </span>
                </p>
                <p>Valeur estimée : <span className="num">{money((Number(form.quantity_units) || 0) * Number(product.cost_price))}</span></p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? "Transfert…" : "Valider le transfert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransferReceipt
        transfer={receipt}
        productName={receipt ? productName(receipt.product_id) : ""}
        onClose={() => setReceipt(null)}
      />
    </PageShell>
  );
}

function TransferReceipt({
  transfer,
  productName,
  onClose,
}: {
  transfer: TransferRow | null;
  productName: string;
  onClose: () => void;
}) {
  const { data: settings } = useSettings();
  const { siteName } = useSite();

  useEffect(() => {
    if (!transfer) return;
    document.body.classList.add("printing-invoice");
    return () => document.body.classList.remove("printing-invoice");
  }, [transfer]);

  if (!transfer) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-invoice-doc className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader data-print="hide">
          <DialogTitle>Bon de transfert {transfer.number}</DialogTitle>
          <DialogDescription>Imprimez ou exportez ce bon en PDF.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-3">
            <div>
              <p className="font-display text-lg font-bold">{settings?.company_name ?? "Stocka"}</p>
              {settings?.address && <p className="text-xs text-muted-foreground">{settings.address}</p>}
              {settings?.phone && <p className="text-xs text-muted-foreground">Tél. {settings.phone}</p>}
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p className="font-display text-sm font-semibold text-foreground">
                Bon de transfert {transfer.number}
              </p>
              <p>{dateTime(transfer.created_at)}</p>
              <p>
                {siteName(transfer.from_site_id)} → {siteName(transfer.to_site_id)}
              </p>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Article</th>
                <th className="px-3 py-2">Quantité</th>
                <th className="px-3 py-2">Valeur unitaire</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="px-3 py-2">{productName}</td>
                <td className="px-3 py-2 num">{qty(transfer.quantity_units)}</td>
                <td className="px-3 py-2 num">{money(transfer.unit_price)}</td>
                <td className="px-3 py-2 text-right num">
                  {money(Number(transfer.unit_price) * Number(transfer.quantity_units))}
                </td>
              </tr>
            </tbody>
          </table>

          {transfer.note && <p className="text-xs text-muted-foreground">Motif : {transfer.note}</p>}
          {settings?.footer_note && (
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">{settings.footer_note}</p>
          )}
        </div>

        <DialogFooter data-print="hide">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimer / PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
