import type { Product } from "@tablecast/api/schema";
export function emptyText(): Product["text"] {
  return {
    ja: { displayName: "", transliteration: "", speechName: "", description: "", aliases: [] },
    en: { displayName: "", transliteration: "", speechName: "", description: "", aliases: [] },
  };
}
