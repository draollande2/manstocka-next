import { Store } from "lucide-react";
import { useSite, SITE_KIND_LABELS } from "@/hooks/useSite";

export function SiteSwitcher() {
  const { sites, siteId, setSiteId, canSeeAll } = useSite();

  return (
    <div
      data-print="hide"
      className="flex items-center gap-2 rounded-md border border-destructive bg-destructive px-2 py-1 text-destructive-foreground"
    >
      <Store className="size-4 shrink-0" />
      <label htmlFor="site-switcher" className="sr-only">
        Point de vente actif
      </label>
      <select
        id="site-switcher"
        value={siteId ?? "all"}
        onChange={(e) => setSiteId(e.target.value === "all" ? null : e.target.value)}
        className="h-8 min-w-40 bg-destructive text-sm font-medium text-destructive-foreground outline-none"
      >
        {canSeeAll && <option value="all">Tous les points de vente</option>}
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {SITE_KIND_LABELS[s.kind] ?? s.kind}
          </option>
        ))}
        {sites.length === 0 && <option value="all">Aucun point de vente</option>}
      </select>
    </div>
  );
}
