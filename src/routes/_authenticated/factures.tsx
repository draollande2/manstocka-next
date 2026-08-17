import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Printer, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow, StatCard, useSettings } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money, dateTime, qty } from "@/lib/format";
import { useSite } from "@/hooks/useSite";
import { logActivity, useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/factures")({
  head: () => ({
    meta: [
      { title: "Factures & bons — Stocka" },
      { name: "description", content: "Factures de vente et bons d'entrée numérotés, imprimables en PDF." },
      { property: "og:title", content: "Factures & bons — Stocka" },
      { property: "og:description", content: "Retrouvez et imprimez chaque facture de vente ou bon d'entrée." },
    ],
  }),
  component: InvoicesPage,
});

type InvoiceRow = {
  id: string;
  number: string;
  kind: string;
  client_name: string | null;
  amount: number;
  sale_id: string | null;
  movement_id: string | null;
  transfer_id: string | null;
  created_at: string;
};

type SaleItemRow = {
  id: string;
  product_name: string;
  mode: string;
  unit_label: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type MovementRow = {
  id: string;
  quantity: number;
  quantity_units: number;
  mode: string;
  unit_price: number;
  reason: string | null;
  reference: string | null;
  product_id: string;
  products: { name: string; retail_unit: string; wholesale_unit: string } | null;
};

function InvoicesPage() {
  const [selected, setSelected] = useState<InvoiceRow | null>(null);
  const [editing, setEditing] = useState<InvoiceRow | null>(null);
  const [clientName, setClientName] = useState("");
  const { siteId } = useSite();
  const { data: me } = useCurrentUser();
  const isAdmin = Boolean(me?.isAdmin);
  const queryClient = useQueryClient();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices", siteId ?? "all"],
    queryFn: async () => {
      let request = supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (siteId) request = request.eq("site_id", siteId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["product-stocks"] });
    void queryClient.invalidateQueries({ queryKey: ["product-stocks-by-site"] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["sales"] });
    void queryClient.invalidateQueries({ queryKey: ["movements"] });
    void queryClient.invalidateQueries({ queryKey: ["transfers"] });
  }

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("invoices")
        .update({ client_name: clientName.trim() || null })
        .eq("id", editing.id);
      if (error) throw error;
      if (editing.sale_id) {
        await supabase
          .from("sales")
          .update({ client_name: clientName.trim() || null })
          .eq("id", editing.sale_id);
      }
      await logActivity("Document modifié", "factures", editing.number);
    },
    onSuccess: () => {
      toast.success("Document modifié.");
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // La suppression passe par la base : les stocks sont remis dans leur état d'avant le document.
  const remove = useMutation({
    mutationFn: async (invoice: InvoiceRow) => {
      const { error } = await supabase.rpc("delete_invoice_document", { _invoice_id: invoice.id });
      if (error) throw error;
      await logActivity("Document supprimé", "factures", invoice.number);
    },
    onSuccess: () => {
      toast.success("Document supprimé, les stocks ont été réajustés.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sales = (invoices ?? []).filter((i) => i.kind === "vente");
  const entries = (invoices ?? []).filter((i) => i.kind === "entree");
  const transfersDocs = (invoices ?? []).filter((i) => i.kind === "transfert");

  return (
    <PageShell
      title="Factures"
      description="Chaque vente produit une facture, chaque entrée de stock un bon d'entrée. Cliquez sur « Voir » pour afficher le document et l'imprimer. La suppression d'un document réajuste automatiquement les stocks."
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Factures de vente" value={String(sales.length)} />
        <StatCard label="Bons d'entrée" value={String(entries.length)} />
        <StatCard label="Bons de transfert" value={String(transfersDocs.length)} />
        <StatCard
          label="Chiffre facturé"
          value={money(sales.reduce((s, i) => s + Number(i.amount), 0))}
        />
      </div>

      <DocumentDialog doc={selected} onClose={() => setSelected(null)} />

      <Dialog open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier {editing?.number}</DialogTitle>
            <DialogDescription>
              Corrigez le nom du client ou du fournisseur. Pour corriger les quantités, supprimez le
              document (les stocks sont réajustés) puis ressaisissez-le.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cln">Client / fournisseur</Label>
            <Input
              id="cln"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              maxLength={120}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Annuler
            </Button>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Panel title={`${invoices?.length ?? 0} document(s)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Numéro</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Client / fournisseur</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Montant</th>
                <th className="px-4 py-2" data-print="hide" />
              </tr>
            </thead>
            <tbody>
              {(invoices ?? []).length === 0 ? (
                <EmptyRow colSpan={6} label={isLoading ? "Chargement…" : "Aucun document."} />
              ) : (
                (invoices ?? []).map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{i.number}</td>
                    <td className="px-4 py-2">
                      <Badge variant={i.kind === "vente" ? "default" : "secondary"}>
                        {i.kind === "vente" ? "Vente" : i.kind === "transfert" ? "Transfert" : "Entrée"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">{i.client_name}</td>

                    <td className="px-4 py-2 text-xs">{dateTime(i.created_at)}</td>
                    <td className="px-4 py-2 num">{money(i.amount)}</td>
                    <td className="px-4 py-2 text-right" data-print="hide">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => setSelected(i)}>
                          Voir
                        </Button>
                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Modifier"
                              onClick={() => {
                                setEditing(i);
                                setClientName(i.client_name ?? "");
                              }}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Supprimer"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Supprimer ${i.number} ? Les stocks concernés seront automatiquement réajustés.`,
                                  )
                                )
                                  remove.mutate(i);
                              }}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
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


function DocumentDialog({ doc, onClose }: { doc: InvoiceRow | null; onClose: () => void }) {
  const { data: settings } = useSettings();
  const isSale = doc?.kind === "vente";
  const isTransfer = doc?.kind === "transfert";
  const { siteName } = useSite();

  useEffect(() => {
    if (!doc) return;
    document.body.classList.add("printing-invoice");
    return () => document.body.classList.remove("printing-invoice");
  }, [doc]);

  const { data: items } = useQuery({
    queryKey: ["sale-items", doc?.sale_id],
    enabled: Boolean(doc?.sale_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("id, product_name, mode, unit_label, quantity, unit_price, line_total")
        .eq("sale_id", doc?.sale_id ?? "");
      if (error) throw error;
      return (data ?? []) as SaleItemRow[];
    },
  });

  const { data: movement } = useQuery({
    queryKey: ["invoice-movement", doc?.movement_id],
    enabled: Boolean(doc?.movement_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movements")
        .select("id, quantity, quantity_units, mode, unit_price, reason, reference, product_id, products(name, retail_unit, wholesale_unit)")
        .eq("id", doc?.movement_id ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MovementRow | null;
    },
  });

  const { data: transfer } = useQuery({
    queryKey: ["invoice-transfer", doc?.transfer_id],
    enabled: Boolean(doc?.transfer_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("id, quantity_units, unit_price, note, from_site_id, to_site_id, products(name, retail_unit)")
        .eq("id", doc?.transfer_id ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as {
        id: string;
        quantity_units: number;
        unit_price: number;
        note: string | null;
        from_site_id: string;
        to_site_id: string;
        products: { name: string; retail_unit: string } | null;
      } | null;
    },
  });

  if (!doc) return null;
  const docLabel = isSale ? "Facture" : isTransfer ? "Bon de transfert" : "Bon d'entrée";

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-invoice-doc className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader data-print="hide">
          <DialogTitle>
            {docLabel} {doc.number}
          </DialogTitle>
          <DialogDescription>Imprimez ou exportez ce document en PDF.</DialogDescription>
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
                {docLabel} {doc.number}
              </p>
              <p>{dateTime(doc.created_at)}</p>
              {isTransfer ? (
                <p>
                  {siteName(transfer?.from_site_id)} → {siteName(transfer?.to_site_id)}
                </p>
              ) : (
                <p>{isSale ? "Client" : "Fournisseur"} : {doc.client_name ?? "—"}</p>
              )}
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
              {isTransfer
                ? transfer && (
                    <tr className="border-t border-border">
                      <td className="px-3 py-2">{transfer.products?.name ?? "—"}</td>
                      <td className="px-3 py-2 num">
                        {qty(transfer.quantity_units)} {transfer.products?.retail_unit}
                      </td>
                      <td className="px-3 py-2 num">{money(transfer.unit_price)}</td>
                      <td className="px-3 py-2 text-right num">{money(doc.amount)}</td>
                    </tr>
                  )
                : isSale
                ? (items ?? []).map((it) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        {it.product_name}
                        <span className="ml-1 text-xs text-muted-foreground">({it.mode})</span>
                      </td>
                      <td className="px-3 py-2 num">
                        {qty(it.quantity)} {it.unit_label}
                      </td>
                      <td className="px-3 py-2 num">{money(it.unit_price)}</td>
                      <td className="px-3 py-2 text-right num">{money(it.line_total)}</td>
                    </tr>
                  ))
                : movement && (
                    <tr className="border-t border-border">
                      <td className="px-3 py-2">
                        {movement.products?.name ?? "—"}
                        <span className="ml-1 text-xs text-muted-foreground">({movement.mode})</span>
                      </td>
                      <td className="px-3 py-2 num">
                        {qty(movement.quantity)}{" "}
                        {movement.mode === "gros"
                          ? movement.products?.wholesale_unit
                          : movement.products?.retail_unit}
                      </td>
                      <td className="px-3 py-2 num">{money(movement.unit_price)}</td>
                      <td className="px-3 py-2 text-right num">{money(doc.amount)}</td>
                    </tr>
                  )}
            </tbody>
          </table>

          <div className="ml-auto w-full max-w-xs border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Montant total</span>
              <span className="font-display font-bold num">{money(doc.amount)}</span>
            </div>
          </div>

          {!isSale && !isTransfer && movement?.reason && (
            <p className="text-xs text-muted-foreground">Motif : {movement.reason}</p>
          )}
          {isTransfer && transfer?.note && (
            <p className="text-xs text-muted-foreground">Motif : {transfer.note}</p>
          )}
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
