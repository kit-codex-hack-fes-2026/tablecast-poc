import type { BillingRates } from "./model";
import { ensure } from "../../platform/errors";

export const billingPricingVersion = "openai-2026-10-18";
export const billingUsdJpy = 160;
// 百万分の一円で保存する。整数の有理数計算で、累積値の差分を料金にする。
export function usageCharge(
  input: {
    seconds?: number;
    inputTokens?: number;
    cachedTokens?: number;
    outputTokens?: number;
    model?: string;
    serviceTier?: string | null;
  },
  markupBps: BillingRates["markupBps"],
) {
  const { seconds = 0, inputTokens = 0, cachedTokens = 0, outputTokens = 0 } = input;
  ensure(
    Number.isFinite(seconds) &&
      seconds >= 0 &&
      Number.isSafeInteger(markupBps) &&
      markupBps >= 0 &&
      [inputTokens, cachedTokens, outputTokens].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      ) &&
      cachedTokens <= inputTokens,
    "BILLING_USAGE_INVALID",
    422,
  );
  const secondsMicros = Math.round(seconds * 1e6);
  ensure(Number.isSafeInteger(secondsMicros), "BILLING_USAGE_INVALID", 422);
  let numerator = BigInt(secondsMicros) * 50_000n;
  if (input.model) {
    ensure(
      /^gpt-5\.6-luna(?:-\d{4}-\d{2}-\d{2})?$/.test(input.model),
      "BILLING_MODEL_UNPRICED",
      422,
    );
    ensure(
      input.serviceTier === "default" || input.serviceTier === "priority",
      "BILLING_TIER_UNPRICED",
      422,
    );
    const longContext = inputTokens > 272000;
    const priority = input.serviceTier === "priority" ? 2n : 1n;
    const tokenHundredths =
      (BigInt(inputTokens - cachedTokens) * 20n + BigInt(cachedTokens) * 2n) *
        priority *
        (longContext ? 2n : 1n) +
      BigInt(outputTokens) * 60n * priority * (longContext ? 3n : 2n);
    numerator += tokenHundredths * 600_000n;
  }
  const denominator = 60_000_000n * 10000n;
  const result = Number(
    (numerator * BigInt(billingUsdJpy) * BigInt(markupBps) + denominator / 2n) / denominator,
  );
  ensure(Number.isSafeInteger(result), "BILLING_AMOUNT_INVALID", 422);
  return result;
}

export function utcMonthRange(month: string) {
  ensure(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), "INVALID_INPUT", 422);
  const start = Date.parse(`${month}-01T00:00:00Z`);
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { start, end: next.getTime() };
}
