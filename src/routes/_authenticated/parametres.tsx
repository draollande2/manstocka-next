import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow, useSettings } from "@/components/PageShell";
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
import { logActivity, useCurrentUser } from "@/hooks/useCurrentUser";
import { useAllSites, SITE_KINDS, SITE_KIND_LABELS, type SiteRow } from "@/hooks/useSite";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres — Stocka" },
      { name: "description", content: "Points de vente, identité de la boutique, devise et numérotation des documents." },
      { property: "og:title", content: "Paramètres — Stocka" },
      { property: "og:description", content: "Gérez vos points de vente, l'entête des factures et la numérotation." },
    ],
  }),
  component: SettingsPage,
});

const EMPTY_SITE = { name: "", kind: "boutique", address: "", phone: "", active: true };

function SettingsPage() {
  const { data: settings } = useSettings();
  const { data: me } = useCurrentUser();
  const { data: sites, isLoading: sitesLoading } = useAllSites();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    company_name: "",
    address: "",
    phone: "",
    currency: "FCFA",
    invoice_prefix: "FV",
    entry_prefix: "BE",
    transfer_prefix: "BT",
    footer_note: "",
  });
  const [siteOpen, setSiteOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<SiteRow | null>(null);
  const [siteForm, setSiteForm] = useState({ ...EMPTY_SITE });

  useEffect(() => {
    if (!settings) return;
    setForm({
      company_name: settings.company_name ?? "",
      address: settings.address ?? "",
      phone: settings.phone ?? "",
      currency: settings.currency ?? "FCFA",
      invoice_prefix: settings.invoice_prefix ?? "FV",
      entry_prefix: settings.entry_prefix ?? "BE",
      transfer_prefix: settings.transfer_prefix ?? "BT",
      footer_note: settings.footer_note ?? "",
    });
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .update({
          company_name: form.company_name.trim() || "Ma Boutique",
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          currency: form.currency.trim() || "FCFA",
          invoice_prefix: form.invoice_prefix.trim() || "FV",
          entry_prefix: form.entry_prefix.trim() || "BE",
          transfer_prefix: form.transfer_prefix.trim() || "BT",
          footer_note: form.footer_note.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", me?.companyId ?? "");
      if (error) throw error;
      await logActivity("Paramètres modifiés", "parametres", form.company_name);
    },
    onSuccess: () => {
      toast.success("Paramètres enregistrés.");
      void queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSite = useMutation({
    mutationFn: async () => {
      const payload = {
        name: siteForm.name.trim(),
        kind: siteForm.kind,
        address: siteForm.address.trim() || null,
        phone: siteForm.phone.trim() || null,
        active: siteForm.active,
      };
      if (!payload.name) throw new Error("Le nom du point de vente est obligatoire.");
      if (editingSite) {
        const { error } = await supabase.from("sites").update(payload).eq("id", editingSite.id);
        if (error) throw error;
      } else {
        if (!me?.companyId) throw new Error("Entreprise introuvable pour votre compte.");
        const { error } = await supabase.from("sites").insert({ ...payload, company_id: me.companyId });
        if (error) throw error;
      }
      await logActivity(
        editingSite ? "Point de vente modifié" : "Point de vente créé",
        "parametres",
        payload.name,
      );
    },
    onSuccess: () => {
      toast.success(editingSite ? "Point de vente modifié." : "Point de vente créé.");
      setSiteOpen(false);
      setEditingSite(null);
      setSiteForm({ ...EMPTY_SITE });
      void queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Suppression douce : le point de vente part à la corbeille et peut être récupéré.
  const removeSite = useMutation({
    mutationFn: async (site: SiteRow) => {
      const { error } = await supabase
        .from("sites")
        .update({ deleted_at: new Date().toISOString(), active: false })
        .eq("id", site.id);
      if (error) throw error;
      await logActivity("Point de vente supprimé", "parametres", site.name);
    },
    onSuccess: () => {
      toast.success("Point de vente mis à la corbeille. Vous pouvez le récupérer.");
      void queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreSite = useMutation({
    mutationFn: async (site: SiteRow) => {
      const { error } = await supabase
        .from("sites")
        .update({ deleted_at: null, active: true, status: "actif" })
        .eq("id", site.id);
      if (error) throw error;
      await logActivity("Point de vente récupéré", "parametres", site.name);
    },
    onSuccess: () => {
      toast.success("Point de vente récupéré.");
      void queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePause = useMutation({
    mutationFn: async (site: SiteRow) => {
      const next = site.status === "pause" ? "actif" : "pause";
      const { error } = await supabase.from("sites").update({ status: next }).eq("id", site.id);
      if (error) throw error;
      await logActivity(
        next === "pause" ? "Point de vente mis en pause" : "Point de vente réactivé",
        "parametres",
        site.name,
      );
      return next;
    },
    onSuccess: (next) => {
      toast.success(next === "pause" ? "Point de vente mis en pause." : "Point de vente réactivé.");
      void queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const liveSites = (sites ?? []).filter((s) => !s.deleted_at);
  const trashedSites = (sites ?? []).filter((s) => s.deleted_at);

  return (
    <PageShell
      title="Paramètres"
      description="Points de vente (boutiques, alimentations, entrepôts, caves) et informations imprimées sur les documents."
    >
      <Panel
        title="Points de vente / Alimentations"
        actions={
          <Button
            size="sm"
            data-print="hide"
            onClick={() => {
              setEditingSite(null);
              setSiteForm({ ...EMPTY_SITE });
              setSiteOpen(true);
            }}
          >
            <Plus className="size-4" /> Nouveau point de vente
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Adresse</th>
                <th className="px-4 py-2">Téléphone</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2" data-print="hide" />
              </tr>
            </thead>
            <tbody>
              {liveSites.length === 0 ? (
                <EmptyRow colSpan={6} label={sitesLoading ? "Chargement…" : "Aucun point de vente."} />
              ) : (
                liveSites.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 text-xs">{SITE_KIND_LABELS[s.kind] ?? s.kind}</td>
                    <td className="px-4 py-2 text-xs">{s.address ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{s.phone ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          s.status === "pause" ? "outline" : s.active ? "default" : "secondary"
                        }
                      >
                        {s.status === "pause" ? "En pause" : s.active ? "Actif" : "Inactif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right" data-print="hide">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePause.mutate(s)}
                        >
                          {s.status === "pause" ? "Réactiver" : "Mettre en pause"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Modifier"
                          onClick={() => {
                            setEditingSite(s);
                            setSiteForm({
                              name: s.name,
                              kind: s.kind,
                              address: s.address ?? "",
                              phone: s.phone ?? "",
                              active: s.active,
                            });
                            setSiteOpen(true);
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
                                `Supprimer « ${s.name} » ? Il sera placé dans la corbeille et pourra être récupéré.`,
                              )
                            )
                              removeSite.mutate(s);
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

      <Panel title="Corbeille des points de vente">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Supprimé le</th>
                <th className="px-4 py-2" data-print="hide" />
              </tr>
            </thead>
            <tbody>
              {trashedSites.length === 0 ? (
                <EmptyRow colSpan={4} label="Aucun point de vente supprimé." />
              ) : (
                trashedSites.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 text-xs">{SITE_KIND_LABELS[s.kind] ?? s.kind}</td>
                    <td className="px-4 py-2 text-xs">
                      {s.deleted_at ? new Date(s.deleted_at).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-2 text-right" data-print="hide">
                      <Button variant="outline" size="sm" onClick={() => restoreSite.mutate(s)}>
                        Récupérer
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>


      <Panel title="Identité de l'entreprise">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cn">Nom de l'entreprise</Label>
            <Input id="cn" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ad">Adresse</Label>
            <Input id="ad" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tel">Téléphone</Label>
            <Input id="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="fn">Mention de bas de facture</Label>
            <Input id="fn" value={form.footer_note} onChange={(e) => setForm({ ...form, footer_note: e.target.value })} maxLength={200} />
          </div>
        </div>
      </Panel>

      <Panel title="Documents et devise">
        <div className="grid gap-4 p-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="cur">Devise</Label>
            <Input id="cur" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={10} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ip">Préfixe factures de vente</Label>
            <Input id="ip" value={form.invoice_prefix} onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })} maxLength={8} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ep">Préfixe bons d'entrée</Label>
            <Input id="ep" value={form.entry_prefix} onChange={(e) => setForm({ ...form, entry_prefix: e.target.value })} maxLength={8} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tp">Préfixe bons de transfert</Label>
            <Input id="tp" value={form.transfer_prefix} onChange={(e) => setForm({ ...form, transfer_prefix: e.target.value })} maxLength={8} />
          </div>
        </div>
        <div className="flex justify-end border-t border-border px-4 py-3" data-print="hide">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Enregistrer
          </Button>
        </div>
      </Panel>

      <Dialog open={siteOpen} onOpenChange={setSiteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSite ? "Modifier le point de vente" : "Nouveau point de vente"}</DialogTitle>
            <DialogDescription>
              Chaque point de vente possède son propre stock. Les transferts permettent de déplacer les
              articles d'un point à un autre.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="sname">Nom</Label>
              <Input id="sname" value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skind">Type</Label>
              <select
                id="skind"
                value={siteForm.kind}
                onChange={(e) => setSiteForm({ ...siteForm, kind: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {SITE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {SITE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sphone">Téléphone</Label>
              <Input id="sphone" value={siteForm.phone} onChange={(e) => setSiteForm({ ...siteForm, phone: e.target.value })} maxLength={40} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="saddr">Adresse</Label>
              <Input id="saddr" value={siteForm.address} onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })} maxLength={200} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={siteForm.active}
                onChange={(e) => setSiteForm({ ...siteForm, active: e.target.checked })}
                className="size-4 accent-primary"
              />
              Point de vente actif
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSiteOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => saveSite.mutate()} disabled={saveSite.isPending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
