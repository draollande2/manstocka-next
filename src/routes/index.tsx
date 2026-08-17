import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ManStockaV2" },
      { name: "description", content: "ManStockaV2 — application de gestion de stock." },
      { property: "og:title", content: "ManStockaV2" },
      { property: "og:description", content: "ManStockaV2 — application de gestion de stock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          ManStockaV2
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Projet vide — prêt à être développé.
        </p>
      </div>
    </main>
  );
}
