import type { Product } from "@tablecast/api/schema";
export function emptyText(): Product["text"] {
  return {
    ja: { displayName: "", speechName: "", description: "", aliases: [] },
    en: { displayName: "", speechName: "", description: "", aliases: [] },
  };
}
