import type { BrowserContext, BrowserContextOptions } from "@playwright/test";
import { test as base } from "./support/test";

type MemberDevice = "first" | "pwa" | "second" | "ssr" | "tablet";
type MemberPhase =
  | "complete"
  | "first-registration"
  | "history"
  | "leave"
  | "pwa-sign-in"
  | "qr"
  | "return"
  | "second-registration"
  | "setup"
  | "ssr-coupons";
export const test = base.extend<{
  members: {
    context: (name: MemberDevice, options: BrowserContextOptions) => Promise<BrowserContext>;
    phase: (name: MemberPhase) => void;
  };
}>({
  members: async ({ browser }, use, testInfo) => {
    const contexts: { context: BrowserContext; name: MemberDevice }[] = [];
    const started = performance.now();
    let records = 0;
    const record = (phase: string, device?: MemberDevice, closeMs?: number) => {
      if (records++ >= 64) return;
      console.info(
        JSON.stringify({
          scope: "tablecast-member-lifecycle",
          phase,
          device,
          elapsedMs: Math.round(performance.now() - started),
          closeMs,
          status: testInfo.status,
        }),
      );
    };
    await use({
      context: async (name, options) => {
        const context = await browser.newContext(options);
        contexts.push({ context, name });
        return context;
      },
      phase: (name) => record(name),
    });
    record("body-finished");
    const errors: unknown[] = [];
    // 本体とは別の標準teardown枠で順に閉じ、後片付けの失敗もreporterへ渡す。
    for (const { context, name } of contexts.toReversed()) {
      const closing = performance.now();
      record("close-start", name);
      try {
        await context.close();
        record("close-complete", name, Math.round(performance.now() - closing));
      } catch (error) {
        record("close-failed", name, Math.round(performance.now() - closing));
        errors.push(error);
      }
    }
    record("cleanup-finished");
    if (errors.length) throw new AggregateError(errors, "会員E2Eのcontext終了に失敗しました。");
  },
});
