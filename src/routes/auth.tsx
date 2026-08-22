import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginToEmail } from "@/lib/format";
import { logActivity } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Stocka" },
      { name: "description", content: "Connectez-vous à Stocka avec votre identifiant collaborateur." },
      { property: "og:title", content: "Connexion — Stocka" },
      { property: "og:description", content: "Accès collaborateurs à la gestion de stocks Stocka." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function homeFor(userId: string) {
    const { data } = await supabase.rpc("is_admin", { _user_id: userId });
    return data === true ? "/tableau-de-bord" : "/mon-espace";
  }

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const to = await homeFor(data.session.user.id);
        navigate({ to, replace: true });
      }
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!loginId.trim() || password.length < 6) {
      toast.error("Identifiant requis et mot de passe de 6 caractères minimum.");
      return;
    }
    setLoading(true);
    const email = loginToEmail(loginId);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await logActivity("Connexion", "auth", `Identifiant : ${loginId}`);
      const { data: session } = await supabase.auth.getUser();
      const to = session.user ? await homeFor(session.user.id) : "/mon-espace";
      navigate({ to, replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Connexion impossible, vérifiez vos accès.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="panel w-full max-w-md p-8">
        <p className="font-display text-sm font-bold tracking-[0.3em] text-primary">STOCKA</p>
        <h1 className="mt-3 font-display text-2xl font-bold">
          {mode === "login" ? "Connexion collaborateur" : "Créer le premier compte"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "login"
            ? "Utilisez l'identifiant et le mot de passe fournis par votre administrateur."
            : "Le tout premier compte créé devient Super-administrateur."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="fullName">Nom complet</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Aïcha Diallo"
                maxLength={80}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="loginId">Identifiant</Label>
            <Input
              id="loginId"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="aicha"
              autoComplete="username"
              maxLength={40}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              maxLength={72}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Patientez…" : mode === "login" ? "Se connecter" : "Créer le compte"}
          </Button>
        </form>

      </div>
    </main>
  );
}
