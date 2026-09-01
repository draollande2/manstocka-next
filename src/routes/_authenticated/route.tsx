import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar, NAV } from "@/components/AppSidebar";
import { SiteProvider } from "@/hooks/useSite";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { ZoomControl } from "@/components/ZoomControl";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function usePageTitle() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return NAV.find((item) => item.to === pathname)?.label ?? "STOCKA";
}

function AuthenticatedLayout() {
  const { data: user } = useCurrentUser();
  const pageTitle = usePageTitle();

  return (
    <SiteProvider>
      <div className="min-h-screen bg-background">
        <AppSidebar />
        <header
          data-print="hide"
          className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:pl-[19rem] lg:pr-8"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-card-foreground shadow-sm">
              <Building2 className="size-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-semibold">
                {user?.companyName ?? "Entreprise"}
              </span>
            </div>
          </div>

          <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:block">
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <ZoomControl />
            <SiteSwitcher />
          </div>
        </header>
        <div className="pt-14 lg:pl-[19rem]">
          <AnnouncementBanner />
        </div>
        <main id="app-zoom-root" className="px-4 pb-16 pt-6 lg:pl-[19rem] lg:pr-8">
          <Outlet />
        </main>
      </div>
    </SiteProvider>
  );
}
