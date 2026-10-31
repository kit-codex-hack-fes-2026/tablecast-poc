import { expect, it } from "vitest";
import { extractLocaleFromRequestAsync } from "../paraglide/runtime.js";
import { registerDefaultLocale } from "./runtime-default";

registerDefaultLocale();

it.each(["ja", "en", "zh-Hans", "ko"])(
  "SSRは保存済みの%sを初期日本語より優先する",
  async (locale) => {
    const request = new Request("https://tablecast.example.test/member", {
      headers: { Cookie: `tablecast_locale=${locale}` },
    });
    expect(await extractLocaleFromRequestAsync(request)).toBe(locale);
  },
);

it.each(["", "tablecast_locale=unknown", "another_cookie=en"])(
  "未選択・不正なCookieでは初期日本語を使う: %s",
  async (cookie) => {
    const request = new Request("https://tablecast.example.test/member", {
      headers: { Cookie: cookie },
    });
    expect(await extractLocaleFromRequestAsync(request)).toBe("ja");
  },
);
