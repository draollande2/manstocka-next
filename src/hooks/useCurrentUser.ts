import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "employe" | "admin" | "superadmin";

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string;
  loginId: string | null;
  roles: Role[];
  role: Role;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  companyId: string | null;
  companyName: string | null;
};

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, login_id, company_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  const { data: company } = profile?.company_id
    ? await supabase.from("companies").select("name").eq("id", profile.company_id).maybeSingle()
    : { data: null };

  // Le rôle Super-administrateur a été supprimé : tout compte non employé est administrateur.
  const raw = (roleRows ?? []).map((r) => String(r.role));
  const isSuperAdmin = raw.includes("superadmin");
  const isAdmin = isSuperAdmin || raw.includes("admin");
  const role: Role = isSuperAdmin ? "superadmin" : isAdmin ? "admin" : "employe";

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name || (user.email ?? "Collaborateur"),
    loginId: profile?.login_id ?? null,
    roles: [role],
    role,
    isAdmin,
    isSuperAdmin,
    companyId: profile?.company_id ?? null,
    companyName: company?.name ?? null,
  };
}


export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: 60_000,
  });
}

export async function logActivity(action: string, entity?: string, details?: string) {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  await supabase.from("activity_logs").insert({
    user_id: user.id,
    user_name: profile?.full_name ?? user.email ?? "",
    action,
    entity: entity ?? null,
    details: details ?? null,
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return async () => {
    await logActivity("Déconnexion", "auth");
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
  };
}
