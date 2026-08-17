export const CURRENCY = "FCFA";

export function money(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${CURRENCY}`;
}

export function qty(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function periodOptions(count = 12): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export const LOGIN_DOMAIN = "stock.local";

export function loginToEmail(loginId: string): string {
  return `${loginId.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}@${LOGIN_DOMAIN}`;
}

export const EXPENSE_CATEGORIES = [
  "Loyer",
  "Electricité",
  "Eau",
  "Glace",
  "Aliment",
  "Nourriture",
  "Chaise",
  "Table",
  "Ustensile",
  "Autre",
];

export const ROLE_LABELS: Record<string, string> = {
  employe: "Employé",
  admin: "Administrateur",
};
