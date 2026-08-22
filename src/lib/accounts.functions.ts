import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loginToEmail } from "@/lib/format";

const updateSchema = z
  .object({
    user_id: z.string().uuid(),
    login_id: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Za-z0-9._-]+$/, "Identifiant : lettres, chiffres, . _ - uniquement")
      .optional(),
    password: z.string().min(6).max(72).optional(),
  })
  .refine((v) => v.login_id !== undefined || v.password !== undefined, {
    message: "Renseignez un nouvel identifiant ou un nouveau mot de passe.",
  });

async function assertSuperAdmin(context: { supabase: unknown; userId: string }) {
  const supabase = context.supabase as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data } = await supabase.rpc("is_superadmin", { _user_id: context.userId });
  if (data !== true) throw new Error("Action réservée au super-administrateur.");
}

export const listAllAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles, error }, { data: roles }, { data: companies }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, login_id, company_id, active")
        .order("full_name"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("companies").select("id, name"),
    ]);
    if (error) throw new Error(error.message);

    const roleByUser = new Map<string, string>();
    for (const r of roles ?? []) {
      const current = roleByUser.get(r.user_id);
      if (r.role === "superadmin" || (r.role === "admin" && current !== "superadmin") || !current) {
        roleByUser.set(r.user_id, r.role as string);
      }
    }
    const companyName = new Map((companies ?? []).map((c) => [c.id, c.name]));

    return (profiles ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      login_id: p.login_id,
      active: p.active,
      role: roleByUser.get(p.id) ?? "employe",
      company_id: p.company_id,
      company_name: p.company_id ? (companyName.get(p.company_id) ?? null) : null,
    }));
  });

export const updateUserCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload: { email?: string; password?: string; email_confirm?: boolean } = {};
    const newLogin = data.login_id?.trim();
    if (newLogin) {
      payload.email = loginToEmail(newLogin);
      payload.email_confirm = true;
    }
    if (data.password) payload.password = data.password;

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, payload);
    if (error) {
      throw new Error(
        error.message.includes("already")
          ? "Cet identifiant est déjà utilisé."
          : error.message,
      );
    }

    if (newLogin) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ login_id: newLogin })
        .eq("id", data.user_id);
      if (profileError) throw new Error(profileError.message);
    }

    const secret: Record<string, unknown> = { user_id: data.user_id, updated_at: new Date().toISOString() };
    if (newLogin) secret.login_id = newLogin;
    if (data.password) secret.password = data.password;
    await (supabaseAdmin as unknown as {
      from: (t: string) => {
        upsert: (v: unknown, o: unknown) => Promise<{ error: unknown }>;
      };
    })
      .from("account_secrets")
      .upsert(secret, { onConflict: "user_id" });

    return { ok: true, login_id: newLogin ?? null };
  });

export const getUserCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profile }, secretRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("full_name, login_id").eq("id", data.user_id).maybeSingle(),
      (supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { password: string | null } | null }> };
          };
        };
      })
        .from("account_secrets")
        .select("password")
        .eq("user_id", data.user_id)
        .maybeSingle(),
    ]);

    const login = profile?.login_id ?? null;
    return {
      full_name: profile?.full_name ?? "",
      login_id: login,
      email: login ? loginToEmail(login) : null,
      password: secretRes.data?.password ?? null,
    };
  });
