import { expect, it } from "vitest";
import { usageCharge, utcMonthRange } from "../src/modules/billing/pricing";

it("90秒の音声を円未満の精度で計算し、初期15秒を上乗せしない", () => {
  expect(usageCharge({ seconds: 90 }, 10000)).toBe(12_000_000);
  expect(usageCharge({ seconds: 1 }, 15000)).toBe(200_000);
  expect(usageCharge({ seconds: 0.1 }, 10000)).toBe(13333);
});
it("実際のtier・cached input・長文料金と倍率を適用する", () => {
  const input = {
    model: "gpt-5.6-luna",
    serviceTier: "default",
    inputTokens: 1000,
    cachedTokens: 500,
    outputTokens: 100,
  };
  expect(usageCharge(input, 10000)).toBe(36800);
  expect(usageCharge({ ...input, serviceTier: "priority" }, 15000)).toBe(110400);
  expect(
    usageCharge({ ...input, inputTokens: 272001, cachedTokens: 0, outputTokens: 0 }, 10000),
  ).toBe(17408064);
  expect(() => usageCharge({ ...input, serviceTier: undefined }, 10000)).toThrow(
    "BILLING_TIER_UNPRICED",
  );
  expect(() => usageCharge({ ...input, cachedTokens: 1001 }, 10000)).toThrow(
    "BILLING_USAGE_INVALID",
  );
  expect(() => usageCharge({ ...input, model: "gpt-unpriced" }, 10000)).toThrow(
    "BILLING_MODEL_UNPRICED",
  );
});
it("月末と年末を半開区間で扱う", () => {
  expect(utcMonthRange("2026-12")).toEqual({
    start: Date.parse("2026-12-01Z"),
    end: Date.parse("2027-01-01Z"),
  });
  expect(() => utcMonthRange("2026-13")).toThrow("INVALID_INPUT");
});
