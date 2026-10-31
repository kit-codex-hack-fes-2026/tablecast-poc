import type { BillingRates } from "./model";
import { ensure } from "../../platform/errors";

export const billingPricingVersion = "openai-2026-10-28";
export const billingPricingVersions = [
  "openai-2026-10-18",
  "openai-2026-10-21",
  billingPricingVersion,
];
export const billingUsdJpy = 160;
// 百万分の一円で保存する。整数の有理数計算で、累積値の差分を料金にする。
export function usageCharge(
  input: {
    cachedTokens?: number;
    inputTokens?: number;
    model?: string;
    outputTokens?: number;
    seconds?: number;
    serviceTier?: null | string;
  },
  markupBps: BillingRates["markupBps"],
  pricingVersion = billingPricingVersion,
) {
  ensure(billingPricingVersions.includes(pricingVersion), "BILLING_VERSION_UNAVAILABLE", 503);
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
    const luna6 =
      pricingVersion !== "openai-2026-10-18" &&
      /^gpt-6-luna(?:-\d{4}-\d{2}-\d{2})?$/.test(input.model);
    const terra =
      pricingVersion === billingPricingVersion &&
      /^gpt-6\.1-terra(?:-\d{4}-\d{2}-\d{2})?$/.test(input.model);
    ensure(
      terra || luna6 || /^gpt-5\.6-luna(?:-\d{4}-\d{2}-\d{2})?$/.test(input.model),
      "BILLING_MODEL_UNPRICED",
      422,
    );
    ensure(
      input.serviceTier === "default" ||
        input.serviceTier === "priority" ||
        ((luna6 || terra) && input.serviceTier === "fast"),
      "BILLING_TIER_UNPRICED",
      422,
    );
    const longContext = inputTokens > 272000;
    const priority = input.serviceTier === "default" ? 1n : 2n;
    // 百分の一USD / 百万token。旧料金版と旧モデルの単価は維持する。
    const inputRate = terra ? 100n : luna6 ? 10n : 20n;
    const cachedRate = terra ? 5n : luna6 ? 1n : 2n;
    const outputRate = terra ? 250n : luna6 ? 25n : 60n;
    const tokenHundredths =
      (BigInt(inputTokens - cachedTokens) * inputRate + BigInt(cachedTokens) * cachedRate) *
        priority *
        (longContext ? 2n : 1n) +
      BigInt(outputTokens) * outputRate * priority * (longContext ? 3n : 2n);
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
