import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { money, dateOnly, periodLabel } from "@/lib/format";
import { logActivity, useCurrentUser } from "@/hooks/useCurrentUser";
import type { CompanyInvoiceRow } from "./facturation";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/abonnement")({
  head: () => ({
    meta: [
      { title: "Abonnement — Stocka" },
      {
        name: "description",
        content: "Consultez les factures d'abonnement de votre entreprise et réglez-les en ligne.",
      },
      { property: "og:title", content: "Abonnement — Stocka" },
      {
        property: "og:description",
        content: "Suivi de votre abonnement Stocka : factures, échéances et paiements.",
      },
    ],
  }),
  component: SubscriptionPage,
});

const STATUS_LABELS: Record<string, string> = {
  impayee: "Impayée",
  payee: "Payée",
  annulee: "Annulée",
};

function SubscriptionPage() {
  const { data: me } = useCurrentUser();
  const isAdmin = Boolean(me?.isAdmin);
  const queryClient = useQueryClient();
  const [payFor, setPayFor] = useState<CompanyInvoiceRow | null>(null);
  const [payment, setPayment] = useState({ method: "Mobile Money", ref: "" });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["my-company-invoices"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_invoices")
        .select("*")
        .order("due_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyInvoiceRow[];
    },
  });

  const pay = useMutation({
    mutationFn: async () => {
      if (!payFor) return;
      if (!payment.ref.trim()) throw new Error("Renseignez la référence du paiement.");
      const { error } = await supabase
        .from("company_invoices")
        .update({
          status: "payee",
          paid_at: new Date().toISOString(),
          payment_method: payment.method,
          payment_ref: payment.ref.trim(),
        })
        .eq("id", payFor.id);
      if (error) throw error;
      await logActivity("Abonnement payé", "abonnement", payFor.period);
    },
    onSuccess: () => {
      toast.success("Paiement enregistré. Merci !");
      setPayFor(null);
      setPayment({ method: "Mobile Money", ref: "" });
      void queryClient.invalidateQueries({ queryKey: ["my-company-invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <PageShell title="Abonnement" description="Accès réservé aux administrateurs de l'entreprise.">
        <Panel>
          <p className="p-6 text-sm text-muted-foreground">Vous n'avez pas accès à cette page.</p>
        </Panel>
      </PageShell>
    );
  }

  const all = rows ?? [];
  const unpaid = all.filter((r) => r.status === "impayee");
  const paid = all.filter((r) => r.status === "payee");

  return (
    <PageShell
      title="Abonnement"
      description="Consultez les factures d'abonnement de votre entreprise, réglez-les et suivez l'historique de vos paiements."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="À régler" value={money(unpaid.reduce((s, r) => s + Number(r.amount), 0))} />
        <StatCard label="Factures impayées" value={String(unpaid.length)} />
        <StatCard label="Total déjà réglé" value={money(paid.reduce((s, r) => s + Number(r.amount), 0))} />
      </div>

      <Dialog open={Boolean(payFor)} onOpenChange={(v) => !v && setPayFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payer la facture</DialogTitle>
            <DialogDescription>
              {payFor ? `${periodLabel(payFor.period)} — ${money(payFor.amount)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="am">Moyen de paiement</Label>
              <select
                id="am"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={payment.method}
                onChange={(e) => setPayment({ ...payment, method: e.target.value })}
              >
                {["Mobile Money", "Virement", "Espèces", "Chèque"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ar">Référence du paiement</Label>
              <Input
                id="ar"
                value={payment.ref}
                onChange={(e) => setPayment({ ...payment, ref: e.target.value })}
                placeholder="N° de transaction"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>
              Annuler
            </Button>
            <Button onClick={() => pay.mutate()} disabled={pay.isPending}>
              Confirmer le paiement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Panel title={`${all.length} facture(s)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Période</th>
                <th className="px-4 py-2">Libellé</th>
                <th className="px-4 py-2">Échéance</th>
                <th className="px-4 py-2">Montant</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2" data-print="hide" />
              </tr>
            </thead>
            <tbody>
              {all.length === 0 ? (
                <EmptyRow colSpan={6} label={isLoading ? "Chargement…" : "Aucune facture d'abonnement."} />
              ) : (
                all.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{periodLabel(r.period)}</td>
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
                    <td className="px-4 py-2 text-right" data-print="hide">
                      {r.status !== "payee" && (
                        <Button size="sm" onClick={() => setPayFor(r)}>
                          Payer
                        </Button>
                      )}
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
