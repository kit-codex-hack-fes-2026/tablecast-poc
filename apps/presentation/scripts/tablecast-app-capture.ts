import { z } from "zod";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { captureEvents } from "./tablecast-capture-types.ts";
import { repositoryRoot } from "./tablecast-source.ts";

export function tablecastCaptureStorageState(role: "guest" | "staff" | "admin") {
  const variables = {
    guest: "TABLECAST_CAPTURE_STORAGE_STATE_GUEST",
    staff: "TABLECAST_CAPTURE_STORAGE_STATE_STAFF",
    admin: "TABLECAST_CAPTURE_STORAGE_STATE_ADMIN",
  } as const;
  const variable = variables[role];
  const value = process.env[variable];
  if (!value?.trim()) throw new Error(`${variable}に役割ごとの認証状態を指定してください`);
  return resolve(repositoryRoot, value);
}

// 店員収録には今回の客側テイクを明示し、過去の合成来店へ接続しない。
export async function readTablecastGuestCapture() {
  const file = process.env.TABLECAST_GUEST_CAPTURE_EVENTS;
  if (!file?.trim())
    throw new Error(
      "TABLECAST_GUEST_CAPTURE_EVENTSに今回の客側tablecast-events.jsonを指定してください",
    );
  const capture = captureEvents.parse(
    JSON.parse(await readFile(resolve(import.meta.dirname, "../../..", file), "utf8")),
  );
  if (!capture.result?.sessionId || !capture.result.orders[0]?.id)
    throw new Error("確定注文を含む客側収録の結果が必要です");
  return capture;
}

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
    const ready = {
      "cart-ready": table.cart.lines.length > 0,
      "order-submitted": table.orders.length > 0 && table.cart.lines.length === 0,
      "confirmation-read": table.snapshot?.status === "read",
      "voice-stopped": table.voiceState === "stopped",
    } satisfies Record<typeof state, boolean>;
    if (ready[state]) return;
    if (Date.now() > deadline) throw new Error(`撮影に必要な状態になりません: ${state}`);
    await page.waitForTimeout(250);
  }
}

export function tablecastCaptureOrigin(
  value = process.env.TABLECAST_CAPTURE_ORIGIN ??
    "http://main.tablecast-poc.container.localhost:3000",
) {
  const url = new URL(value);
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
