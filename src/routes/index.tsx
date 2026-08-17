import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, ShoppingCart, PiggyBank, FileText } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stocka — Gestion de stocks détail & gros" },
      {
        name: "description",
        content:
          "Pilotez vos stocks en détail et en gros : ventes avec panier, factures numérotées, dépenses, salaires, manques & pertes et comptes d'épargne.",
      },
      { property: "og:title", content: "Stocka — Gestion de stocks détail & gros" },
      {
        property: "og:description",
        content:
          "Stocks, ventes, factures, dépenses, salaires et épargne des employés dans une seule application.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Boxes, title: "Détail & Gros", text: "Un sac de 50 Kg entre en stock, se vend au Kg ou au sac." },
  { icon: ShoppingCart, title: "Vente au panier", text: "Plusieurs produits, une seule facture au nom du client." },
  { icon: FileText, title: "Factures & bons", text: "Numérotation automatique, impression et export PDF." },
  { icon: PiggyBank, title: "Salaires & épargne", text: "Pertes déduites, primes, retraits validés par un admin." },
];

function Landing() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-5xl flex-col gap-14 px-6 py-20">
        <header className="space-y-6">
          <p className="font-display text-sm font-bold tracking-[0.3em] text-primary">STOCKA</p>
          <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl">
            La gestion de stocks, du sac de 50 Kg jusqu'au dernier kilo vendu.
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            Entrées, sorties, ventes en détail et en gros, factures, dépenses, salaires, manques &
            pertes, comptes d'épargne — tout est enregistré et exportable en PDF.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Se connecter
            </Link>
            <Link
              to="/tableau-de-bord"
              className="inline-flex items-center justify-center rounded-md border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              Accéder à l'application
            </Link>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel p-5">
              <f.icon className="size-5 text-primary" />
              <h2 className="mt-3 font-display text-base font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
