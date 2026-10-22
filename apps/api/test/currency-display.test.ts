import { describe, expect, it } from "vitest";
import {
  approximateAmounts,
  convertedAmount,
  currencySymbol,
  defaultDisplayCurrency,
  foreignMoney,
} from "../src/modules/currency/display";

describe("円を基準とする外貨参考額", () => {
  it("JPYから外貨へ換算し、通貨の小数桁で丸める", () => {
    expect(convertedAmount(1000, "AUD", 0.00967)).toBe(9.67);
    expect(convertedAmount(1000, "KRW", 9.1234)).toBe(9123);
    expect(convertedAmount(0, "USD", 0.006)).toBe(0);
    expect(convertedAmount(-500, "USD", 0.006)).toBe(-3);
    expect(foreignMoney(9.67, "AUD", "en")).toBe("A$9.67");
    expect(currencySymbol("GBP")).toBe("£");
    expect(currencySymbol("AUD")).toBe("A$");
  });
  it("レートがないと参考額を作らず、円や件数を置き換えない", () => {
    expect(approximateAmounts({ total: 1000 }, "AUD")).toEqual({});
    expect(approximateAmounts({ total: 1000 }, null)).toEqual({});
    expect(
      approximateAmounts({ total: 1000 }, "AUD", {
        base: "JPY",
        source: "currency-api",
        date: "2026-10-22",
        rates: { AUD: 0.00967 },
      }),
    ).toEqual({ approximate: { total: 9.67 } });
    expect(defaultDisplayCurrency("ja")).toBeNull();
    expect(defaultDisplayCurrency("en")).toBe("USD");
  });
});
