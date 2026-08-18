import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loginToEmail } from "@/lib/format";

const ownerSchema = z.object({
  company_id: z.string().uuid(),
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
});

async function assertSuperAdmin(context: { supabase: unknown; userId: string }) {
  const supabase = context.supabase as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data } = await supabase.rpc("is_superadmin", { _user_id: context.userId });
  if (data !== true) throw new Error("Action réservée au super-administrateur.");
}

export const createCompanyOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ownerSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, name")
      .eq("id", data.company_id)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    if (!company) throw new Error("Entreprise introuvable.");

    const authEmail = loginToEmail(data.login_id);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        login_id: data.login_id.trim(),
        company_id: data.company_id,
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
        company_id: data.company_id,
        active: true,
      })
      .eq("id", userId);
    if (profileError) throw new Error(profileError.message);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (roleError) throw new Error(roleError.message);

    // Point de vente initial de l'entreprise + affectation du patron
    let siteId: string | null = null;
    const { data: existingSite } = await supabaseAdmin
      .from("sites")
      .select("id")
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    siteId = existingSite?.id ?? null;
    if (!siteId) {
      const { data: newSite } = await supabaseAdmin
        .from("sites")
        .insert({ name: "Point principal", kind: "boutique", company_id: data.company_id })
        .select("id")
        .maybeSingle();
      siteId = newSite?.id ?? null;
    }
    if (siteId) {
      await supabaseAdmin
        .from("user_sites")
        .insert({ user_id: userId, site_id: siteId, company_id: data.company_id });
      await supabaseAdmin.from("profiles").update({ default_site_id: siteId }).eq("id", userId);
    }

    // Paramètres de facturation de l'entreprise
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("id")
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!settings) {
      await supabaseAdmin
        .from("app_settings")
        .insert({ company_name: company.name, company_id: data.company_id });
    }

    return { id: userId, login_id: data.login_id.trim(), email: authEmail };
  });
