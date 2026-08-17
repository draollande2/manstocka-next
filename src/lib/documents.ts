import { supabase } from "@/integrations/supabase/client";

export async function nextDocumentNumber(kind: "vente" | "entree"): Promise<string> {
  const { data, error } = await supabase.rpc("next_document_number", { _kind: kind });
  if (error) throw error;
  return data as unknown as string;
}
