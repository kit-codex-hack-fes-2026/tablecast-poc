import { expect, it } from "vitest";
import { automaticDisplayCurrency } from "./currency-model";

it.each([
  ["ja", null],
  ["en", "USD"],
  ["zh-Hans", "CNY"],
  ["ko", "KRW"],
  ["ko-KR", "KRW"],
  ["en-GB", "GBP"],
  ["en-AU", "AUD"],
  ["en-NZ", "NZD"],
  ["zh-Hant-TW", "TWD"],
  ["zh-HK", "HKD"],
  ["fr", "EUR"],
  ["de", "EUR"],
  ["bg", "EUR"],
  ["th", "THB"],
  ["vi", "VND"],
  ["en-JP", null],
] as const)("言語%sの地域に応じて初期参考通貨%sを選ぶ", (language, currency) => {
  expect(automaticDisplayCurrency(language)).toBe(currency);
});

it.each(["", "bad_locale", "eo", "fr-CA", "ru"])(
  "地域が不明か未対応の%sでは円だけを表示する",
  (language) => {
    expect(automaticDisplayCurrency(language)).toBeNull();
  },
);
