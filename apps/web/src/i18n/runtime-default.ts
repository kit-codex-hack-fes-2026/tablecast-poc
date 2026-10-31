import {
  defineCustomClientStrategy,
  defineCustomServerStrategy,
  extractLocaleFromRequestWithStrategies,
} from "../paraglide/runtime.js";

// 文言のfallbackは英語、利用者が未選択の場合の初期表示は日本語。
export function registerDefaultLocale() {
  defineCustomServerStrategy("custom-tablecast-default", {
    getLocale: (request) => {
      if (!request) return "ja";
      // serverのcustom strategyはCookieより先に評価されるため、標準のCookie解決を先に使う。
      try {
        return extractLocaleFromRequestWithStrategies(request, ["cookie"]);
      } catch {
        return "ja";
      }
    },
  });
  defineCustomClientStrategy("custom-tablecast-default", {
    getLocale: () => "ja",
    setLocale: () => undefined,
  });
}
