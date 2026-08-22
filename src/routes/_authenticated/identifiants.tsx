import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Eye, KeyRound } from "lucide-react";
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
import {
  getUserCredentials,
  listAllAccounts,
  updateUserCredentials,
} from "@/lib/accounts.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/identifiants")({
  head: () => ({
    meta: [
      { title: "Identifiants & mots de passe — Stocka" },
      {
        name: "description",
        content:
          "Espace super-administrateur : modifier l'identifiant de connexion et le mot de passe de n'importe quel compte.",
      },
      { property: "og:title", content: "Identifiants & mots de passe — Stocka" },
      {
        property: "og:description",
        content: "Réinitialisation des identifiants et mots de passe de tous les comptes.",
      },
    ],
  }),
  component: CredentialsPage,
});

type Account = {
  id: string;
  full_name: string;
  login_id: string | null;
  active: boolean;
  role: string;
  company_id: string | null;
  company_name: string | null;
};

const ROLE_TEXT: Record<string, string> = {
  superadmin: "Super-administrateur",
  admin: "Administrateur",
  employe: "Employé",
};

function CredentialsPage() {
  const { data: me } = useCurrentUser();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<Account | null>(null);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [viewing, setViewing] = useState<Account | null>(null);

  type Creds = {
    full_name: string;
    login_id: string | null;
    email: string | null;
    password: string | null;
  };

  const credsQuery = useQuery({
    queryKey: ["account-credentials", viewing?.id],
    queryFn: () => getUserCredentials({ data: { user_id: viewing!.id } }) as Promise<Creds>,
    enabled: !!viewing,
  });


  const { data: accounts, isLoading } = useQuery({
    queryKey: ["all-accounts"],
    queryFn: () => listAllAccounts() as Promise<Account[]>,
    enabled: !!me?.isSuperAdmin,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const nextLogin = loginId.trim();
      const nextPassword = password.trim();
      if (!nextLogin && !nextPassword)
        throw new Error("Renseignez un nouvel identifiant ou un nouveau mot de passe.");
      await updateUserCredentials({
        data: {
          user_id: target.id,
          ...(nextLogin && nextLogin !== (target.login_id ?? "") ? { login_id: nextLogin } : {}),
          ...(nextPassword ? { password: nextPassword } : {}),
        },
      });
      await logActivity("Identifiants modifiés", "identifiants", target.full_name);
    },
    onSuccess: () => {
      toast.success("Accès mis à jour.");
      setTarget(null);
      setPassword("");
      void queryClient.invalidateQueries({ queryKey: ["all-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (me && !me.isSuperAdmin) {
    return (
      <PageShell title="Identifiants & mots de passe" description="Accès réservé.">
        <Panel title="Accès refusé">
          <p className="p-4 text-sm text-muted-foreground">
            Seul le super-administrateur peut modifier les accès des comptes.
          </p>
        </Panel>
      </PageShell>
    );
  }

  const term = search.trim().toLowerCase();
  const rows = (accounts ?? []).filter(
    (a) =>
      !term ||
      a.full_name.toLowerCase().includes(term) ||
      (a.login_id ?? "").toLowerCase().includes(term) ||
      (a.company_name ?? "").toLowerCase().includes(term),
  );

  return (
    <PageShell
      title="Identifiants & mots de passe"
      description="Modifiez l'identifiant de connexion et le mot de passe de n'importe quel compte, toutes entreprises confondues."
    >
      <Panel
        title="Comptes"
        actions={
          <Input
            placeholder="Rechercher un nom, identifiant, entreprise…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-64"
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Identifiant</th>
                <th className="px-4 py-2">Rôle</th>
                <th className="px-4 py-2">Entreprise</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2" data-print="hide" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={6} label={isLoading ? "Chargement…" : "Aucun compte."} />
              ) : (
                rows.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{a.full_name}</td>
                    <td className="px-4 py-2 text-xs">{a.login_id ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{ROLE_TEXT[a.role] ?? a.role}</td>
                    <td className="px-4 py-2 text-xs">{a.company_name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant={a.active ? "default" : "secondary"}>
                        {a.active ? "Actif" : "Inactif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right" data-print="hide">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setTarget(a);
                          setLoginId(a.login_id ?? "");
                          setPassword("");
                        }}
                      >
                        <KeyRound className="size-4" /> Modifier les accès
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accès de {target?.full_name}</DialogTitle>
            <DialogDescription>
              Laissez un champ vide pour ne pas le modifier. Le nouvel identifiant sert immédiatement
              à la connexion.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="login">Identifiant de connexion</Label>
              <Input
                id="login"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                maxLength={40}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pwd">Nouveau mot de passe</Label>
              <Input
                id="pwd"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 caractères"
                maxLength={72}
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
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
