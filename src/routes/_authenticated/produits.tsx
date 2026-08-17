import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import { money, qty } from "@/lib/format";
import { useCurrentUser, logActivity } from "@/hooks/useCurrentUser";
import { useProductStocks, stockOf } from "@/hooks/useStocks";
import { useSite } from "@/hooks/useSite";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/produits")({
  head: () => ({
    meta: [
      { title: "Produits & Articles — Stocka" },
      {
        name: "description",
        content: "Articles vendus en détail (Kg, unité) et en gros (sac, lot) avec conversion automatique.",
      },
      { property: "og:title", content: "Produits & Articles — Stocka" },
      { property: "og:description", content: "Gérez vos articles détail et gros, prix et seuils d'alerte." },
    ],
  }),
  component: ProductsPage,
});

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  retail_unit: string;
  wholesale_unit: string;
  units_per_package: number;
  cost_price: number;
  retail_price: number;
  wholesale_price: number;
  stock_units: number;
  min_stock_units: number;
  sale_mode: string;
};

const EMPTY = {
  name: "",
  sku: "",
  category: "",
  retail_unit: "Kg",
  wholesale_unit: "Sac",
  units_per_package: "50",
  cost_price: "0",
  retail_price: "0",
  wholesale_price: "0",
  min_stock_units: "0",
  sale_mode: "both",
};

/**
 * Articles du point de vente actif : un article appartient à un point de vente
 * dès qu'il y possède une ligne de stock. Aucun article d'un autre point de
 * vente n'est visible.
 */
export function useProducts() {
  const { siteId } = useSite();
  return useQuery({
    queryKey: ["products", siteId ?? "all"],
    queryFn: async () => {
      if (siteId) {
        const { data, error } = await supabase
          .from("products")
          .select("*, product_stocks!inner(site_id)")
          .eq("product_stocks.site_id", siteId)
          .order("name");
        if (error) throw error;
        return (data ?? []).map(({ product_stocks: _s, ...p }) => p) as ProductRow[];
      }
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });
}

function ProductsPage() {
  const { data: user } = useCurrentUser();
  const { data: products, isLoading } = useProducts();
  const { data: stocks } = useProductStocks();
  const { allSites, siteId, siteName } = useSite();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        category: form.category.trim() || null,
        retail_unit: form.retail_unit.trim() || "Unité",
        wholesale_unit: form.wholesale_unit.trim() || "Lot",
        units_per_package: Number(form.units_per_package) || 1,
        cost_price: Number(form.cost_price) || 0,
        retail_price: Number(form.retail_price) || 0,
        wholesale_price: Number(form.wholesale_price) || 0,
        min_stock_units: Number(form.min_stock_units) || 0,
        sale_mode: form.sale_mode,
      };
      if (!payload.name) throw new Error("Le nom de l'article est obligatoire.");
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
        await logActivity("Modification article", "produits", payload.name);
      } else {
        if (!siteId)
          throw new Error("Choisissez un point de vente précis avant de créer un article.");
        const { data: created, error } = await supabase
          .from("products")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        // L'article n'existe que dans le point de vente actif.
        const { error: stockError } = await supabase.from("product_stocks").insert({
          product_id: created.id,
          site_id: siteId,
          stock_units: 0,
          min_stock_units: payload.min_stock_units,
        });
        if (stockError) throw stockError;
        await logActivity("Création article", "produits", payload.name);
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Article modifié." : "Article ajouté.");
      setOpen(false);
      setEditing(null);
      setForm({ ...EMPTY });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (p: ProductRow) => {
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw error;
      await logActivity("Suppression article", "produits", p.name);
    },
    onSuccess: () => {
      toast.success("Article supprimé.");
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startCreate() {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  }

  function startEdit(p: ProductRow) {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku ?? "",
      category: p.category ?? "",
      retail_unit: p.retail_unit,
      wholesale_unit: p.wholesale_unit,
      units_per_package: String(p.units_per_package),
      cost_price: String(p.cost_price),
      retail_price: String(p.retail_price),
      wholesale_price: String(p.wholesale_price),
      min_stock_units: String(p.min_stock_units),
      sale_mode: p.sale_mode,
    });
    setOpen(true);
  }

  return (
    <PageShell
      title="Produits / Articles"
      description="Un article est livré par colis (sac de 50 Kg, lot de 100 tôles) et se vend en détail à l'unité de base ou en gros au colis complet."
      actions={
        user?.isAdmin ? (
          <Button size="sm" onClick={startCreate}>
            <Plus className="size-4" /> Nouvel article
          </Button>
        ) : null
      }
    >
      <Panel title={`${products?.length ?? 0} article(s)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Article</th>
                <th className="px-4 py-2">Conditionnement</th>
                <th className="px-4 py-2">Prix détail</th>
                <th className="px-4 py-2">Prix gros</th>
                <th className="px-4 py-2">
                  Stock {allSites ? "(tous les points)" : `(${siteName(siteId)})`}
                </th>

                <th className="px-4 py-2">Vente</th>
                {user?.isAdmin && <th className="px-4 py-2" data-print="hide" />}
              </tr>
            </thead>
            <tbody>
              {(products ?? []).length === 0 ? (
                <EmptyRow colSpan={7} label={isLoading ? "Chargement…" : "Aucun article enregistré."} />
              ) : (
                (products ?? []).map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.category || "Sans catégorie"} {p.sku ? `· ${p.sku}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      1 {p.wholesale_unit} = {qty(p.units_per_package)} {p.retail_unit}
                    </td>
                    <td className="px-4 py-2 num">
                      {money(p.retail_price)}
                      <span className="text-xs text-muted-foreground"> /{p.retail_unit}</span>
                    </td>
                    <td className="px-4 py-2 num">
                      {money(p.wholesale_price)}
                      <span className="text-xs text-muted-foreground"> /{p.wholesale_unit}</span>
                    </td>
                    <td className="px-4 py-2 num">
                      {(() => {
                        const st = stockOf(stocks, p.id);
                        const threshold = st.min_stock_units || Number(p.min_stock_units);
                        return (
                          <>
                            <span className={st.stock_units <= threshold ? "text-destructive" : ""}>
                              {qty(st.stock_units)} {p.retail_unit}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              ≈ {qty(st.stock_units / Number(p.units_per_package))} {p.wholesale_unit}
                            </p>
                          </>
                        );
                      })()}
                    </td>

                    <td className="px-4 py-2">
                      <Badge variant="secondary">
                        {p.sale_mode === "both" ? "Détail + Gros" : p.sale_mode === "detail" ? "Détail" : "Gros"}
                      </Badge>
                    </td>
                    {user?.isAdmin && (
                      <td className="px-4 py-2 text-right" data-print="hide">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => startEdit(p)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Supprimer « ${p.name} » ?`)) remove.mutate(p);
                            }}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier l'article" : "Nouvel article"}</DialogTitle>
            <DialogDescription>
              Exemple : « Riz », unité de détail = Kg, unité de gros = Sac, 50 Kg par sac.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Nom de l'article</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Catégorie</Label>
              <Input id="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={60} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">Référence</Label>
              <Input id="sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} maxLength={40} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retail_unit">Unité de détail</Label>
              <Input id="retail_unit" placeholder="Kg, Unité, Litre" value={form.retail_unit} onChange={(e) => setForm({ ...form, retail_unit: e.target.value })} maxLength={20} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wholesale_unit">Unité de gros</Label>
              <Input id="wholesale_unit" placeholder="Sac, Lot, Carton" value={form.wholesale_unit} onChange={(e) => setForm({ ...form, wholesale_unit: e.target.value })} maxLength={20} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="upp">Quantité de détail contenue dans 1 unité de gros</Label>
              <Input id="upp" type="number" min="0.001" step="any" value={form.units_per_package} onChange={(e) => setForm({ ...form, units_per_package: e.target.value })} />
              <p className="text-xs text-muted-foreground">
                1 {form.wholesale_unit || "colis"} = {form.units_per_package || 0} {form.retail_unit || "unité"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">Prix d'achat (par unité de détail)</Label>
              <Input id="cost" type="number" min="0" step="any" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minstock">Seuil d'alerte (unités de détail)</Label>
              <Input id="minstock" type="number" min="0" step="any" value={form.min_stock_units} onChange={(e) => setForm({ ...form, min_stock_units: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pretail">Prix de vente détail</Label>
              <Input id="pretail" type="number" min="0" step="any" value={form.retail_price} onChange={(e) => setForm({ ...form, retail_price: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pwholesale">Prix de vente gros</Label>
              <Input id="pwholesale" type="number" min="0" step="any" value={form.wholesale_price} onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="mode">Modes de vente autorisés</Label>
              <select
                id="mode"
                value={form.sale_mode}
                onChange={(e) => setForm({ ...form, sale_mode: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="both">Détail et Gros</option>
                <option value="detail">Détail uniquement</option>
                <option value="gros">Gros uniquement</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
