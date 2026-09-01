import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/AppSidebar";
import { SiteProvider } from "@/hooks/useSite";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { ZoomControl } from "@/components/ZoomControl";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <SiteProvider>
      <div className="min-h-screen bg-background">
        <AppSidebar />
        <header
          data-print="hide"
          className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-end gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:pl-[19rem] lg:pr-8"
        >
          <ZoomControl />
          <SiteSwitcher />
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
