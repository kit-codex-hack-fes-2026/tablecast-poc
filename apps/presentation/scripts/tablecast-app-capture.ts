import { z } from "zod";
import type { Page } from "@playwright/test";

export const tablecastVoiceEvents = z.array(
  z.object({
    kind: z.string(),
    createdAt: z.number(),
    data: z.object({ turnId: z.string().optional(), interrupted: z.boolean().optional() }),
  }),
);

// 一つの入力音声が複数ターンに分割されても、最後の発話への応答を待つ。
export function tablecastResponseComplete(
  events: z.infer<typeof tablecastVoiceEvents>,
  inputStartedAt: number,
) {
  const turn = events.findLast(
    (event) => event.kind === "voice.user" && event.createdAt >= inputStartedAt,
  )?.data.turnId;
  if (!turn) return false;
  const response = events.findLast(
    (event) => event.kind === "voice.assistant" && event.data.turnId === turn,
  );
  return !!response && !response.data.interrupted;
}

// TableCastの業務状態だけを所有する。別アプリではそのアプリの状態待ちを渡す。
export async function waitForTablecastState(page: Page, value: string) {
  const state = z
    .enum(["cart-ready", "order-submitted", "confirmation-read", "voice-stopped"])
    .parse(value);
  const deadline = Date.now() + 60000;
  while (true) {
    const input: unknown = await page.evaluate(async () => {
      const response = await fetch("/api/table");
      if (!response.ok) throw new Error("撮影状態を取得できません");
      const body: unknown = await response.json();
      return body;
    });
    const table = z
      .object({
        orders: z.array(z.unknown()),
        cart: z.object({ lines: z.array(z.unknown()) }),
        snapshot: z.object({ status: z.string() }).nullable(),
        voiceState: z.string(),
      })
      .parse(input);
    const ready =
      state === "order-submitted"
        ? table.orders.length > 0 && table.cart.lines.length === 0
        : state === "confirmation-read"
          ? table.snapshot?.status === "read"
          : state === "voice-stopped"
            ? table.voiceState === "stopped"
            : table.cart.lines.length > 0;
    if (ready) return;
    if (Date.now() > deadline) throw new Error(`撮影に必要な状態になりません: ${state}`);
    await page.waitForTimeout(250);
  }
}

export function tablecastCaptureOrigin() {
  const url = new URL(
    process.env.TABLECAST_CAPTURE_ORIGIN ?? "http://main.tablecast-poc.container.localhost:3000",
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("撮影先は資格情報・パスのないHTTP originを指定してください");
  return url.origin;
}

export function tablecastHostArguments(origin = tablecastCaptureOrigin()) {
  const host = new URL(origin).hostname;
  return host.endsWith(".container.localhost")
    ? [`--host-resolver-rules=MAP ${host} 127.0.0.1`]
    : [];
}
