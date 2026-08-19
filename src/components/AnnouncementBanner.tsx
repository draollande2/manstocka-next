import { useQuery } from "@tanstack/react-query";
import { Megaphone, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/hooks/useSite";

type Announcement = {
  id: string;
  message: string;
  file_url: string | null;
  file_name: string | null;
  site_id: string | null;
};

/** Bannière défilante affichant les messages actifs ciblant l'utilisateur. */
export function AnnouncementBanner() {
  const { siteId } = useSite();

  const { data } = useQuery({
    queryKey: ["announcements-active"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("announcements")
        .select("id, message, file_url, file_name, site_id")
        .eq("active", true)
        .lte("starts_at", nowIso)
        .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });

  const items = (data ?? []).filter((a) => !a.site_id || a.site_id === siteId);
  if (items.length === 0) return null;

  const content = (
    <span className="inline-flex items-center gap-10 pr-10">
      {items.map((a) => (
        <span key={a.id} className="inline-flex items-center gap-2">
          <Megaphone className="size-4 shrink-0" />
          <span>{a.message}</span>
          {a.file_url && (
            <a
              href={a.file_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              <Paperclip className="size-3.5" />
              {a.file_name ?? "Pièce jointe"}
            </a>
          )}
        </span>
      ))}
    </span>
  );

  return (
    <div
      data-print="hide"
      className="marquee border-b border-border bg-primary/10 py-1.5 text-sm text-foreground"
    >
      <div className="marquee-track">
        {content}
        {content}
      </div>
    </div>
  );
}
