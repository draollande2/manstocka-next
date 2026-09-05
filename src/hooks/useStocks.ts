import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/hooks/useSite";

export type StockEntry = { stock_units: number; min_stock_units: number };
export type StockMap = Record<string, StockEntry>;

/**
 * Stock des articles pour le point de vente actif.
 * Quand « Tous les points de vente » est choisi, les quantités sont cumulées.
 */
export function useProductStocks() {
  const { siteId } = useSite();
  return useQuery({
    queryKey: ["product-stocks", siteId ?? "all"],
    queryFn: async () => {
      let request = supabase
        .from("product_stocks")
        .select("product_id, site_id, stock_units, min_stock_units");
      if (siteId) request = request.eq("site_id", siteId);
      const { data, error } = await request;
      if (error) throw error;
      const map: StockMap = {};
      for (const row of data ?? []) {
        const current = map[row.product_id] ?? { stock_units: 0, min_stock_units: 0 };
        map[row.product_id] = {
          stock_units: current.stock_units + Number(row.stock_units),
          min_stock_units: current.min_stock_units + Number(row.min_stock_units),
        };
      }
      return map;
    },
  });
}

/** Stock détaillé par point de vente (tableau de bord général). */
export function useStocksBySite() {
  return useQuery({
    queryKey: ["product-stocks-by-site"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stocks")
        .select("product_id, site_id, stock_units, min_stock_units");
      if (error) throw error;
      return (data ?? []) as Array<{
        product_id: string;
        site_id: string;
        stock_units: number;
        min_stock_units: number;
      }>;
    },
  });
}

export function stockOf(map: StockMap | undefined, productId: string): StockEntry {
  return map?.[productId] ?? { stock_units: 0, min_stock_units: 0 };
}
