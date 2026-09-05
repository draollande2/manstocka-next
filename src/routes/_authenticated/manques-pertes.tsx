import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow, StatCard } from "@/components/PageShell";
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
import { money, qty, dateTime, periodLabel, periodOptions, currentPeriod } from "@/lib/format";
import { logActivity, useCurrentUser } from "@/hooks/useCurrentUser";
import { useSite } from "@/hooks/useSite";
import { useProducts } from "./produits";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/manques-pertes")({
  head: () => ({
    meta: [
      { title: "Manques & Pertes — Stocka" },
      { name: "description", content: "Manquants de caisse et pertes de marchandise imputés aux collaborateurs." },
      { property: "og:title", content: "Manques & Pertes — Stocka" },
      { property: "og:description", content: "Enregistrez les manques et pertes et retenez-les sur le salaire." },
    ],
  }),
  component: LossesPage,
});

type LossRow = {
  id: string;
  employee_id: string | null;
  kind: string;
  quantity_units: number;
  amount: number;
  description: string | null;
  period: string;
  created_at: string;
  products: { name: string; retail_unit: string } | null;
};

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, login_id, phone, base_salary, active")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        full_name: string;
        login_id: string | null;
        phone: string | null;
        base_salary: number;
        active: boolean;
      }>;
    },
  });
}

function LossesPage() {
  const { siteId } = useSite();
  const { data: user } = useCurrentUser();
  const { data: products } = useProducts();
  const { data: employees } = useEmployees();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    employee_id: "",
    product_id: "",
    kind: "manque",
    quantity_units: "0",
    amount: "",
    description: "",
  });

  const { data: losses, isLoading } = useQuery({
    queryKey: ["losses", period, siteId ?? "all"],
    queryFn: async () => {
      let request = supabase
        .from("losses")
        .select("*, products(name, retail_unit)")
        .eq("period", period)
        .order("created_at", { ascending: false });
      if (siteId) request = request.eq("site_id", siteId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as LossRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount) || 0;
      if (amount <= 0) throw new Error("Le montant à retenir est obligatoire.");
      if (!siteId) throw new Error("Choisissez un point de vente précis avant de déclarer un manque ou une perte.");
      const { error } = await supabase.from("losses").insert({
        employee_id: form.employee_id || null,
        product_id: form.product_id || null,
        kind: form.kind,
        quantity_units: Number(form.quantity_units) || 0,
        amount,
        description: form.description.trim() || null,
        period,
        site_id: siteId,
      });
      if (error) throw error;
      await logActivity("Manque / perte enregistré", "manques-pertes", `${form.kind} — ${money(amount)}`);
    },
    onSuccess: () => {
      toast.success("Enregistré.");
      setOpen(false);
      setForm({ ...form, quantity_units: "0", amount: "", description: "" });
      void queryClient.invalidateQueries({ queryKey: ["losses"] });
      void queryClient.invalidateQueries({ queryKey: ["salaries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isEmployee = user ? !user.isAdmin : false;
  const rows = (losses ?? []).filter((l) => !isEmployee || l.employee_id === user?.id);
  const totalManques = rows.filter((r) => r.kind === "manque").reduce((s, r) => s + Number(r.amount), 0);
  const totalPertes = rows.filter((r) => r.kind === "perte").reduce((s, r) => s + Number(r.amount), 0);

  return (
    <PageShell
      title="Manques & Pertes"
      description={`${isEmployee ? "Vos manques et pertes" : "Manquants de caisse et marchandises perdues"} — ${periodLabel(period)}. Les montants sont automatiquement retenus sur le salaire du mois.`}
      actions={
        <>
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
          {user?.isAdmin && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Déclarer
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Manques de caisse" value={money(totalManques)} />
        <StatCard label="Pertes marchandise" value={money(totalPertes)} />
        <StatCard label="Total retenu" value={money(totalManques + totalPertes)} />
      </div>

      <Panel title={`${rows.length} déclaration(s)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Collaborateur</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Article</th>
                <th className="px-4 py-2">Quantité</th>
                <th className="px-4 py-2">Montant retenu</th>
                <th className="px-4 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={7} label={isLoading ? "Chargement…" : "Aucun manque ni perte ce mois."} />
              ) : (
                rows.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-4 py-2 text-xs">{dateTime(l.created_at)}</td>
                    <td className="px-4 py-2 font-medium">{(employees ?? []).find((e) => e.id === l.employee_id)?.full_name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant={l.kind === "manque" ? "destructive" : "secondary"}>
                        {l.kind === "manque" ? "Manque" : "Perte"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">{l.products?.name ?? "—"}</td>
                    <td className="px-4 py-2 num">
                      {l.quantity_units ? `${qty(l.quantity_units)} ${l.products?.retail_unit ?? ""}` : "—"}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Déclarer un manque ou une perte</DialogTitle>
            <DialogDescription>
              Le montant est retenu sur le salaire de {periodLabel(period)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emp">Collaborateur</Label>
              <select
                id="emp"
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Sélectionner —</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="kind">Type</Label>
                <select
                  id="kind"
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="manque">Manque de caisse</option>
                  <option value="perte">Perte de marchandise</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amt">Montant retenu</Label>
                <Input id="amt" type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prod">Article concerné (optionnel)</Label>
                <select
                  id="prod"
                  value={form.product_id}
                  onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Aucun —</option>
                  {(products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qu">Quantité perdue (détail)</Label>
                <Input id="qu" type="number" min="0" step="any" value={form.quantity_units} onChange={(e) => setForm({ ...form, quantity_units: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Input id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={200} />
            </div>
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
