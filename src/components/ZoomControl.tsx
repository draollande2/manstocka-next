import { useEffect, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

const KEY = "stocka-zoom";
const MIN = 0.6;
const MAX = 1.8;
const STEP = 0.1;

const clamp = (v: number) => Math.min(MAX, Math.max(MIN, Math.round(v * 100) / 100));

export function ZoomControl() {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(KEY));
    if (stored && !Number.isNaN(stored)) setZoom(clamp(stored));
  }, []);

  useEffect(() => {
    const root = document.getElementById("app-zoom-root");
    if (root) root.style.zoom = String(zoom);
    window.localStorage.setItem(KEY, String(zoom));
    return () => {
      if (root) root.style.zoom = "1";
    };
  }, [zoom]);

  return (
    <div
      data-print="hide"
      className="flex items-center gap-1 rounded-md border border-border bg-card px-1 py-1"
    >
      <button
        type="button"
        aria-label="Réduire l'affichage"
        onClick={() => setZoom((z) => clamp(z - STEP))}
        disabled={zoom <= MIN}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <Minus className="size-4" />
      </button>
      <span className="min-w-10 text-center text-xs num text-muted-foreground">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        aria-label="Agrandir l'affichage"
        onClick={() => setZoom((z) => clamp(z + STEP))}
        disabled={zoom >= MAX}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Réinitialiser le zoom"
        onClick={() => setZoom(1)}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <RotateCcw className="size-3.5" />
      </button>
    </div>
  );
}
