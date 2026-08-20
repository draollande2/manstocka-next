import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
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
import { money, dateOnly, currentPeriod, periodOptions, periodLabel } from "@/lib/format";
import { logActivity, useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/facturation")({
  head: () => ({
    meta: [
      { title: "Facturation des abonnements — Stocka" },
      {
        name: "description",
        content:
          "Créez les factures d'abonnement des entreprises clientes, marquez-les payées et suivez les encaissements.",
      },
      { property: "og:title", content: "Facturation des abonnements — Stocka" },
      {
        property: "og:description",
        content: "Suivi des factures d'abonnement : émission, paiement et encaissements par période.",
      },
    ],
  }),
  component: BillingPage,
});

export type CompanyInvoiceRow = {
  id: string;
  company_id: string;
  period: string;
  label: string | null;
  amount: number;
  currency: string;
  due_date: string;
  status: string;
  payment_method: string | null;
  payment_ref: string | null;
  paid_at: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  impayee: "Impayée",
  payee: "Payée",
  annulee: "Annulée",
};

function BillingPage() {
  const { data: me } = useCurrentUser();
  const isSuperAdmin = Boolean(me?.isSuperAdmin);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    company_id: "",
    period: currentPeriod(),
    label: "Abonnement mensuel",
    amount: "",
    due_date: "",
  });
  const [payFor, setPayFor] = useState<CompanyInvoiceRow | null>(null);
  const [payment, setPayment] = useState({ method: "Espèces", ref: "" });

  const { data: companies } = useQuery({
    queryKey: ["companies", "light"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["company-invoices"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_invoices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyInvoiceRow[];
    },
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["company-invoices"] });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.company_id) throw new Error("Choisissez une entreprise.");
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Montant invalide.");
      const payload: Record<string, unknown> = {
        company_id: form.company_id,
        period: form.period,
        label: form.label.trim() || null,
        amount,
      };
      if (form.due_date) payload["due_date"] = form.due_date;
      const { error } = await supabase.from("company_invoices").insert(payload as never);
      if (error) throw error;
      await logActivity("Facture d'abonnement créée", "facturation", `${form.period} — ${amount}`);
    },
    onSuccess: () => {
      toast.success("Facture créée.");
      setOpen(false);
      setForm({ ...form, amount: "" });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async () => {
      if (!payFor) return;
      const { error } = await supabase
        .from("company_invoices")
        .update({
          status: "payee",
          paid_at: new Date().toISOString(),
          payment_method: payment.method,
          payment_ref: payment.ref.trim() || null,
        })
        .eq("id", payFor.id);
      if (error) throw error;
      await logActivity("Facture d'abonnement encaissée", "facturation", payFor.period);
    },
    onSuccess: () => {
      toast.success("Facture marquée comme payée.");
      setPayFor(null);
      setPayment({ method: "Espèces", ref: "" });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: CompanyInvoiceRow) => {
      const { error } = await supabase.from("company_invoices").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Facture supprimée.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isSuperAdmin) {
    return (
      <PageShell title="Facturation" description="Accès réservé au super-administrateur.">
        <Panel>
          <p className="p-6 text-sm text-muted-foreground">Vous n'avez pas accès à cette page.</p>
        </Panel>
      </PageShell>
    );
  }

  const all = rows ?? [];
  const paid = all.filter((r) => r.status === "payee");
  const unpaid = all.filter((r) => r.status === "impayee");
  const companyName = (id: string) => (companies ?? []).find((c) => c.id === id)?.name ?? "—";

  return (
    <PageShell
      title="Facturation des abonnements"
      description="Émettez les factures d'abonnement des entreprises clientes, marquez-les comme payées et suivez les encaissements."
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Nouvelle facture
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Factures émises" value={String(all.length)} />
        <StatCard label="Encaissé" value={money(paid.reduce((s, r) => s + Number(r.amount), 0))} />
        <StatCard label="Reste à encaisser" value={money(unpaid.reduce((s, r) => s + Number(r.amount), 0))} />
        <StatCard label="Impayées" value={String(unpaid.length)} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle facture d'abonnement</DialogTitle>
            <DialogDescription>
              La facture apparaît immédiatement dans l'espace « Abonnement » de l'entreprise.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="fc">Entreprise</Label>
              <select
                id="fc"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.company_id}
                onChange={(e) => setForm({ ...form, company_id: e.target.value })}
              >
                <option value="">— Choisir —</option>
                {(companies ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fp">Période</Label>
                <select
                  id="fp"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value })}
                >
                  {periodOptions(18).map((p) => (
                    <option key={p} value={p}>
                      {periodLabel(p)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fa">Montant</Label>
                <Input
                  id="fa"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fl">Libellé</Label>
              <Input
                id="fl"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fd">Échéance (optionnel)</Label>
              <Input
                id="fd"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Créer la facture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(payFor)} onOpenChange={(v) => !v && setPayFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Encaisser la facture</DialogTitle>
            <DialogDescription>
              {payFor ? `${companyName(payFor.company_id)} — ${money(payFor.amount)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="pm">Moyen de paiement</Label>
              <select
                id="pm"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={payment.method}
                onChange={(e) => setPayment({ ...payment, method: e.target.value })}
              >
                {["Espèces", "Mobile Money", "Virement", "Chèque"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr">Référence (optionnel)</Label>
              <Input
                id="pr"
                value={payment.ref}
                onChange={(e) => setPayment({ ...payment, ref: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>
              Annuler
            </Button>
            <Button onClick={() => markPaid.mutate()} disabled={markPaid.isPending}>
              Marquer payée
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Panel title={`${all.length} facture(s)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Entreprise</th>
                <th className="px-4 py-2">Période</th>
                <th className="px-4 py-2">Libellé</th>
                <th className="px-4 py-2">Échéance</th>
                <th className="px-4 py-2">Montant</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {all.length === 0 ? (
                <EmptyRow colSpan={7} label={isLoading ? "Chargement…" : "Aucune facture."} />
              ) : (
                all.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{companyName(r.company_id)}</td>
                    <td className="px-4 py-2">{periodLabel(r.period)}</td>
                    <td className="px-4 py-2 text-xs">{r.label ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{dateOnly(r.due_date)}</td>
                    <td className="px-4 py-2 num">{money(r.amount)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={r.status === "payee" ? "default" : "secondary"}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                      {r.paid_at && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {dateOnly(r.paid_at)} · {r.payment_method ?? "—"}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {r.status !== "payee" && (
                          <Button variant="outline" size="sm" onClick={() => setPayFor(r)}>
                            <Check className="size-4" /> Encaisser
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Supprimer"
                          onClick={() => {
                            if (confirm("Supprimer cette facture ?")) remove.mutate(r);
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
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
