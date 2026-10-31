import { expect, it } from "vitest";
import { usageCharge, utcMonthRange } from "../src/modules/billing/pricing";

it("Terraの公式単価と長文境界・Fastを新料金版だけへ適用する", () => {
  const usage = {
    model: "gpt-6.1-terra",
    serviceTier: "default",
    inputTokens: 1000,
    cachedTokens: 500,
    outputTokens: 100,
  };
  expect(usageCharge(usage, 10000)).toBe(164000);
  for (const serviceTier of ["priority", "fast"])
    expect(usageCharge({ ...usage, serviceTier }, 15000)).toBe(492000);
  expect(
    usageCharge({ ...usage, inputTokens: 272000, cachedTokens: 0, outputTokens: 0 }, 10000),
  ).toBe(43_520_000);
  expect(usageCharge({ ...usage, inputTokens: 272001, cachedTokens: 0 }, 10000)).toBe(87_160_320);
  for (const version of ["openai-2026-10-18", "openai-2026-10-21"])
    expect(() => usageCharge(usage, 10000, version)).toThrow("BILLING_MODEL_UNPRICED");
  const old = {
    model: "gpt-6-luna",
    serviceTier: "priority",
    inputTokens: 1000,
    cachedTokens: 500,
    outputTokens: 100,
  };
  expect(usageCharge(old, 10000, "openai-2026-10-21")).toBe(33600);
  expect(usageCharge(old, 10000)).toBe(33600);
});

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

it("GPT-6 Lunaのcached input・Fast mode・長文料金を旧Lunaと区別する", () => {
  const input = {
    model: "gpt-6-luna",
    serviceTier: "default",
    inputTokens: 1000,
    cachedTokens: 500,
    outputTokens: 100,
  };
  expect(usageCharge(input, 10000)).toBe(16800);
  for (const serviceTier of ["priority", "fast"]) {
    expect(usageCharge({ ...input, serviceTier }, 15000)).toBe(50400);
  }
  expect(
    usageCharge({ ...input, inputTokens: 272000, cachedTokens: 0, outputTokens: 0 }, 10000),
  ).toBe(4352000);
  expect(
    usageCharge({ ...input, inputTokens: 272001, cachedTokens: 0, outputTokens: 100 }, 10000),
  ).toBe(8716032);
  expect(() => usageCharge({ ...input, serviceTier: "flex" }, 10000)).toThrow(
    "BILLING_TIER_UNPRICED",
  );
});

it("旧料金版の継続精算を保ち、旧版で新モデルや未知の料金版を受け付けない", () => {
  expect(usageCharge({ seconds: 90 }, 10000, "openai-2026-10-18")).toBe(12_000_000);
  expect(
    usageCharge(
      { model: "gpt-5.6-luna", serviceTier: "priority", inputTokens: 1000 },
      10000,
      "openai-2026-10-18",
    ),
  ).toBe(64000);
  expect(() =>
    usageCharge(
      { model: "gpt-6-luna", serviceTier: "priority", inputTokens: 1000 },
      10000,
      "openai-2026-10-18",
    ),
  ).toThrow("BILLING_MODEL_UNPRICED");
  expect(() => usageCharge({ seconds: 1 }, 10000, "tablecast-unknown-version")).toThrow(
    "BILLING_VERSION_UNAVAILABLE",
  );
});
