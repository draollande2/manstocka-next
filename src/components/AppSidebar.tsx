import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  ArrowRightLeft,

  ShoppingCart,
  Users,
  FileText,
  Receipt,
  AlertTriangle,
  Wallet,
  History,
  ClipboardCheck,
  BarChart3,
  Settings,
  UserCircle,
  PiggyBank,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useCurrentUser, useSignOut } from "@/hooks/useCurrentUser";
import { ROLE_LABELS } from "@/lib/format";

type NavItem = { to: string; label: string; icon: typeof Package; adminOnly?: boolean; superAdminOnly?: boolean };

// Pages accessibles au rôle Employé (il n'y voit que ses propres données).
const EMPLOYEE_PAGES = [
  "/mon-espace",
  "/vente",
  "/salaires",
  "/manques-pertes",
  "/mouvements",
  "/epargne",
  "/comptes",
];

const NAV: NavItem[] = [
  { to: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard, adminOnly: true },
  { to: "/produits", label: "Produits / Articles", icon: Package },
  { to: "/mouvements", label: "Mouvements", icon: ArrowLeftRight },
  { to: "/transferts", label: "Transferts de stock", icon: ArrowRightLeft },
  { to: "/vente", label: "Vente", icon: ShoppingCart },
  { to: "/collaborateurs", label: "Collaborateurs", icon: Users, adminOnly: true },
  { to: "/factures", label: "Factures", icon: FileText },
  { to: "/depenses", label: "Dépenses", icon: Receipt, adminOnly: true },
  { to: "/manques-pertes", label: "Manques & Pertes", icon: AlertTriangle },
  { to: "/salaires", label: "Salaire", icon: Wallet },
  { to: "/historique", label: "Historique", icon: History, adminOnly: true },
  { to: "/comptes", label: "États des stocks", icon: ClipboardCheck, adminOnly: false },
  { to: "/rapport", label: "Rapport mensuel", icon: BarChart3, adminOnly: true },
  { to: "/parametres", label: "Paramètres", icon: Settings, adminOnly: true },
  { to: "/mon-espace", label: "Mon espace employé", icon: UserCircle },
  { to: "/epargne", label: "Compte d'épargne", icon: PiggyBank },
];


export function AppSidebar() {
  const [open, setOpen] = useState(false);
  const { data: user } = useCurrentUser();
  const signOut = useSignOut();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = user?.isAdmin
    ? NAV.filter((i) => i.to !== "/mon-espace")
    : (EMPLOYEE_PAGES.map((p) => NAV.find((i) => i.to === p)).filter(Boolean) as NavItem[]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-print="hide"
        aria-label="Ouvrir le menu"
        className="fixed left-3 top-3 z-40 rounded-md border border-border bg-card p-2 text-foreground lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      {open && (
        <div
          data-print="hide"
          className="fixed inset-0 z-40 bg-background/70 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        data-print="hide"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-5 py-4">
          <div>
            <p className="font-display text-sm font-bold tracking-tight text-primary">STOCKA</p>
            <p className="text-xs text-muted-foreground">Gestion de stocks</p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {items.map((item, index) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                )}
              >
                <span className="w-4 text-right text-[10px] text-muted-foreground num">
                  {index + 1}
                </span>
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium">{user?.fullName ?? "…"}</p>
            <p className="text-xs text-muted-foreground">
              {user ? ROLE_LABELS[user.role] : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="size-4" /> Se déconnecter
          </button>
        </div>
      </aside>
    </>
  );
}
