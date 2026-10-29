import { defineCustomClientStrategy, defineCustomServerStrategy } from "../paraglide/runtime.js";

// 文言のfallbackは英語、利用者が未選択の場合の初期表示は日本語。
export function registerDefaultLocale() {
  defineCustomServerStrategy("custom-tablecast-default", { getLocale: () => "ja" });
  defineCustomClientStrategy("custom-tablecast-default", {
    getLocale: () => "ja",
    setLocale: () => undefined,
  });
}
