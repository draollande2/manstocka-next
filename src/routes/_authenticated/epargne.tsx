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
import { money, dateTime } from "@/lib/format";
import { logActivity, useCurrentUser } from "@/hooks/useCurrentUser";
import { useSite } from "@/hooks/useSite";
import { useEmployees } from "./manques-pertes";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/epargne")({
  head: () => ({
    meta: [
      { title: "Comptes d'épargne — Stocka" },
      { name: "description", content: "Épargne des collaborateurs : dépôts, retraits et validation par l'administrateur." },
      { property: "og:title", content: "Comptes d'épargne — Stocka" },
      { property: "og:description", content: "Chaque collaborateur épargne, l'administrateur valide les retraits." },
    ],
  }),
  component: SavingsPage,
});

type AccountRow = { id: string; employee_id: string; balance: number };
type TxRow = {
  id: string;
  account_id: string;
  employee_id: string;
  kind: string;
  amount: number;
  source: string | null;
  status: string;
  note: string | null;
  created_at: string;
};

function SavingsPage() {
  const { data: user } = useCurrentUser();
  const { siteId } = useSite();
  const { data: allEmployees } = useEmployees();
  const queryClient = useQueryClient();

  // Collaborateurs rattachés au point de vente actif (via user_sites)
  const { data: siteEmployeeIds } = useQuery({
    queryKey: ["site-employee-ids", siteId ?? "all"],
    queryFn: async () => {
      if (siteId == null) return null;
      const { data, error } = await supabase.from("user_sites").select("user_id").eq("site_id", siteId);
      if (error) throw error;
      return (data ?? []).map((r) => r.user_id);
    },
  });
  const employees = siteId == null
    ? allEmployees
    : (allEmployees ?? []).filter((e) => (siteEmployeeIds ?? []).includes(e.id));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", kind: "depot", amount: "", note: "" });

  const { data: accounts } = useQuery({
    queryKey: ["savings", "accounts", siteId ?? "all"],
    enabled: siteId == null || siteEmployeeIds !== undefined,
    queryFn: async () => {
      let request = supabase.from("savings_accounts").select("id, employee_id, balance");
      if (siteId != null) request = request.in("employee_id", siteEmployeeIds ?? []);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as AccountRow[];
    },
  });

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["savings", "transactions", siteId ?? "all"],
    enabled: siteId == null || siteEmployeeIds !== undefined,
    queryFn: async () => {
      let request = supabase
        .from("savings_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (siteId != null) request = request.in("employee_id", siteEmployeeIds ?? []);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as TxRow[];
    },
  });

  const nameOf = (id: string) => (employees ?? []).find((e) => e.id === id)?.full_name ?? "—";

  const create = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount) || 0;
      // Un employé ne peut que demander un retrait ; seul l'administrateur peut créditer.
      const kind = user?.isAdmin ? form.kind : "retrait";
      const employeeId = user?.isAdmin ? form.employee_id : user?.id;
      if (!employeeId) throw new Error("Sélectionnez un collaborateur.");
      if (amount <= 0) throw new Error("Montant invalide.");

      let account = (accounts ?? []).find((a) => a.employee_id === employeeId) ?? null;
      if (!account) {
        if (!user?.isAdmin) throw new Error("Aucun compte d'épargne ouvert pour vous.");
        const { data: created, error } = await supabase
          .from("savings_accounts")
          .insert({ employee_id: employeeId, balance: 0 })
          .select("id, employee_id, balance")
          .single();
        if (error) throw error;
        account = created as AccountRow;
      }
      if (kind === "retrait") {
        const pendingWithdrawals = (transactions ?? [])
          .filter((t) => t.employee_id === employeeId && t.kind === "retrait" && t.status === "en_attente")
          .reduce((s, t) => s + Number(t.amount), 0);
        if (amount + pendingWithdrawals > Number(account.balance)) {
          throw new Error("Solde d'épargne insuffisant (demandes en attente incluses).");
        }
      }

      const autoValidate = Boolean(user?.isAdmin) && kind === "depot";
      const { error: txError } = await supabase.from("savings_transactions").insert({
        account_id: account.id,
        employee_id: employeeId,
        kind,
        amount,
        source: "manuel",
        status: autoValidate ? "valide" : "en_attente",
        note: form.note.trim() || null,
        requested_by: user?.id ?? null,
        approved_by: autoValidate ? (user?.id ?? null) : null,
      });
      if (txError) throw txError;

      if (autoValidate) {
        const { error: balError } = await supabase
          .from("savings_accounts")
          .update({ balance: Number(account.balance) + amount })
          .eq("id", account.id);
        if (balError) throw balError;
      }

      await logActivity(
        kind === "depot" ? "Dépôt épargne" : "Demande de retrait épargne",
        "epargne",
        money(amount),
      );
    },
    onSuccess: () => {
      toast.success(
        user?.isAdmin ? "Opération enregistrée." : "Demande de retrait envoyée à l'administrateur.",
      );
      setOpen(false);
      setForm({ ...form, amount: "", note: "" });
      void queryClient.invalidateQueries({ queryKey: ["savings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async (payload: { tx: TxRow; status: "valide" | "refuse" }) => {
      const account = (accounts ?? []).find((a) => a.id === payload.tx.account_id) ?? null;
      const amount = Number(payload.tx.amount);

      if (payload.status === "valide") {
        if (!account) throw new Error("Compte d'épargne introuvable.");
        const delta = payload.tx.kind === "retrait" ? -amount : amount;
        const newBalance = Number(account.balance) + delta;
        if (newBalance < 0) throw new Error("Solde insuffisant pour valider ce retrait.");
        const { error: balError } = await supabase
          .from("savings_accounts")
          .update({ balance: newBalance })
          .eq("id", account.id);
        if (balError) throw balError;
      }

      const { error } = await supabase
        .from("savings_transactions")
        .update({ status: payload.status, approved_by: user?.id ?? null })
        .eq("id", payload.tx.id);
      if (error) throw error;

      await logActivity(
        payload.status === "valide" ? "Retrait épargne validé" : "Retrait épargne refusé",
        "epargne",
        money(payload.tx.amount),
      );
    },
    onSuccess: () => {
      toast.success("Décision enregistrée.");
      void queryClient.invalidateQueries({ queryKey: ["savings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const visibleAccounts = (accounts ?? []).filter((a) => user?.isAdmin || a.employee_id === user?.id);
  const visibleTx = (transactions ?? []).filter((t) => user?.isAdmin || t.employee_id === user?.id);
  const total = visibleAccounts.reduce((s, a) => s + Number(a.balance), 0);
  const pending = visibleTx.filter((t) => t.status === "en_attente");

  return (
    <PageShell
      title="Compte d'épargne"
      description={
        user?.isAdmin
          ? "Les dépôts sont enregistrés par l'administration ou via une retenue sur salaire. Chaque retrait validé est automatiquement déduit du solde du collaborateur."
          : "Vous pouvez uniquement demander un retrait. Après validation par l'administrateur, le montant est automatiquement déduit de votre solde."
      }
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> {user?.isAdmin ? "Opération" : "Demander un retrait"}
        </Button>
      }
    
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Épargne totale" value={money(total)} />
        <StatCard label="Comptes ouverts" value={String(visibleAccounts.length)} />
        <StatCard label="Retraits en attente" value={String(pending.length)} />
      </div>

      <Panel title="Soldes">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Collaborateur</th>
                <th className="px-4 py-2">Solde disponible</th>
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.length === 0 ? (
                <EmptyRow colSpan={2} label="Aucun compte d'épargne ouvert." />
              ) : (
                visibleAccounts.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{nameOf(a.employee_id)}</td>
                    <td className="px-4 py-2 num">{money(a.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Opérations">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Collaborateur</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Montant</th>
                <th className="px-4 py-2">Statut</th>
                {user?.isAdmin && <th className="px-4 py-2" data-print="hide" />}
              </tr>
            </thead>
            <tbody>
              {visibleTx.length === 0 ? (
                <EmptyRow colSpan={7} label={isLoading ? "Chargement…" : "Aucune opération."} />
              ) : (
                visibleTx.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-2 text-xs">{dateTime(t.created_at)}</td>
                    <td className="px-4 py-2 font-medium">{nameOf(t.employee_id)}</td>
                    <td className="px-4 py-2">{t.kind === "depot" ? "Dépôt" : "Retrait"}</td>
                    <td className="px-4 py-2 text-xs">{t.source === "salaire" ? "Salaire" : "Manuel"}</td>
                    <td className="px-4 py-2 num">{money(t.amount)}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          t.status === "valide" ? "default" : t.status === "refuse" ? "destructive" : "secondary"
                        }
                      >
                        {t.status === "valide" ? "Validé" : t.status === "refuse" ? "Refusé" : "En attente"}
                      </Badge>
                    </td>
                    {user?.isAdmin && (
                      <td className="px-4 py-2 text-right" data-print="hide">
                        {t.status === "en_attente" && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => decide.mutate({ tx: t, status: "valide" })}>
                              Valider
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => decide.mutate({ tx: t, status: "refuse" })}
                            >
                              Refuser
                            </Button>
                          </div>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle opération d'épargne</DialogTitle>
            <DialogDescription>
              Un retrait demandé par un employé reste en attente jusqu'à validation d'un administrateur.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {user?.isAdmin && (
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
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="kind">Type</Label>
                {user?.isAdmin ? (
                  <select
                    id="kind"
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="depot">Dépôt</option>
                    <option value="retrait">Retrait</option>
                  </select>
                ) : (
                  <Input id="kind" value="Demande de retrait" readOnly disabled />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="amt">Montant</Label>
                <Input id="amt" type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Input id="note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={200} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
