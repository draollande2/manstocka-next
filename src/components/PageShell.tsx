import { Printer } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dateTime } from "@/lib/format";

export function useSettings() {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 300_000,
  });
}

export function PageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { data: settings } = useSettings();

  return (
    <div data-print="area" className="mx-auto w-full max-w-[1400px] space-y-6">
      <div className="print-header mb-4 border-b border-border pb-3">
        <p className="font-display text-lg font-bold">{settings?.company_name ?? "Stocka"}</p>
        <p className="text-xs text-muted-foreground">
          {title} — édité le {dateTime(new Date().toISOString())}
        </p>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div data-print="hide" className="flex flex-wrap items-center gap-2">
          {actions}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Exporter PDF
          </Button>
        </div>
      </header>

      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold num">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
        {label}
      </td>
    </tr>
  );
}

export function Panel({ title, children, actions }: { title?: string | undefined; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="font-display text-sm font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
