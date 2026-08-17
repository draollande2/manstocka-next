import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, ShoppingCart, Search, Printer } from "lucide-react";
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
import { useProducts, type ProductRow } from "./produits";
import { nextDocumentNumber } from "@/lib/documents";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vente")({
  head: () => ({
    meta: [
      { title: "Vente — Stocka" },
      { name: "description", content: "Point de vente : panier multi-articles en détail ou en gros, facture automatique." },
      { property: "og:title", content: "Vente — Stocka" },
      { property: "og:description", content: "Encaissez en détail ou en gros et générez la facture du client." },
    ],
  }),
  component: SalePage,
});

type Line = {
  key: string;
  product: ProductRow;
  mode: "detail" | "gros";
  quantity: number;
  unitPrice: number;
};

type InvoiceDoc = {
  number: string;
  client: string;
  total: number;
  paid: number;
  note: string;
  createdAt: string;
  lines: {
    name: string;
    mode: "detail" | "gros";
    unitLabel: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
};

const unitsOf = (l: Line) => l.quantity * (l.mode === "gros" ? Number(l.product.units_per_package) : 1);
const totalOf = (l: Line) => l.quantity * l.unitPrice;

function SalePage() {
  const { data: me } = useCurrentUser();
  const { siteId } = useSite();
  const isEmployee = me ? !me.isAdmin : false;
  const [formOpen, setFormOpen] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDoc | null>(null);
  const [reporting, setReporting] = useState<{ id: string; label: string } | null>(null);
  const [reportMessage, setReportMessage] = useState("");
  const queryClient = useQueryClient();

  const { data: sales } = useQuery({
    queryKey: ["sales", "recent", isEmployee ? me?.id : "all", siteId ?? "all"],
    enabled: Boolean(me),
    queryFn: async () => {
      let request = supabase
        .from("sales")
        .select("id, invoice_number, client_name, total, paid, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (siteId) request = request.eq("site_id", siteId);
      if (isEmployee && me) {
        request = request
          .eq("user_id", me.id)
          .gte("created_at", new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString());
      }
      const { data, error } = await request;
      if (error) throw error;
      return data;
    },
  });

  const report = useMutation({
    mutationFn: async () => {
      if (!me || !reporting) return;
      if (reportMessage.trim().length < 5) throw new Error("Décrivez l'erreur constatée.");
      const { error } = await supabase.from("error_reports").insert({
        user_id: me.id,
        target_kind: "vente",
        target_id: reporting.id,
        target_label: reporting.label,
        message: reportMessage.trim().slice(0, 1000),
      });
      if (error) throw error;
      await logActivity("Signalement d'erreur", "vente", reporting.label);
    },
    onSuccess: () => {
      toast.success("Signalement envoyé à l'administrateur.");
      setReporting(null);
      setReportMessage("");
      void queryClient.invalidateQueries({ queryKey: ["error-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = new Date().toISOString().slice(0, 10);
  const todaySales = (sales ?? []).filter((s) => (s.created_at ?? "").slice(0, 10) === today);
  const todayTotal = todaySales.reduce((s, r) => s + Number(r.total), 0);

  const { data: reports } = useQuery({
    queryKey: ["error-reports"],
    enabled: Boolean(me) && !isEmployee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("error_reports")
        .select("id, target_label, message, status, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("error_reports")
        .update({ status: "traite", resolved_by: me?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Signalement marqué traité.");
      void queryClient.invalidateQueries({ queryKey: ["error-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageShell
      title="Vente"
      description={
        isEmployee
          ? "Enregistrez vos ventes. Vous consultez vos ventes des 2 derniers jours sans pouvoir les modifier : signalez toute erreur à un administrateur."
          : "Lancez une vente, choisissez les articles en détail ou en gros, puis validez : la facture est générée immédiatement pour impression ou export PDF."
      }
      actions={
        <Button onClick={() => setFormOpen(true)}>
          <ShoppingCart className="size-4" /> Effectuer une vente
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Ventes du jour" value={String(todaySales.length)} />
        <StatCard label="Chiffre du jour" value={money(todayTotal)} />
        <StatCard
          label="Dernière facture"
          value={sales?.[0]?.invoice_number ?? "—"}
          hint={sales?.[0] ? dateTime(sales[0].created_at) : undefined}
        />
      </div>

      <Panel title="Ventes récentes">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Facture</th>
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">Payé</th>
                {isEmployee && <th className="px-4 py-2" data-print="hide" />}
              </tr>
            </thead>
            <tbody>
              {(sales ?? []).length === 0 ? (
                <EmptyRow colSpan={isEmployee ? 6 : 5} label="Aucune vente enregistrée." />
              ) : (
                (sales ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{s.invoice_number}</td>
                    <td className="px-4 py-2">{s.client_name ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{dateTime(s.created_at)}</td>
                    <td className="px-4 py-2 num">{money(s.total)}</td>
                    <td className="px-4 py-2 num">{money(s.paid)}</td>
                    {isEmployee && (
                      <td className="px-4 py-2 text-right" data-print="hide">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReporting({ id: s.id, label: s.invoice_number })}
                        >
                          Signaler une erreur
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {!isEmployee && (reports ?? []).length > 0 && (
        <Panel title="Signalements des employés">
          <ul className="divide-y divide-border">
            {(reports ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{r.target_label ?? "Vente"}</p>
                  <p className="text-xs text-muted-foreground">
                    {dateTime(r.created_at)} · {r.message}
                  </p>
                </div>
                {r.status === "ouvert" ? (
                  <Button size="sm" variant="outline" data-print="hide" onClick={() => resolve.mutate(r.id)}>
                    Marquer traité
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Traité</span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <SaleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onDone={(doc) => {
          setFormOpen(false);
          setInvoice(doc);
        }}
      />

      <InvoiceDialog doc={invoice} onClose={() => setInvoice(null)} />

      <Dialog open={Boolean(reporting)} onOpenChange={(o) => !o && setReporting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signaler une erreur — {reporting?.label}</DialogTitle>
            <DialogDescription>
              Décrivez l'erreur. Un administrateur effectuera la correction.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="report">Description de l'erreur</Label>
            <Input
              id="report"
              value={reportMessage}
              onChange={(e) => setReportMessage(e.target.value)}
              maxLength={500}
              placeholder="Mauvaise quantité, article erroné…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReporting(null)}>
              Annuler
            </Button>
            <Button onClick={() => report.mutate()} disabled={report.isPending}>
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function ProductPicker({
  title,
  mode,
  products,
  onAdd,
}: {
  title: string;
  mode: "detail" | "gros";
  products: ProductRow[];
  onAdd: (p: ProductRow, mode: "detail" | "gros") => void;
}) {
  const [search, setSearch] = useState("");
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => p.sale_mode === "both" || p.sale_mode === mode)
      .filter((p) =>
        q === ""
          ? true
          : `${p.name} ${p.sku ?? ""} ${p.category ?? ""}`.toLowerCase().includes(q),
      );
  }, [products, search, mode]);

  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-2">
        <h3 className="font-display text-sm font-semibold">{title}</h3>
      </div>
      <div className="border-b border-border p-3">
        <Label htmlFor={`search-${mode}`} className="sr-only">
          Rechercher un article {mode === "gros" ? "en gros" : "en détail"}
        </Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`search-${mode}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Rechercher un article ${mode === "gros" ? "en gros" : "en détail"}…`}
            className="pl-8"
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {list.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Aucun article trouvé.</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((p) => {
              const units = Number(p.stock_units);
              const perPack = Number(p.units_per_package) || 1;
              const outOfStock = units <= 0 || (mode === "gros" && units < perPack);
              return (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2 ${
                    outOfStock ? "opacity-50" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {qty(units)} {p.retail_unit} ·{" "}
                      {money(mode === "gros" ? p.wholesale_price : p.retail_price)} /{" "}
                      {mode === "gros" ? p.wholesale_unit : p.retail_unit}
                      {outOfStock ? " · stock épuisé" : ""}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={outOfStock}
                    aria-label={`Ajouter ${p.name}`}
                    title={outOfStock ? "Stock insuffisant" : "Ajouter au panier"}
                    onClick={() => onAdd(p, mode)}
                  >
                    <Plus className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SaleFormDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: (doc: InvoiceDoc) => void;
}) {
  const { data: products } = useProducts();
  const { siteId } = useSite();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<Line[]>([]);
  const [client, setClient] = useState("");
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setLines([]);
      setClient("");
      setPaid("");
      setNote("");
    }
  }, [open]);

  const total = lines.reduce((s, l) => s + totalOf(l), 0);
  const paidNumber = paid === "" ? total : Number(paid) || 0;

  function addLine(product: ProductRow, mode: "detail" | "gros") {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id && l.mode === mode);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          key: `${product.id}-${mode}-${Date.now()}`,
          product,
          mode,
          quantity: 1,
          unitPrice: mode === "gros" ? Number(product.wholesale_price) : Number(product.retail_price),
        },
      ];
    });
  }

  const checkout = useMutation({
    mutationFn: async (): Promise<InvoiceDoc> => {
      if (!siteId) throw new Error("Choisissez un point de vente précis avant d'effectuer une vente.");
      if (lines.length === 0) throw new Error("Le panier est vide.");
      for (const l of lines) {
        if (l.quantity <= 0) throw new Error(`Quantité invalide pour ${l.product.name}.`);
        if (unitsOf(l) > Number(l.product.stock_units)) {
          throw new Error(
            `Stock insuffisant pour ${l.product.name} (${qty(l.product.stock_units)} ${l.product.retail_unit} disponibles).`,
          );
        }
      }
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? null;
      const number = await nextDocumentNumber("vente");
      const clientName = client.trim() || "Client comptant";

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          invoice_number: number,
          client_name: clientName,
          total,
          paid: paidNumber,
          note: note.trim() || null,
          user_id: userId,
          site_id: siteId,
        })
        .select("id")
        .single();
      if (saleError) throw saleError;

      const { error: itemsError } = await supabase.from("sale_items").insert(
        lines.map((l) => ({
          sale_id: sale.id,
          product_id: l.product.id,
          product_name: l.product.name,
          mode: l.mode,
          unit_label: l.mode === "gros" ? l.product.wholesale_unit : l.product.retail_unit,
          quantity: l.quantity,
          quantity_units: unitsOf(l),
          unit_price: l.unitPrice,
          line_total: totalOf(l),
        })),
      );
      if (itemsError) throw itemsError;

      const { error: movError } = await supabase.from("movements").insert(
        lines.map((l) => ({
          product_id: l.product.id,
          kind: "sortie",
          mode: l.mode,
          quantity: l.quantity,
          quantity_units: unitsOf(l),
          unit_price: l.unitPrice,
          reason: `Vente ${number}`,
          reference: number,
          user_id: userId,
          site_id: siteId,
        })),
      );
      if (movError) throw movError;

      const { error: invError } = await supabase.from("invoices").insert({
        number,
        kind: "vente",
        client_name: clientName,
        amount: total,
        sale_id: sale.id,
        user_id: userId,
        site_id: siteId,
      });
      if (invError) throw invError;

      await logActivity("Vente enregistrée", "vente", `${number} — ${money(total)}`);

      return {
        number,
        client: clientName,
        total,
        paid: paidNumber,
        note: note.trim(),
        createdAt: new Date().toISOString(),
        lines: lines.map((l) => ({
          name: l.product.name,
          mode: l.mode,
          unitLabel: l.mode === "gros" ? l.product.wholesale_unit : l.product.retail_unit,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: totalOf(l),
        })),
      };
    },
    onSuccess: (doc) => {
      toast.success(`Vente enregistrée — facture ${doc.number}`);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
      onDone(doc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nouvelle vente</DialogTitle>
          <DialogDescription>
            Choisissez les articles à vendre, ajustez les quantités puis validez. Les articles en rupture de
            stock sont grisés.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <ProductPicker title="Articles en détail" mode="detail" products={products ?? []} onAdd={addLine} />
          <ProductPicker title="Articles en gros" mode="gros" products={products ?? []} onAdd={addLine} />
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-border px-3 py-2">
            <h3 className="font-display text-sm font-semibold">Panier</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Quantité</th>
                  <th className="px-3 py-2">P.U.</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <EmptyRow colSpan={6} label="Panier vide." />
                ) : (
                  lines.map((l) => (
                    <tr key={l.key} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{l.product.name}</td>
                      <td className="px-3 py-2 text-xs">
                        {l.mode === "gros" ? "Gros" : "Détail"} · {qty(unitsOf(l))} {l.product.retail_unit}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            className="h-8 w-24"
                            value={String(l.quantity)}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.key === l.key ? { ...x, quantity: Number(e.target.value) } : x,
                                ),
                              )
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            {l.mode === "gros" ? l.product.wholesale_unit : l.product.retail_unit}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 num">{money(l.unitPrice)}</td>
                      <td className="px-3 py-2 num">{money(totalOf(l))}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Retirer"
                          onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="client">Nom du client (facultatif)</Label>
            <Input
              id="client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Client comptant"
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paid">Montant payé</Label>
            <Input
              id="paid"
              type="number"
              min="0"
              step="any"
              placeholder={String(total)}
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </div>
        </div>

        <DialogFooter className="items-center justify-between sm:justify-between">
          <p className="font-display text-lg font-bold num">{money(total)}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
              <ShoppingCart className="size-4" />
              {checkout.isPending ? "Enregistrement…" : "Valider la vente"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({ doc, onClose }: { doc: InvoiceDoc | null; onClose: () => void }) {
  const { data: settings } = useSettings();

  useEffect(() => {
    if (!doc) return;
    document.body.classList.add("printing-invoice");
    return () => document.body.classList.remove("printing-invoice");
  }, [doc]);

  if (!doc) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-invoice-doc className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader data-print="hide">
          <DialogTitle>Facture {doc.number}</DialogTitle>
          <DialogDescription>
            Vente enregistrée. Imprimez ou exportez la facture en PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-3">
            <div>
              <p className="font-display text-lg font-bold">{settings?.company_name ?? "Stocka"}</p>
              {settings?.address && <p className="text-xs text-muted-foreground">{settings.address}</p>}
              {settings?.phone && <p className="text-xs text-muted-foreground">Tél. {settings.phone}</p>}
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p className="font-display text-sm font-semibold text-foreground">Facture {doc.number}</p>
              <p>{dateTime(doc.createdAt)}</p>
              <p>Client : {doc.client}</p>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Article</th>
                <th className="px-3 py-2">Quantité</th>
                <th className="px-3 py-2">P.U.</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((l, i) => (
                <tr key={`${l.name}-${i}`} className="border-t border-border">
                  <td className="px-3 py-2">
                    {l.name}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({l.mode === "gros" ? "gros" : "détail"})
                    </span>
                  </td>
                  <td className="px-3 py-2 num">
                    {qty(l.quantity)} {l.unitLabel}
                  </td>
                  <td className="px-3 py-2 num">{money(l.unitPrice)}</td>
                  <td className="px-3 py-2 text-right num">{money(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ml-auto w-full max-w-xs space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-display font-bold num">{money(doc.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payé</span>
              <span className="num">{money(doc.paid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reste</span>
              <span className="num">{money(Math.max(doc.total - doc.paid, 0))}</span>
            </div>
          </div>

          {doc.note && <p className="text-xs text-muted-foreground">Note : {doc.note}</p>}
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
