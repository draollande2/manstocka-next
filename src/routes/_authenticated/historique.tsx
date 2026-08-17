import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, EmptyRow, StatCard } from "@/components/PageShell";
import { Input } from "@/components/ui/input";
import { dateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/historique")({
  head: () => ({
    meta: [
      { title: "Historique — Stocka" },
      { name: "description", content: "Journal des connexions et de toutes les actions réalisées dans l'application." },
      { property: "og:title", content: "Historique — Stocka" },
      { property: "og:description", content: "Traçabilité complète : qui a fait quoi et quand." },
    ],
  }),
  component: HistoryPage,
});

type LogRow = {
  id: string;
  user_name: string | null;
  action: string;
  entity: string | null;
  details: string | null;
  created_at: string;
};

function HistoryPage() {
  const [search, setSearch] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id, user_name, action, entity, details, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const term = search.trim().toLowerCase();
  const rows = (logs ?? []).filter((l) =>
    !term
      ? true
      : `${l.user_name ?? ""} ${l.action} ${l.entity ?? ""} ${l.details ?? ""}`
          .toLowerCase()
          .includes(term),
  );

  const connections = (logs ?? []).filter((l) => l.action.toLowerCase().includes("connexion")).length;

  return (
    <PageShell
      title="Historique"
      description="Chaque connexion, vente, dépense ou modification est enregistrée avec l'auteur et l'horodatage."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Événements enregistrés" value={String(logs?.length ?? 0)} />
        <StatCard label="Connexions / déconnexions" value={String(connections)} />
        <StatCard label="Résultats affichés" value={String(rows.length)} />
      </div>

      <div data-print="hide">
        <Input
          placeholder="Rechercher un collaborateur, une action…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={80}
        />
      </div>

      <Panel title="Journal d'activité">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Collaborateur</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Module</th>
                <th className="px-4 py-2">Détails</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={5} label={isLoading ? "Chargement…" : "Aucun événement."} />
              ) : (
                rows.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-4 py-2 whitespace-nowrap text-xs">{dateTime(l.created_at)}</td>
                    <td className="px-4 py-2 font-medium">{l.user_name ?? "—"}</td>
                    <td className="px-4 py-2">{l.action}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{l.entity ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{l.details ?? "—"}</td>
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
