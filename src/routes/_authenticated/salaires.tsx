import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow, StatCard, useSettings } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money, periodLabel, periodOptions, currentPeriod, dateTime } from "@/lib/format";
import { logActivity, useCurrentUser } from "@/hooks/useCurrentUser";
import { useSite } from "@/hooks/useSite";
import { useEmployees } from "./manques-pertes";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/salaires")({
  head: () => ({
    meta: [
      { title: "Salaires — Stocka" },
      { name: "description", content: "Calcul du salaire net : base, primes, retenues de manques et versement à l'épargne." },
      { property: "og:title", content: "Salaires — Stocka" },
      { property: "og:description", content: "Préparez, éditez et imprimez les bulletins de salaire du mois." },
    ],
  }),
  component: SalariesPage,
});

type SalaryRow = {
  id: string;
  employee_id: string;
  period: string;
  base_salary: number;
  bonus: number;
  other_deduction: number;
  losses_deduction: number;
  savings_transfer: number;
  paid: boolean;
};

const netOf = (s: SalaryRow) =>
  Number(s.base_salary) +
  Number(s.bonus) -
  Number(s.losses_deduction) -
  Number(s.other_deduction) -
  Number(s.savings_transfer);

type FormState = {
  employee_id: string;
  period: string;
  base_salary: string;
  bonus: string;
  losses_deduction: string;
  other_deduction: string;
  savings_transfer: string;
  paid: boolean;
};

function emptyForm(period: string): FormState {
  return {
    employee_id: "",
    period,
    base_salary: "0",
    bonus: "0",
    losses_deduction: "0",
    other_deduction: "0",
    savings_transfer: "0",
    paid: false,
  };
}

function SalariesPage() {
  const { data: me } = useCurrentUser();
  const isEmployee = me ? !me.isAdmin : false;
  const { siteId } = useSite();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const { data: allEmployees } = useEmployees();

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
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(currentPeriod()));
  const [payslip, setPayslip] = useState<SalaryRow | null>(null);

  const { data: salaries, isLoading } = useQuery({
    queryKey: ["salaries", period, siteId ?? "all"],
    enabled: siteId == null || siteEmployeeIds !== undefined,
    queryFn: async () => {
      let request = supabase.from("salaries").select("*").eq("period", period);
      if (siteId != null) request = request.in("employee_id", siteEmployeeIds ?? []);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as SalaryRow[];
    },
  });

  const { data: losses } = useQuery({
    queryKey: ["losses-period", period, siteId ?? "all"],
    queryFn: async () => {
      let request = supabase
        .from("losses")
        .select("employee_id, amount")
        .eq("period", period);
      if (siteId != null) request = request.eq("site_id", siteId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as Array<{ employee_id: string | null; amount: number }>;
    },
  });

  // Manques & pertes de la période choisie dans le formulaire (pour remplissage automatique)
  const { data: formLosses } = useQuery({
    queryKey: ["losses-period", form.period, siteId ?? "all"],
    queryFn: async () => {
      let request = supabase
        .from("losses")
        .select("employee_id, amount")
        .eq("period", form.period);
      if (siteId != null) request = request.eq("site_id", siteId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as Array<{ employee_id: string | null; amount: number }>;
    },
  });

  const lossTotalFor = (employeeId: string) =>
    (formLosses ?? [])
      .filter((l) => l.employee_id === employeeId)
      .reduce((s, l) => s + Number(l.amount), 0);

  // Réactualise la retenue « Manques & pertes » dès que le collaborateur, la période ou les pertes changent
  useEffect(() => {
    if (!formOpen || !form.employee_id) return;
    const total = lossTotalFor(form.employee_id);
    setForm((f) =>
      f.losses_deduction === String(total) ? f : { ...f, losses_deduction: String(total) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, form.employee_id, form.period, formLosses]);



  const prepare = useMutation({
    mutationFn: async () => {
      const active = (employees ?? []).filter((e) => e.active);
      for (const e of active) {
        const lossTotal = (losses ?? [])
          .filter((l) => l.employee_id === e.id)
          .reduce((s, l) => s + Number(l.amount), 0);
        const existing = (salaries ?? []).find((s) => s.employee_id === e.id);
        if (existing) {
          const { error } = await supabase
            .from("salaries")
            .update({ base_salary: e.base_salary, losses_deduction: lossTotal })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("salaries").insert({
            employee_id: e.id,
            period,
            base_salary: e.base_salary,
            losses_deduction: lossTotal,
          });
          if (error) throw error;
        }
      }
      await logActivity("Préparation des salaires", "salaires", periodLabel(period));
    },
    onSuccess: () => {
      toast.success("Bulletins préparés / actualisés.");
      void queryClient.invalidateQueries({ queryKey: ["salaries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async (payload: { id: string; values: Partial<SalaryRow> }) => {
      const { error } = await supabase.from("salaries").update(payload.values).eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["salaries"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.employee_id) throw new Error("Choisissez un collaborateur.");
      const values = {
        employee_id: form.employee_id,
        period: form.period,
        base_salary: Number(form.base_salary) || 0,
        bonus: Number(form.bonus) || 0,
        losses_deduction: Number(form.losses_deduction) || 0,
        other_deduction: Number(form.other_deduction) || 0,
        savings_transfer: Number(form.savings_transfer) || 0,
        paid: form.paid,
      };
      if (editing) {
        const { error } = await supabase.from("salaries").update(values).eq("id", editing.id);
        if (error) throw error;
        await logActivity("Fiche salaire modifiée", "salaires", periodLabel(values.period));
      } else {
        const { error } = await supabase.from("salaries").insert(values);
        if (error) throw error;
        await logActivity("Nouvelle fiche salaire", "salaires", periodLabel(values.period));
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Fiche salaire modifiée." : "Fiche salaire créée.");
      setFormOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["salaries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: SalaryRow) => {
      const { error } = await supabase.from("salaries").delete().eq("id", row.id);
      if (error) throw error;
      await logActivity("Fiche salaire supprimée", "salaires", periodLabel(row.period));
    },
    onSuccess: () => {
      toast.success("Fiche salaire supprimée.");
      void queryClient.invalidateQueries({ queryKey: ["salaries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pay = useMutation({
    mutationFn: async (row: SalaryRow) => {
      const { error } = await supabase.from("salaries").update({ paid: true }).eq("id", row.id);
      if (error) throw error;

      if (Number(row.savings_transfer) > 0) {
        const { data: account, error: accError } = await supabase
          .from("savings_accounts")
          .select("id, balance")
          .eq("employee_id", row.employee_id)
          .maybeSingle();
        if (accError) throw accError;

        let accountId = account?.id ?? null;
        if (!accountId) {
          const { data: created, error: createError } = await supabase
            .from("savings_accounts")
            .insert({ employee_id: row.employee_id, balance: 0 })
            .select("id")
            .single();
          if (createError) throw createError;
          accountId = created.id;
        }
        const { data: auth } = await supabase.auth.getUser();
        const { error: txError } = await supabase.from("savings_transactions").insert({
          account_id: accountId,
          employee_id: row.employee_id,
          kind: "depot",
          amount: row.savings_transfer,
          source: "salaire",
          status: "valide",
          note: `Versement salaire ${periodLabel(row.period)}`,
          requested_by: auth.user?.id ?? null,
          approved_by: auth.user?.id ?? null,
        });
        if (txError) throw txError;

        const { error: balError } = await supabase
          .from("savings_accounts")
          .update({ balance: Number(account?.balance ?? 0) + Number(row.savings_transfer) })
          .eq("id", accountId);
        if (balError) throw balError;
      }

      await logActivity("Salaire payé", "salaires", `${periodLabel(row.period)}`);
    },
    onSuccess: () => {
      toast.success("Salaire marqué payé.");
      void queryClient.invalidateQueries({ queryKey: ["salaries"] });
      void queryClient.invalidateQueries({ queryKey: ["savings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (salaries ?? []).filter((s) => !isEmployee || s.employee_id === me?.id);
  const totalNet = rows.reduce((sum, s) => sum + netOf(s), 0);
  const employeeName = (id: string) =>
    (employees ?? []).find((e) => e.id === id)?.full_name ?? "—";

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(period));
    setFormOpen(true);
  };

  const openEdit = (row: SalaryRow) => {
    setEditing(row);
    setForm({
      employee_id: row.employee_id,
      period: row.period,
      base_salary: String(row.base_salary),
      bonus: String(row.bonus),
      losses_deduction: String(row.losses_deduction),
      other_deduction: String(row.other_deduction),
      savings_transfer: String(row.savings_transfer),
      paid: row.paid,
    });
    setFormOpen(true);
  };

  return (
    <PageShell
      title="Salaire"
      description={`${isEmployee ? "Votre bulletin" : "Bulletins"} de ${periodLabel(period)}. Net = base + prime − manques & pertes − autres retenues − versement épargne.`}
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
          {!isEmployee && (
            <>
              <Button size="sm" variant="outline" onClick={() => prepare.mutate()} disabled={prepare.isPending}>
                Préparer les bulletins
              </Button>
              <Button size="sm" onClick={openCreate}>
                Nouveau Salaire
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Bulletins" value={String(rows.length)} />
        <StatCard label="Total net à payer" value={money(totalNet)} />
        <StatCard label="Payés" value={`${rows.filter((r) => r.paid).length} / ${rows.length}`} />
      </div>

      <Panel title="Bulletins du mois">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Collaborateur</th>
                <th className="px-4 py-2">Base</th>
                <th className="px-4 py-2">Prime</th>
                <th className="px-4 py-2">Manques & pertes</th>
                <th className="px-4 py-2">Autre retenue</th>
                <th className="px-4 py-2">Épargne</th>
                <th className="px-4 py-2">Net</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2" data-print="hide" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow
                  colSpan={9}
                  label={isLoading ? "Chargement…" : "Aucun bulletin — cliquez sur « Nouveau Salaire » ou « Préparer les bulletins »."}
                />
              ) : (
                rows.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{employeeName(s.employee_id)}</td>
                    <td className="px-4 py-2 num">{money(s.base_salary)}</td>
                    <td className="px-4 py-2">
                      <Input
                        className="h-8 w-28"
                        type="number"
                        min="0"
                        step="any"
                        defaultValue={String(s.bonus)}
                        disabled={isEmployee}
                        onBlur={(e) =>
                          patch.mutate({ id: s.id, values: { bonus: Number(e.target.value) || 0 } })
                        }
                      />
                    </td>
                    <td className="px-4 py-2 num text-destructive">− {money(s.losses_deduction)}</td>
                    <td className="px-4 py-2">
                      <Input
                        className="h-8 w-28"
                        type="number"
                        min="0"
                        step="any"
                        defaultValue={String(s.other_deduction)}
                        disabled={isEmployee}
                        onBlur={(e) =>
                          patch.mutate({ id: s.id, values: { other_deduction: Number(e.target.value) || 0 } })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        className="h-8 w-28"
                        type="number"
                        min="0"
                        step="any"
                        defaultValue={String(s.savings_transfer)}
                        disabled={isEmployee}
                        onBlur={(e) =>
                          patch.mutate({ id: s.id, values: { savings_transfer: Number(e.target.value) || 0 } })
                        }
                      />
                    </td>
                    <td className="px-4 py-2 num font-semibold">{money(netOf(s))}</td>
                    <td className="px-4 py-2">
                      {isEmployee ? (
                        <Badge variant={s.paid ? "default" : "secondary"}>
                          {s.paid ? "Payé" : "En attente"}
                        </Badge>
                      ) : (
                        <select
                          value={s.paid ? "paye" : "attente"}
                          onChange={(e) =>
                            patch.mutate({ id: s.id, values: { paid: e.target.value === "paye" } })
                          }
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value="attente">En attente</option>
                          <option value="paye">Payé</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right" data-print="hide">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setPayslip(s)}>
                          Bulletin
                        </Button>
                        {!isEmployee && (
                          <>
                            {!s.paid && (
                              <Button size="sm" variant="outline" onClick={() => pay.mutate(s)}>
                                Payer
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                              Modifier
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive"
                              onClick={() => {
                                if (window.confirm("Supprimer cette fiche salaire ?")) remove.mutate(s);
                              }}
                            >
                              Supprimer
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

      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier la fiche salaire" : "Nouvelle fiche salaire"}</DialogTitle>
            <DialogDescription>
              Renseignez la base, la prime et les retenues. Le net est calculé automatiquement.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">Collaborateur</span>
              <select
                value={form.employee_id}
                onChange={(e) => {
                  const emp = (employees ?? []).find((x) => x.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    employee_id: e.target.value,
                    base_salary: emp && !editing ? String(emp.base_salary) : f.base_salary,
                  }));
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Choisir —</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Période</span>
              <select
                value={form.period}
                onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {periodOptions().map((p) => (
                  <option key={p} value={p}>
                    {periodLabel(p)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Statut</span>
              <select
                value={form.paid ? "paye" : "attente"}
                onChange={(e) => setForm((f) => ({ ...f, paid: e.target.value === "paye" }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="attente">En attente</option>
                <option value="paye">Payé</option>
              </select>
            </label>

            {(
              [
                ["base_salary", "Salaire de base"],
                ["bonus", "Prime"],
                ["losses_deduction", "Manques & pertes"],
                ["other_deduction", "Autre retenue"],
                ["savings_transfer", "Versement épargne"],
              ] as Array<[keyof FormState, string]>
            ).map(([key, label]) => (
              <label key={String(key)} className="space-y-1 text-sm">
                <span className="text-muted-foreground">
                  {label}
                  {key === "losses_deduction" ? " (automatique)" : ""}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={String(form[key])}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
                {key === "losses_deduction" && form.employee_id ? (
                  <span className="block text-xs text-muted-foreground">
                    Récupéré des manques &amp; pertes de {periodLabel(form.period)} :{" "}
                    {money(lossTotalFor(form.employee_id))}
                  </span>
                ) : null}
              </label>
            ))}

          </div>

          <p className="text-sm">
            Net estimé :{" "}
            <span className="font-display font-bold num">
              {money(
                (Number(form.base_salary) || 0) +
                  (Number(form.bonus) || 0) -
                  (Number(form.losses_deduction) || 0) -
                  (Number(form.other_deduction) || 0) -
                  (Number(form.savings_transfer) || 0),
              )}
            </span>
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {editing ? "Enregistrer" : "Créer la fiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayslipDialog
        row={payslip}
        employeeName={payslip ? employeeName(payslip.employee_id) : ""}
        onClose={() => setPayslip(null)}
      />
    </PageShell>
  );
}

function PayslipDialog({
  row,
  employeeName,
  onClose,
}: {
  row: SalaryRow | null;
  employeeName: string;
  onClose: () => void;
}) {
  const { data: settings } = useSettings();

  useEffect(() => {
    if (!row) return;
    document.body.classList.add("printing-invoice");
    return () => document.body.classList.remove("printing-invoice");
  }, [row]);

  if (!row) return null;

  const lines: Array<[string, number, boolean]> = [
    ["Salaire de base", Number(row.base_salary), false],
    ["Prime", Number(row.bonus), false],
    ["Manques & pertes", Number(row.losses_deduction), true],
    ["Autre retenue", Number(row.other_deduction), true],
    ["Versement épargne", Number(row.savings_transfer), true],
  ];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-invoice-doc className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader data-print="hide">
          <DialogTitle>Bulletin de salaire — {employeeName}</DialogTitle>
          <DialogDescription>Imprimez ou exportez ce bulletin en PDF.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-3">
            <div>
              <p className="font-display text-lg font-bold">{settings?.company_name ?? "Stocka"}</p>
              {settings?.address && <p className="text-xs text-muted-foreground">{settings.address}</p>}
              {settings?.phone && <p className="text-xs text-muted-foreground">Tél. {settings.phone}</p>}
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p className="font-display text-sm font-semibold text-foreground">Bulletin de salaire</p>
              <p>Période : {periodLabel(row.period)}</p>
              <p>Édité le {dateTime(new Date().toISOString())}</p>
            </div>
          </div>

          <div className="text-sm">
            <p className="font-semibold">{employeeName}</p>
            <p className="text-xs text-muted-foreground">
              Statut : {row.paid ? "Payé" : "En attente de paiement"}
            </p>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Rubrique</th>
                <th className="px-3 py-2 text-right">Gain</th>
                <th className="px-3 py-2 text-right">Retenue</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(([label, value, isDeduction]) => (
                <tr key={label} className="border-t border-border">
                  <td className="px-3 py-2">{label}</td>
                  <td className="px-3 py-2 text-right num">{isDeduction ? "—" : money(value)}</td>
                  <td className="px-3 py-2 text-right num">{isDeduction ? money(value) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ml-auto w-full max-w-xs border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Net à payer</span>
              <span className="font-display font-bold num">{money(netOf(row))}</span>
            </div>
          </div>

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
