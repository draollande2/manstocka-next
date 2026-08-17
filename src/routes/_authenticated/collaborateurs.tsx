import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2, Copy, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow, StatCard } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money, ROLE_LABELS } from "@/lib/format";
import { logActivity, useCurrentUser } from "@/hooks/useCurrentUser";
import { createCollaborator, deleteCollaborator, setCollaboratorPassword } from "@/lib/team.functions";
import { useAllSites, SITE_KIND_LABELS } from "@/hooks/useSite";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/collaborateurs")({
  head: () => ({
    meta: [
      { title: "Collaborateurs — Stocka" },
      { name: "description", content: "Créez les comptes de vos employés, leurs identifiants de connexion, salaires et rôles." },
      { property: "og:title", content: "Collaborateurs — Stocka" },
      { property: "og:description", content: "Gérez votre équipe, ses accès et son salaire de base." },
    ],
  }),
  component: TeamPage,
});

type TeamRow = {
  id: string;
  full_name: string;
  login_id: string | null;
  phone: string | null;
  email: string | null;
  base_salary: number;
  active: boolean;
  default_site_id: string | null;
  site_ids: string[];
  user_roles: Array<{ role: string }>;
};

type FormState = {
  full_name: string;
  login_id: string;
  password: string;
  email: string;
  phone: string;
  base_salary: string;
  active: boolean;
  role: string;
  site_ids: string[];
  default_site_id: string;
};

const emptyForm: FormState = {
  full_name: "",
  login_id: "",
  password: "",
  email: "",
  phone: "",
  base_salary: "0",
  active: true,
  role: "employe",
  site_ids: [],
  default_site_id: "",
};

function randomPassword() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function saveSites(userId: string, siteIds: string[], defaultSiteId: string) {
  await supabase.from("user_sites").delete().eq("user_id", userId);
  if (siteIds.length > 0) {
    const { error } = await supabase
      .from("user_sites")
      .insert(siteIds.map((site_id) => ({ user_id: userId, site_id })));
    if (error) throw error;
  }
  const fallback = defaultSiteId || siteIds[0] || null;
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ default_site_id: fallback })
    .eq("id", userId);
  if (profileError) throw profileError;
}

function SitesPicker({
  sites,
  form,
  setForm,
}: {
  sites: Array<{ id: string; name: string; kind: string }>;
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  function toggle(id: string) {
    const next = form.site_ids.includes(id)
      ? form.site_ids.filter((s) => s !== id)
      : [...form.site_ids, id];
    setForm({
      ...form,
      site_ids: next,
      default_site_id: next.includes(form.default_site_id) ? form.default_site_id : (next[0] ?? ""),
    });
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>Points de vente autorisés</Label>
      <div className="grid gap-1 rounded-md border border-border p-2 sm:grid-cols-2">
        {sites.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Créez d'abord un point de vente dans Paramètres.
          </p>
        )}
        {sites.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.site_ids.includes(s.id)}
              onChange={() => toggle(s.id)}
              className="size-4 accent-primary"
            />
            <span className="truncate">
              {s.name}{" "}
              <span className="text-xs text-muted-foreground">
                {SITE_KIND_LABELS[s.kind] ?? s.kind}
              </span>
            </span>
          </label>
        ))}
      </div>
      <Label htmlFor="defsite">Point de vente affiché par défaut</Label>
      <select
        id="defsite"
        value={form.default_site_id}
        onChange={(e) => setForm({ ...form, default_site_id: e.target.value })}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">— Aucun —</option>
        {sites
          .filter((s) => form.site_ids.includes(s.id))
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
      <p className="text-xs text-muted-foreground">
        Un administrateur voit tous les points de vente ; un employé ne voit que ceux cochés ici.
      </p>
    </div>
  );
}

function TeamPage() {
  const { data: me } = useCurrentUser();
  const { data: sites } = useAllSites();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [removing, setRemoving] = useState<TeamRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [credentials, setCredentials] = useState<{ login: string; password: string; name: string } | null>(null);

  const { data: team, isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [{ data, error }, { data: roles, error: rolesError }, { data: links }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, login_id, phone, email, base_salary, active, default_site_id")
          .order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("user_sites").select("user_id, site_id"),
      ]);
      if (error) throw error;
      if (rolesError) throw rolesError;
      return (data ?? []).map((p) => ({
        ...p,
        site_ids: (links ?? []).filter((l) => l.user_id === p.id).map((l) => l.site_id),
        user_roles: (roles ?? [])
          .filter((r) => r.user_id === p.id)
          .map((r) => ({ role: r.role as string })),
      })) as TeamRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const typed = form.password.trim();
      if (typed && typed.length < 6) {
        throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
      }
      const password = typed || randomPassword();

      const created = await createCollaborator({
        data: {
          full_name: form.full_name.trim(),
          login_id: form.login_id.trim(),
          password,
          email: form.email.trim(),
          phone: form.phone.trim(),
          base_salary: Number(form.base_salary) || 0,
          role: form.role as "employe" | "admin",
        },
      });
      await saveSites(created.id, form.site_ids, form.default_site_id);
      await logActivity("Collaborateur créé", "collaborateurs", form.full_name.trim());
      return { login: form.login_id.trim(), password, name: form.full_name.trim() };
    },
    onSuccess: (creds) => {
      setCreating(false);
      setForm(emptyForm);
      setCredentials(creds);
      void queryClient.invalidateQueries({ queryKey: ["team"] });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          base_salary: Number(form.base_salary) || 0,
          active: form.active,
        })
        .eq("id", editing.id);
      if (error) throw error;

      const currentRole = editing.user_roles[0]?.role ?? "employe";
      if (me?.isAdmin && form.role !== currentRole) {
        await supabase.from("user_roles").delete().eq("user_id", editing.id);
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({ user_id: editing.id, role: form.role as "employe" | "admin" });
        if (roleError) throw roleError;
      }

      await saveSites(editing.id, form.site_ids, form.default_site_id);

      if (form.password.trim()) {
        if (form.password.trim().length < 6) {
          throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
        }
        await setCollaboratorPassword({ data: { user_id: editing.id, password: form.password.trim() } });
      }

      await logActivity("Collaborateur mis à jour", "collaborateurs", form.full_name);
      return form.password.trim()
        ? { login: editing.login_id ?? "", password: form.password.trim(), name: form.full_name.trim() }
        : null;
    },
    onSuccess: (creds) => {
      toast.success("Collaborateur mis à jour.");
      setEditing(null);
      if (creds) setCredentials(creds);
      void queryClient.invalidateQueries({ queryKey: ["team"] });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!removing) return;
      await deleteCollaborator({ data: { user_id: removing.id } });
      await logActivity("Collaborateur supprimé", "collaborateurs", removing.full_name);
    },
    onSuccess: () => {
      toast.success("Collaborateur supprimé.");
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ["team"] });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startCreate() {
    setForm({ ...emptyForm, password: randomPassword() });
    setCreating(true);
  }

  function startEdit(t: TeamRow) {
    setEditing(t);
    setForm({
      full_name: t.full_name,
      login_id: t.login_id ?? "",
      password: "",
      email: t.email ?? "",
      phone: t.phone ?? "",
      base_salary: String(t.base_salary),
      active: t.active,
      role: t.user_roles[0]?.role === "employe" ? "employe" : "admin",
      site_ids: t.site_ids,
      default_site_id: t.default_site_id ?? t.site_ids[0] ?? "",
    });
  }

  const rows = team ?? [];

  return (
    <PageShell
      title="Collaborateurs"
      description="Créez un compte par employé : un identifiant et un mot de passe suffisent pour se connecter. L'e-mail est facultatif."
      actions={
        me?.isAdmin ? (
          <Button size="sm" onClick={startCreate}>
            <Plus className="size-4" /> Ajouter un collaborateur
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Collaborateurs" value={String(rows.length)} />
        <StatCard label="Actifs" value={String(rows.filter((r) => r.active).length)} />
        <StatCard
          label="Masse salariale de base"
          value={money(rows.filter((r) => r.active).reduce((s, r) => s + Number(r.base_salary), 0))}
        />
      </div>

      <Panel title="Équipe">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Identifiant</th>
                <th className="px-4 py-2">Téléphone</th>
                <th className="px-4 py-2">E-mail</th>
                <th className="px-4 py-2">Rôle</th>
                <th className="px-4 py-2">Points de vente</th>
                <th className="px-4 py-2">Salaire de base</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2" data-print="hide" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={9} label={isLoading ? "Chargement…" : "Aucun collaborateur."} />
              ) : (
                rows.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{t.full_name}</td>
                    <td className="px-4 py-2 text-xs">{t.login_id ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{t.phone ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{t.email ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant="secondary">
                        {ROLE_LABELS[t.user_roles[0]?.role ?? "employe"] ?? "Employé"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {t.user_roles[0]?.role !== "employe"
                        ? "Tous"
                        : t.site_ids.length === 0
                          ? "—"
                          : t.site_ids
                              .map((id) => (sites ?? []).find((s) => s.id === id)?.name ?? "—")
                              .join(", ")}
                    </td>
                    <td className="px-4 py-2 num">{money(t.base_salary)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={t.active ? "default" : "destructive"}>
                        {t.active ? "Actif" : "Inactif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right" data-print="hide">
                      <Button variant="ghost" size="icon" aria-label="Modifier" onClick={() => startEdit(t)}>
                        <Pencil className="size-4" />
                      </Button>
                      {me?.isAdmin && t.id !== me.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Supprimer"
                          onClick={() => setRemoving(t)}
                        >
                          <Trash2 className="size-4 text-destructive" />
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

      {/* Création */}
      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau collaborateur</DialogTitle>
            <DialogDescription>
              L'identifiant et le mot de passe seront affichés à la fin pour être communiqués à l'employé.
              L'e-mail est facultatif.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cfn">Nom complet</Label>
              <Input id="cfn" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={120} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="clog">Identifiant de connexion</Label>
                <Input
                  id="clog"
                  value={form.login_id}
                  onChange={(e) => setForm({ ...form, login_id: e.target.value })}
                  placeholder="aicha"
                  maxLength={40}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpwd">Mot de passe</Label>
                <div className="flex gap-2">
                  <Input id="cpwd" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} maxLength={72} />
                  <Button type="button" variant="outline" size="icon" aria-label="Générer" onClick={() => setForm({ ...form, password: randomPassword() })}>
                    <KeyRound className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cph">Téléphone (facultatif)</Label>
                <Input id="cph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cem">E-mail (facultatif)</Label>
                <Input id="cem" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cbs">Salaire de base</Label>
                <Input id="cbs" type="number" min="0" step="any" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crole">Rôle</Label>
                <select
                  id="crole"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="employe">Employé</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4">
              <SitesPicker sites={sites ?? []} form={form} setForm={setForm} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Annuler
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Création…" : "Créer le compte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modification */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le collaborateur</DialogTitle>
            <DialogDescription>
              Identifiant : <span className="font-medium text-foreground">{editing?.login_id ?? "—"}</span>.
              {" Vous pouvez aussi changer son rôle et ses points de vente."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fn">Nom complet</Label>
              <Input id="fn" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={120} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ph">Téléphone (facultatif)</Label>
                <Input id="ph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="em">E-mail (facultatif)</Label>
                <Input id="em" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bs">Salaire de base</Label>
                <Input id="bs" type="number" min="0" step="any" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="npwd">Nouveau mot de passe (facultatif)</Label>
                <div className="flex gap-2">
                  <Input id="npwd" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} maxLength={72} placeholder="Laisser vide" />
                  <Button type="button" variant="outline" size="icon" aria-label="Générer" onClick={() => setForm({ ...form, password: randomPassword() })}>
                    <KeyRound className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
            {me?.isAdmin && (
              <div className="space-y-2">
                <Label htmlFor="role">Rôle</Label>
                <select
                  id="role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="employe">Employé</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
            )}
            <div className="grid gap-4">
              <SitesPicker sites={sites ?? []} form={form} setForm={setForm} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label htmlFor="active">Compte actif</Label>
              <Switch id="active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Annuler
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suppression */}
      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer {removing?.full_name} ?</DialogTitle>
            <DialogDescription>
              Le compte et l'accès à l'application seront définitivement supprimés. Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Identifiants à communiquer */}
      <Dialog open={Boolean(credentials)} onOpenChange={(o) => !o && setCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Identifiants de {credentials?.name}</DialogTitle>
            <DialogDescription>
              Communiquez ces accès à l'employé. Le mot de passe ne sera plus affiché après fermeture.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs uppercase text-muted-foreground">Identifiant</p>
              <p className="font-display text-lg font-bold">{credentials?.login}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs uppercase text-muted-foreground">Mot de passe</p>
              <p className="font-display text-lg font-bold">{credentials?.password}</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                const text = `Identifiant : ${credentials?.login}\nMot de passe : ${credentials?.password}`;
                void navigator.clipboard.writeText(text).then(() => toast.success("Identifiants copiés."));
              }}
            >
              <Copy className="size-4" /> Copier
            </Button>
            <Button onClick={() => setCredentials(null)}>Terminé</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
