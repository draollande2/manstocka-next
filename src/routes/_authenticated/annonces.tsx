import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dateTime } from "@/lib/format";
import { logActivity, useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/annonces")({
  head: () => ({
    meta: [
      { title: "Messages défilants — Stocka" },
      {
        name: "description",
        content:
          "Diffusez des messages défilants avec pièces jointes, ciblés par entreprise ou par point de vente.",
      },
      { property: "og:title", content: "Messages défilants — Stocka" },
      {
        property: "og:description",
        content: "Bannière d'information ciblée par entreprise ou point de vente, avec fichiers joints.",
      },
    ],
  }),
  component: AnnouncementsPage,
});

type AnnouncementRow = {
  id: string;
  company_id: string | null;
  site_id: string | null;
  message: string;
  file_url: string | null;
  file_name: string | null;
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

const EMPTY = {
  message: "",
  company_id: "",
  site_id: "",
  starts_at: "",
  ends_at: "",
};

function AnnouncementsPage() {
  const { data: me } = useCurrentUser();
  const isSuperAdmin = Boolean(me?.isSuperAdmin);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [file, setFile] = useState<File | null>(null);

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

  const { data: sites } = useQuery({
    queryKey: ["all-sites", "annonces"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id, name, company_id")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; company_id: string }[];
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["announcements"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AnnouncementRow[];
    },
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["announcements"] });
    void queryClient.invalidateQueries({ queryKey: ["announcements-active"] });
  }

  const create = useMutation({
    mutationFn: async () => {
      const message = form.message.trim();
      if (!message) throw new Error("Le message est obligatoire.");

      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (file) {
        const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("annonces").upload(path, file);
        if (upErr) throw upErr;
        const { data: signed, error: signErr } = await supabase.storage
          .from("annonces")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        if (signErr) throw signErr;
        fileUrl = signed?.signedUrl ?? null;
        fileName = file.name;
      }

      const { error } = await supabase.from("announcements").insert({
        message,
        company_id: form.company_id || null,
        site_id: form.site_id || null,
        file_url: fileUrl,
        file_name: fileName,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : new Date().toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        created_by: me?.id ?? null,
      });
      if (error) throw error;
      await logActivity("Message défilant créé", "annonces", message.slice(0, 80));
    },
    onSuccess: () => {
      toast.success("Message publié.");
      setOpen(false);
      setForm({ ...EMPTY });
      setFile(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (row: AnnouncementRow) => {
      const { error } = await supabase
        .from("announcements")
        .update({ active: !row.active })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: AnnouncementRow) => {
      const { error } = await supabase.from("announcements").delete().eq("id", row.id);
      if (error) throw error;
      await logActivity("Message défilant supprimé", "annonces", row.message.slice(0, 80));
    },
    onSuccess: () => {
      toast.success("Message supprimé.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isSuperAdmin) {
    return (
      <PageShell title="Messages défilants" description="Accès réservé au super-administrateur.">
        <Panel>
          <p className="p-6 text-sm text-muted-foreground">Vous n'avez pas accès à cette page.</p>
        </Panel>
      </PageShell>
    );
  }

  const siteOptions = (sites ?? []).filter((s) => !form.company_id || s.company_id === form.company_id);
  const companyName = (id: string | null) =>
    id ? ((companies ?? []).find((c) => c.id === id)?.name ?? "—") : "Toutes les entreprises";
  const siteLabel = (id: string | null) =>
    id ? ((sites ?? []).find((s) => s.id === id)?.name ?? "—") : "Tous les points de vente";

  return (
    <PageShell
      title="Messages défilants"
      description="Publiez une bannière défilante visible dans l'application. Ciblez toutes les entreprises, une entreprise précise ou un seul point de vente, et joignez un fichier."
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Nouveau message
        </Button>
      }
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau message défilant</DialogTitle>
            <DialogDescription>
              Le message s'affiche en haut de l'application pour les destinataires choisis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="msg">Message</Label>
              <Textarea
                id="msg"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                maxLength={400}
                rows={3}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cmp">Entreprise ciblée</Label>
                <select
                  id="cmp"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.company_id}
                  onChange={(e) => setForm({ ...form, company_id: e.target.value, site_id: "" })}
                >
                  <option value="">Toutes les entreprises</option>
                  {(companies ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ste">Point de vente ciblé</Label>
                <select
                  id="ste"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.site_id}
                  onChange={(e) => setForm({ ...form, site_id: e.target.value })}
                >
                  <option value="">Tous les points de vente</option>
                  {siteOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="from">Début (optionnel)</Label>
                <Input
                  id="from"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to">Fin (optionnel)</Label>
                <Input
                  id="to"
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">Fichier joint (optionnel)</Label>
              <Input
                id="file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Publier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Panel title={`${rows?.length ?? 0} message(s)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Message</th>
                <th className="px-4 py-2">Entreprise</th>
                <th className="px-4 py-2">Point de vente</th>
                <th className="px-4 py-2">Période</th>
                <th className="px-4 py-2">Actif</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).length === 0 ? (
                <EmptyRow colSpan={6} label={isLoading ? "Chargement…" : "Aucun message."} />
              ) : (
                (rows ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="max-w-sm px-4 py-2">
                      <p>{r.message}</p>
                      {r.file_url && (
                        <a
                          href={r.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                        >
                          <Paperclip className="size-3" /> {r.file_name ?? "Pièce jointe"}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={r.company_id ? "default" : "secondary"}>
                        {companyName(r.company_id)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs">{siteLabel(r.site_id)}</td>
                    <td className="px-4 py-2 text-xs">
                      {dateTime(r.starts_at)}
                      <br />
                      {r.ends_at ? dateTime(r.ends_at) : "sans fin"}
                    </td>
                    <td className="px-4 py-2">
                      <Switch checked={r.active} onCheckedChange={() => toggle.mutate(r)} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Supprimer"
                        onClick={() => {
                          if (confirm("Supprimer ce message ?")) remove.mutate(r);
                        }}
                      >
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
    </PageShell>
  );
}
