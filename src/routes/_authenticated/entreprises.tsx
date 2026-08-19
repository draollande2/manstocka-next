import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow } from "@/components/PageShell";
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
import { createCompanyOwner } from "@/lib/companies.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/entreprises")({
  head: () => ({
    meta: [
      { title: "Entreprises — Stocka" },
      {
        name: "description",
        content:
          "Espace super-administrateur : créer des entreprises clientes, les mettre en pause ou les supprimer.",
      },
      { property: "og:title", content: "Entreprises — Stocka" },
      {
        property: "og:description",
        content: "Gestion des entreprises clientes : création, pause, corbeille et suppression définitive.",
      },
    ],
  }),
  component: CompaniesPage,
});

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  status: string;
  max_sites: number;
  deleted_at: string | null;
  created_at: string;
};

const EMPTY = {
  name: "",
  slug: "",
  address: "",
  phone: "",
  email: "",
  currency: "FCFA",
  max_sites: 3,
  owner_name: "",
  owner_login: "",
  owner_password: "",
};

const EMPTY_OWNER = { full_name: "", login_id: "", password: "", email: "", phone: "" };

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function CompaniesPage() {
  const { data: me } = useCurrentUser();
  const isSuperAdmin = Boolean(me?.isSuperAdmin);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [ownerFor, setOwnerFor] = useState<CompanyRow | null>(null);
  const [ownerForm, setOwnerForm] = useState({ ...EMPTY_OWNER });

  const { data: companies, isLoading } = useQuery({
    queryKey: ["companies"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, slug, address, phone, email, currency, status, max_sites, deleted_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["companies"] });

  const createCompany = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error("Le nom de l'entreprise est obligatoire.");
      const slug = slugify(form.slug || name);
      if (!slug) throw new Error("Identifiant (slug) invalide.");
      const ownerLogin = form.owner_login.trim();
      const ownerName = form.owner_name.trim();
      const ownerPassword = form.owner_password;
      if (!ownerLogin || !ownerName || ownerPassword.length < 6) {
        throw new Error(
          "Renseignez le patron : nom, identifiant de connexion et mot de passe (6 caractères minimum).",
        );
      }
      const { data: created, error } = await supabase
        .from("companies")
        .insert({
          name,
          slug,
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          currency: form.currency.trim() || "FCFA",
          max_sites: Math.max(1, Number(form.max_sites) || 1),
        })
        .select("id")
        .single();
      if (error) throw error;
      await createCompanyOwner({
        data: {
          company_id: created.id,
          full_name: ownerName,
          login_id: ownerLogin,
          password: ownerPassword,
          email: form.email.trim() || "",
          phone: form.phone.trim() || "",
        },
      });
      await logActivity("Entreprise créée", "entreprises", `${name} — patron ${ownerLogin}`);
      return ownerLogin;
    },
    onSuccess: (login) => {
      toast.success(`Entreprise créée. Le patron se connecte avec l'identifiant « ${login} ».`);
      setOpen(false);
      setForm({ ...EMPTY });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addOwner = useMutation({
    mutationFn: async () => {
      if (!ownerFor) throw new Error("Entreprise introuvable.");
      await createCompanyOwner({
        data: {
          company_id: ownerFor.id,
          full_name: ownerForm.full_name.trim(),
          login_id: ownerForm.login_id.trim(),
          password: ownerForm.password,
          email: ownerForm.email.trim() || "",
          phone: ownerForm.phone.trim() || "",
        },
      });
      await logActivity(
        "Compte administrateur créé",
        "entreprises",
        `${ownerFor.name} — ${ownerForm.login_id.trim()}`,
      );
      return ownerForm.login_id.trim();
    },
    onSuccess: (login) => {
      toast.success(`Compte créé. Connexion avec l'identifiant « ${login} ».`);
      setOwnerFor(null);
      setOwnerForm({ ...EMPTY_OWNER });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePause = useMutation({
    mutationFn: async (c: CompanyRow) => {
      const next = c.status === "pause" ? "actif" : "pause";
      const { error } = await supabase.from("companies").update({ status: next }).eq("id", c.id);
      if (error) throw error;
      await logActivity(
        next === "pause" ? "Entreprise mise en pause" : "Entreprise réactivée",
        "entreprises",
        c.name,
      );
      return next;
    },
    onSuccess: (next) => {
      toast.success(next === "pause" ? "Entreprise mise en pause." : "Entreprise réactivée.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const softDelete = useMutation({
    mutationFn: async (c: CompanyRow) => {
      const { error } = await supabase
        .from("companies")
        .update({ deleted_at: new Date().toISOString(), status: "pause" })
        .eq("id", c.id);
      if (error) throw error;
      await logActivity("Entreprise supprimée", "entreprises", c.name);
    },
    onSuccess: () => {
      toast.success("Entreprise mise à la corbeille.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: async (c: CompanyRow) => {
      const { error } = await supabase
        .from("companies")
        .update({ deleted_at: null, status: "actif" })
        .eq("id", c.id);
      if (error) throw error;
      await logActivity("Entreprise récupérée", "entreprises", c.name);
    },
    onSuccess: () => {
      toast.success("Entreprise récupérée.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hardDelete = useMutation({
    mutationFn: async (c: CompanyRow) => {
      const { error } = await supabase.from("companies").delete().eq("id", c.id);
      if (error)
        throw new Error(
          "Suppression définitive impossible : cette entreprise contient encore des données (points de vente, produits, ventes…).",
        );
      await logActivity("Entreprise supprimée définitivement", "entreprises", c.name);
    },
    onSuccess: () => {
      toast.success("Entreprise supprimée définitivement.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isSuperAdmin) {
    return (
      <PageShell title="Entreprises" description="Espace réservé au super-administrateur.">
        <Panel title="Accès refusé">
          <p className="p-4 text-sm text-muted-foreground">
            Seul le super-administrateur peut gérer les entreprises clientes.
          </p>
        </Panel>
      </PageShell>
    );
  }

  const live = (companies ?? []).filter((c) => !c.deleted_at);
  const trashed = (companies ?? []).filter((c) => c.deleted_at);

  return (
    <PageShell
      title="Entreprises"
      description="Créez les entreprises clientes, mettez-les en pause ou supprimez-les."
    >
      <Panel
        title="Entreprises actives"
        actions={
          <Button size="sm" data-print="hide" onClick={() => { setForm({ ...EMPTY }); setOpen(true); }}>
            <Plus className="size-4" /> Nouvelle entreprise
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Identifiant</th>
                <th className="px-4 py-2">Devise</th>
                <th className="px-4 py-2">Points de vente max.</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2" data-print="hide" />
              </tr>
            </thead>
            <tbody>
              {live.length === 0 ? (
                <EmptyRow colSpan={6} label={isLoading ? "Chargement…" : "Aucune entreprise."} />
              ) : (
                live.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-xs">{c.slug}</td>
                    <td className="px-4 py-2 text-xs">{c.currency}</td>
                    <td className="px-4 py-2 text-xs num">{c.max_sites}</td>
                    <td className="px-4 py-2">
                      <Badge variant={c.status === "pause" ? "outline" : "default"}>
                        {c.status === "pause" ? "En pause" : "Active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right" data-print="hide">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setOwnerForm({ ...EMPTY_OWNER });
                            setOwnerFor(c);
                          }}
                        >
                          Compte patron
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => togglePause.mutate(c)}>
                          {c.status === "pause" ? "Réactiver" : "Mettre en pause"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Supprimer"
                          onClick={() => {
                            if (
                              confirm(
                                `Supprimer « ${c.name} » ? Elle sera placée dans la corbeille et pourra être récupérée.`,
                              )
                            )
                              softDelete.mutate(c);
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

      <Panel title="Corbeille des entreprises">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Identifiant</th>
                <th className="px-4 py-2">Supprimée le</th>
                <th className="px-4 py-2" data-print="hide" />
              </tr>
            </thead>
            <tbody>
              {trashed.length === 0 ? (
                <EmptyRow colSpan={4} label="Aucune entreprise supprimée." />
              ) : (
                trashed.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-xs">{c.slug}</td>
                    <td className="px-4 py-2 text-xs">
                      {c.deleted_at ? new Date(c.deleted_at).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-2 text-right" data-print="hide">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => restore.mutate(c)}>
                          Récupérer
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => {
                            if (
                              confirm(
                                `Supprimer définitivement « ${c.name} » ? Cette action est irréversible.`,
                              )
                            )
                              hardDelete.mutate(c);
                          }}
                        >
                          Supprimer définitivement
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle entreprise</DialogTitle>
            <DialogDescription>
              Chaque entreprise dispose de ses propres points de vente, produits et documents.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cname">Nom</Label>
              <Input
                id="cname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cslug">Identifiant (slug)</Label>
              <Input
                id="cslug"
                value={form.slug}
                placeholder={slugify(form.name) || "mon-entreprise"}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                maxLength={48}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ccur">Devise</Label>
              <Input
                id="ccur"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                maxLength={10}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cmax">Points de vente autorisés</Label>
              <Input
                id="cmax"
                type="number"
                min={1}
                value={form.max_sites}
                onChange={(e) => setForm({ ...form, max_sites: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cphone">Téléphone</Label>
              <Input
                id="cphone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                maxLength={40}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cmail">E-mail</Label>
              <Input
                id="cmail"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="caddr">Adresse</Label>
              <Input
                id="caddr"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => createCompany.mutate()} disabled={createCompany.isPending}>
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
