import { defineConfig } from "@inlang/paraglide-js";

// CLI・Viteの両方で同じCookieと初期言語を使う。
export default defineConfig({
  outdir: "./src/paraglide",
  strategy: ["cookie", "custom-tablecast-default", "baseLocale"],
  cookieName: "tablecast_locale",
});
