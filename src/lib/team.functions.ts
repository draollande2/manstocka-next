import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loginToEmail } from "@/lib/format";

const roleSchema = z.enum(["employe", "admin"]);

const createSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  login_id: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "Identifiant : lettres, chiffres, . _ - uniquement"),
  password: z.string().min(6).max(72),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  base_salary: z.number().min(0).max(100_000_000),
  role: roleSchema,
});

const passwordSchema = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(6).max(72),
});

const deleteSchema = z.object({ user_id: z.string().uuid() });

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const supabase = context.supabase as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data } = await supabase.rpc("is_admin", { _user_id: context.userId });
  if (data !== true) throw new Error("Action réservée aux administrateurs.");
}

export const createCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: myProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    const companyId = myProfile?.company_id ?? null;

    const authEmail = loginToEmail(data.login_id);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        login_id: data.login_id.trim(),
        ...(companyId ? { company_id: companyId } : {}),
      },
    });
    if (error || !created.user) {
      throw new Error(
        error?.message?.includes("already")
          ? "Cet identifiant est déjà utilisé."
          : (error?.message ?? "Création impossible."),
      );
    }
    const userId = created.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.full_name,
        login_id: data.login_id.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        base_salary: data.base_salary,
        active: true,
        ...(companyId ? { company_id: companyId } : {}),
      })
      .eq("id", userId);
    if (profileError) throw new Error(profileError.message);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (roleError) throw new Error(roleError.message);

    return { id: userId, login_id: data.login_id.trim() };
  });

export const setCollaboratorPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => passwordSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId) throw new Error("Vous ne pouvez pas supprimer votre propre compte.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
