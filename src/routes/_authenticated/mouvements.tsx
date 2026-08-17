import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow } from "@/components/PageShell";
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
import { Badge } from "@/components/ui/badge";
import { money, qty, dateTime } from "@/lib/format";
import { logActivity, useCurrentUser } from "@/hooks/useCurrentUser";
import { useSite } from "@/hooks/useSite";
import { useProducts } from "./produits";
import { nextDocumentNumber } from "@/lib/documents";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mouvements")({
  head: () => ({
    meta: [
      { title: "Mouvements de stock — Stocka" },
      { name: "description", content: "Toutes les entrées et sorties d'articles, en détail ou en gros." },
      { property: "og:title", content: "Mouvements de stock — Stocka" },
      { property: "og:description", content: "Historique complet des entrées et sorties de stock." },
    ],
  }),
  component: MovementsPage,
});

type MovementRow = {
  id: string;
  kind: string;
  mode: string;
  quantity: number;
  quantity_units: number;
  unit_price: number;
  reason: string | null;
  reference: string | null;
  created_at: string;
  user_id: string | null;
  products: { name: string; retail_unit: string; wholesale_unit: string } | null;
  site_id: string | null;
};

const TWO_DAYS_ISO = () => new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();

function MovementsPage() {
  const { data: me } = useCurrentUser();
  const isEmployee = me ? !me.isAdmin : false;
  const { siteId, siteName, allSites } = useSite();
  const { data: products } = useProducts();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"entree" | "sortie">("entree");
  const [filter, setFilter] = useState<"all" | "entree" | "sortie">("all");
  const [form, setForm] = useState({
    product_id: "",
    mode: "gros",
    quantity: "1",
    unit_price: "0",
    reason: "",
  });

  const { data: movements, isLoading } = useQuery({
    queryKey: ["movements", isEmployee ? me?.id : "all", siteId ?? "all"],
    enabled: Boolean(me),
    queryFn: async () => {
      let request = supabase
        .from("movements")
        .select("*, products(name, retail_unit, wholesale_unit)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (isEmployee && me) {
        request = request.eq("user_id", me.id).gte("created_at", TWO_DAYS_ISO());
      }
      if (siteId) request = request.eq("site_id", siteId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as MovementRow[];
    },
  });

  const { data: operators } = useQuery({
    queryKey: ["movement-operators"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, login_id");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[p.id] = p.full_name || p.login_id || "—";
      return map;
    },
  });

  const product = (products ?? []).find((p) => p.id === form.product_id);
  const quantityUnits =
    (Number(form.quantity) || 0) * (form.mode === "gros" ? Number(product?.units_per_package ?? 1) : 1);

  const save = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("Sélectionnez un article.");
      if (quantityUnits <= 0) throw new Error("Quantité invalide.");
      if (!siteId) throw new Error("Choisissez un point de vente précis avant d'enregistrer un mouvement.");
      const { data: auth } = await supabase.auth.getUser();
      let reference: string | null = null;
      if (kind === "entree") reference = await nextDocumentNumber("entree");

      const { data: inserted, error } = await supabase
        .from("movements")
        .insert({
          product_id: product.id,
          kind,
          mode: form.mode,
          quantity: Number(form.quantity),
          quantity_units: quantityUnits,
          unit_price: Number(form.unit_price) || 0,
          reason: form.reason.trim() || null,
          reference,
          user_id: auth.user?.id ?? null,
          site_id: siteId,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (kind === "entree" && reference) {
        await supabase.from("invoices").insert({
          number: reference,
          kind: "entree",
          client_name: form.reason.trim() || "Fournisseur",
          amount: (Number(form.unit_price) || 0) * quantityUnits,
          movement_id: inserted.id,
          user_id: auth.user?.id ?? null,
          site_id: siteId,
        });
      }
      await logActivity(
        kind === "entree" ? "Entrée de stock" : "Sortie de stock",
        "mouvements",
        `${product.name} — ${qty(quantityUnits)} ${product.retail_unit}`,
      );
      return reference;
    },
    onSuccess: (reference) => {
      toast.success(reference ? `Entrée enregistrée — bon ${reference}` : "Sortie enregistrée.");
      setOpen(false);
      setForm({ product_id: "", mode: "gros", quantity: "1", unit_price: "0", reason: "" });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (movements ?? []).filter((m) => filter === "all" || m.kind === filter);

  return (
    <PageShell
      title="Mouvements"
      description={
        isEmployee
          ? "Vos mouvements des 2 derniers jours, en consultation seule. Contactez un administrateur pour toute correction."
          : "Chaque entrée génère automatiquement un bon d'entrée numéroté. Les sorties couvrent la consommation, les casses et les transferts."
      }
      actions={
        isEmployee ? undefined : (
        <>
          <Button
            size="sm"
            onClick={() => {
              setKind("entree");
              setOpen(true);
            }}
          >
            <ArrowDownToLine className="size-4" /> Entrée
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setKind("sortie");
              setOpen(true);
            }}
          >
            <ArrowUpFromLine className="size-4" /> Sortie
          </Button>
        </>
        )
      }
    >
      <div data-print="hide" className="flex gap-2">
        {(["all", "entree", "sortie"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Tout" : f === "entree" ? "Entrées" : "Sorties"}
          </Button>
        ))}
      </div>

      <Panel title={`${rows.length} mouvement(s)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Article</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Quantité</th>
                <th className="px-4 py-2">Équivalent détail</th>
                <th className="px-4 py-2">Valeur</th>
                <th className="px-4 py-2">Opérateur</th>
                {allSites && <th className="px-4 py-2">Point de vente</th>}
                <th className="px-4 py-2">Référence / motif</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={allSites ? 9 : 8} label={isLoading ? "Chargement…" : "Aucun mouvement enregistré."} />
              ) : (
                rows.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-2 whitespace-nowrap text-xs">{dateTime(m.created_at)}</td>
                    <td className="px-4 py-2 font-medium">{m.products?.name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant={m.kind === "entree" ? "default" : "destructive"}>
                        {m.kind === "entree" ? "Entrée" : "Sortie"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 num">
                      {qty(m.quantity)}{" "}
                      {m.mode === "gros" ? m.products?.wholesale_unit : m.products?.retail_unit}
                    </td>
                    <td className="px-4 py-2 num">
                      {qty(m.quantity_units)} {m.products?.retail_unit}
                    </td>
                    <td className="px-4 py-2 num">{money(m.unit_price * m.quantity_units)}</td>
                    <td className="px-4 py-2 text-xs">
                      {(m.user_id ? operators?.[m.user_id] : null) ?? "—"}
                    </td>
                    {allSites && (
                      <td className="px-4 py-2 text-xs">{siteName(m.site_id)}</td>
                    )}
                    <td className="px-4 py-2 text-xs">
                      {m.reference ? <span className="font-medium">{m.reference}</span> : null}
                      {m.reference && m.reason ? " · " : ""}
                      {m.reason}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{kind === "entree" ? "Nouvelle entrée" : "Nouvelle sortie"}</DialogTitle>
            <DialogDescription>
              Choisissez l'unité : en gros la quantité est convertie automatiquement en unités de détail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prod">Article</Label>
              <select
                id="prod"
                value={form.product_id}
                onChange={(e) => {
                  const next = (products ?? []).find((p) => p.id === e.target.value);
                  setForm({
                    ...form,
                    product_id: e.target.value,
                    unit_price: next
                      ? String(
                          kind === "entree"
                            ? Number(next.cost_price || 0)
                            : Number(next.retail_price || 0),
                        )
                      : "0",
                  });
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Sélectionner —</option>
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({qty(p.stock_units)} {p.retail_unit} en stock)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mode">Unité</Label>
                <select
                  id="mode"
                  value={form.mode}
                  onChange={(e) => setForm({ ...form, mode: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="gros">En gros ({product?.wholesale_unit ?? "colis"})</option>
                  <option value="detail">En détail ({product?.retail_unit ?? "unité"})</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="q">Quantité</Label>
                <Input
                  id="q"
                  type="number"
                  min="0"
                  step="any"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="up">Prix unitaire (par unité de détail)</Label>
              <Input
                id="up"
                type="number"
                min="0"
                step="any"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">{kind === "entree" ? "Fournisseur / motif" : "Motif"}</Label>
              <Input
                id="reason"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                maxLength={160}
              />
            </div>

            {product && (
              <div className="grid gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:grid-cols-3">
                <span>
                  Stock actuel :{" "}
                  <strong className="text-foreground num">
                    {qty(product.stock_units)} {product.retail_unit}
                  </strong>
                </span>
                <span>
                  Prix d'achat enregistré : <strong className="text-foreground num">{money(product.cost_price)}</strong>
                </span>
                <span>
                  Stock après opération :{" "}
                  <strong className="text-foreground num">
                    {qty(Number(product.stock_units) + (kind === "entree" ? quantityUnits : -quantityUnits))}{" "}
                    {product.retail_unit}
                  </strong>
                </span>
              </div>
            )}

            {product && (
              <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Impact stock : {kind === "entree" ? "+" : "−"}
                {qty(quantityUnits)} {product.retail_unit} · valeur{" "}
                {money((Number(form.unit_price) || 0) * quantityUnits)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
