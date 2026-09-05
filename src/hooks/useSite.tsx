import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export type SiteRow = {
  id: string;
  name: string;
  kind: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  /** actif | pause */
  status: string;
  /** non nul = point de vente dans la corbeille */
  deleted_at: string | null;
};

/** Un point de vente est utilisable s'il est actif, non en pause et non supprimé. */
export function isSiteUsable(s: SiteRow) {
  return s.active && s.status !== "pause" && !s.deleted_at;
}

export const SITE_KINDS = ["boutique", "alimentation", "entrepot", "cave"] as const;

export const SITE_KIND_LABELS: Record<string, string> = {
  boutique: "Boutique",
  alimentation: "Alimentation",
  entrepot: "Entrepôt",
  cave: "Cave",
};

const STORAGE_KEY = "stocka.active-site";

/** Tous les points de vente (lecture seule) — utile pour les libellés. */
export function useAllSites() {
  return useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id, name, kind, address, phone, active, status, deleted_at")
        .order("name");
      if (error) throw error;
      return (data ?? []) as SiteRow[];
    },
    staleTime: 120_000,
  });
}

/** Points de vente auxquels l'utilisateur courant est affecté. */
function useMySiteIds(enabled: boolean) {
  return useQuery({
    queryKey: ["my-sites"],
    enabled,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [] as string[];
      const { data, error } = await supabase
        .from("user_sites")
        .select("site_id")
        .eq("user_id", auth.user.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.site_id);
    },
    staleTime: 120_000,
  });
}

type SiteContextValue = {
  /** Points de vente visibles par l'utilisateur. */
  sites: SiteRow[];
  /** Point de vente actif ; null = tous les points (administrateur seulement). */
  siteId: string | null;
  setSiteId: (id: string | null) => void;
  /** true si l'utilisateur consulte tous les points de vente. */
  allSites: boolean;
  /** Peut-il choisir « Tous les points de vente » ? */
  canSeeAll: boolean;
  siteName: (id: string | null | undefined) => string;
  isLoading: boolean;
};

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const { data: me } = useCurrentUser();
  const { data: allSites, isLoading } = useAllSites();
  const { data: mySiteIds } = useMySiteIds(Boolean(me) && !me?.isAdmin);
  const [siteId, setSiteIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const isAdmin = Boolean(me?.isAdmin);

  const sites = useMemo(() => {
    const list = (allSites ?? []).filter(isSiteUsable);
    if (isAdmin) return list;
    const ids = mySiteIds ?? [];
    return list.filter((s) => ids.includes(s.id));
  }, [allSites, isAdmin, mySiteIds]);

  // Initialise le point de vente actif : dernier choix mémorisé, sinon défaut du profil.
  useEffect(() => {
    if (ready || !me || sites.length === 0) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored === "all" && isAdmin) {
      setSiteIdState(null);
      setReady(true);
      return;
    }
    if (stored && sites.some((s) => s.id === stored)) {
      setSiteIdState(stored);
      setReady(true);
      return;
    }
    void supabase
      .from("profiles")
      .select("default_site_id")
      .eq("id", me.id)
      .maybeSingle()
      .then(({ data }) => {
        const fallback = data?.default_site_id;
        const chosen =
          fallback && sites.some((s) => s.id === fallback) ? fallback : (sites[0]?.id ?? null);
        setSiteIdState(chosen);
        setReady(true);
      });
  }, [me, sites, isAdmin, ready]);

  function setSiteId(id: string | null) {
    setSiteIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id ?? "all");
  }

  const value: SiteContextValue = {
    sites,
    siteId,
    setSiteId,
    allSites: siteId === null,
    canSeeAll: isAdmin,
    siteName: (id) => (allSites ?? []).find((s) => s.id === id)?.name ?? "—",
    isLoading,
  };

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) {
    return {
      sites: [],
      siteId: null,
      setSiteId: () => {},
      allSites: true,
      canSeeAll: false,
      siteName: () => "—",
      isLoading: true,
    };
  }
  return ctx;
}
