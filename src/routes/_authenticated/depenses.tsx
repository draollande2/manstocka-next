import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow, StatCard } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money, dateOnly, EXPENSE_CATEGORIES, periodOptions, periodLabel, currentPeriod } from "@/lib/format";
import { logActivity } from "@/hooks/useCurrentUser";
import { useSite } from "@/hooks/useSite";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/depenses")({
  head: () => ({
    meta: [
      { title: "Dépenses — Stocka" },
      { name: "description", content: "Loyer, électricité, eau, glace, aliments, mobilier : suivez chaque dépense." },
      { property: "og:title", content: "Dépenses — Stocka" },
      { property: "og:description", content: "Suivi mensuel de toutes les charges de l'activité." },
    ],
  }),
  component: ExpensesPage,
});

type ExpenseRow = {
  id: string;
  category: string;
  label: string | null;
  amount: number;
  spent_on: string;
};

function ExpensesPage() {
  const { siteId } = useSite();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: EXPENSE_CATEGORIES[0] ?? "Autre",
    label: "",
    amount: "",
    spent_on: new Date().toISOString().slice(0, 10),
  });

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expenses", period, siteId ?? "all"],
    queryFn: async () => {
      const start = `${period}-01`;
      const [y, m] = period.split("-").map(Number);
      const end = new Date(Number(y), Number(m), 1).toISOString().slice(0, 10);
      let request = supabase
        .from("expenses")
        .select("id, category, label, amount, spent_on")
        .gte("spent_on", start)
        .lt("spent_on", end)
        .order("spent_on", { ascending: false });
      if (siteId) request = request.eq("site_id", siteId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount) || 0;
      if (amount <= 0) throw new Error("Montant invalide.");
      if (!siteId) throw new Error("Choisissez un point de vente précis avant d'enregistrer une dépense.");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("expenses").insert({
        category: form.category,
        label: form.label.trim() || null,
        amount,
        spent_on: form.spent_on,
        user_id: auth.user?.id ?? null,
        site_id: siteId,
      });
      if (error) throw error;
      await logActivity("Dépense enregistrée", "depenses", `${form.category} — ${money(amount)}`);
    },
    onSuccess: () => {
      toast.success("Dépense enregistrée.");
      setOpen(false);
      setForm({ ...form, label: "", amount: "" });
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dépense supprimée.");
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = expenses ?? [];
  const total = rows.reduce((s, e) => s + Number(e.amount), 0);
  const byCategory = EXPENSE_CATEGORIES.map((c) => ({
    category: c,
    total: rows.filter((r) => r.category === c).reduce((s, r) => s + Number(r.amount), 0),
  })).filter((c) => c.total > 0);

  return (
    <PageShell
      title="Dépenses"
      description={`Charges de ${periodLabel(period)}.`}
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
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Dépense
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total du mois" value={money(total)} />
        <StatCard label="Nombre de dépenses" value={String(rows.length)} />
        <StatCard
          label="Poste principal"
          value={byCategory.sort((a, b) => b.total - a.total)[0]?.category ?? "—"}
        />
      </div>

      <Panel title="Répartition par catégorie">
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune dépense ce mois.</p>
          ) : (
            byCategory.map((c) => (
              <div key={c.category} className="rounded-md border border-border p-3">
                <p className="text-xs uppercase text-muted-foreground">{c.category}</p>
                <p className="mt-1 num font-semibold">{money(c.total)}</p>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel title="Détail des dépenses">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Catégorie</th>
                <th className="px-4 py-2">Libellé</th>
                <th className="px-4 py-2">Montant</th>
                <th className="px-4 py-2" data-print="hide" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={5} label={isLoading ? "Chargement…" : "Aucune dépense ce mois."} />
              ) : (
                rows.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-4 py-2 text-xs">{dateOnly(e.spent_on)}</td>
                    <td className="px-4 py-2 font-medium">{e.category}</td>
                    <td className="px-4 py-2">{e.label ?? "—"}</td>
                    <td className="px-4 py-2 num">{money(e.amount)}</td>
                    <td className="px-4 py-2 text-right" data-print="hide">
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(e.id)}>
                        <Trash2 className="size-4 text-destructive" />
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle dépense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat">Catégorie</Label>
              <select
                id="cat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lab">Libellé</Label>
              <Input id="lab" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={160} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amt">Montant</Label>
                <Input id="amt" type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} />
              </div>
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
