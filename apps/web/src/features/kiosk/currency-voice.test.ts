import { type DisplayCurrencyContext, displayCurrencyContextSchema } from "@tablecast/api/schema";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiFetch } from "../../lib/api-fetch";
import {
  peer,
  VoiceAudio,
  VoiceMediaStream,
  VoicePeer,
} from "./test-support/voice-transport-fixture";
import { VoiceConnection } from "./voice-connection";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
const connections: VoiceConnection[] = [];
beforeEach(() => {
  VoicePeer.instances = [];
  VoiceAudio.instances = [];
  vi.stubGlobal("RTCPeerConnection", VoicePeer);
  vi.stubGlobal("Audio", VoiceAudio);
  vi.stubGlobal("MediaStream", VoiceMediaStream);
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: async () => new VoiceMediaStream() },
  });
  vi.mocked(apiFetch).mockImplementation(async (input) => {
    const path = input instanceof Request ? input.url : String(input);
    if (path.endsWith("/start"))
      return Response.json({
        voiceSessionId: "live_currency",
        sdp: "tablecast-answer",
        proactive: false,
      });
    if (path.endsWith("/delegations"))
      return Response.json({ kind: "accepted", turnId: "tablecast-turn" });
    return Response.json({ ok: true });
  });
});
afterEach(async () => {
  for (const value of connections.splice(0)) await value.stop();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
function sentEvent(data: string) {
  return z
    .object({
      type: z.string(),
      item: z.object({ call_id: z.string(), output: z.string() }).optional(),
    })
    .parse(JSON.parse(data));
}
function delegate() {
  peer().channel.receive({
    type: "session.delegation.created",
    delegation: { id: "item_tablecast_delegation", target: "responses" },
  });
}
const receive = (event: unknown) =>
  peer().channel.receive({
    type: "response.event",
    delegation_id: "item_tablecast_delegation",
    event,
  });

it("通貨変更を適用した後の設定を次のtoolへ送り、全通貨レートはモデルへ返さない", async () => {
  let context: DisplayCurrencyContext = {
    currency: "USD",
    revision: 0,
    rates: {
      base: "JPY",
      source: "currency-api",
      date: "2026-10-22",
      rates: { USD: 0.0065, AUD: 0.00967 },
    },
  };
  const apply = vi.fn<
    (action: { currency: DisplayCurrencyContext["currency"]; revision: number }) => boolean
  >((action) => {
    context = { ...context, currency: action.currency, revision: context.revision + 1 };
    return true;
  });
  const value = new VoiceConnection(vi.fn<() => void>(), vi.fn<() => void>(), undefined, {
    getContext: () => context,
    apply,
  });
  connections.push(value);
  const fallback = vi.mocked(apiFetch).getMockImplementation();
  if (!fallback) throw new Error("HTTP fixtureが必要です");
  const contexts: DisplayCurrencyContext[] = [];
  vi.mocked(apiFetch).mockImplementation(async (input, options) => {
    const path = input instanceof Request ? input.url : String(input);
    if (!path.endsWith("/tools")) return fallback(input, options);
    const body = z
      .object({ toolName: z.string(), displayCurrency: displayCurrencyContextSchema })
      .parse(JSON.parse(typeof options?.body === "string" ? options.body : "null"));
    contexts.push(body.displayCurrency);
    return Response.json(
      body.toolName === "setDisplayCurrency"
        ? {
            result: { displayCurrency: { currency: "AUD", status: "ready" } },
            displayCurrencyAction: { currency: "AUD", revision: 0 },
          }
        : {
            result: { products: [], displayCurrency: { currency: body.displayCurrency.currency } },
          },
    );
  });
  await value.start("ja");
  delegate();
  receive({ type: "response.created", response: { id: "resp_currency" } });
  for (const [call_id, name] of [
    ["call_currency", "setDisplayCurrency"],
    ["call_price", "getCatalog"],
  ])
    receive({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id,
        name,
        arguments: name === "setDisplayCurrency" ? '{"currency":"AUD"}' : "{}",
      },
    });
  receive({
    type: "response.completed",
    response: { id: "resp_currency", output: [] },
  });
  await vi.waitFor(() =>
    expect(
      peer().channel.send.mock.calls.filter(([data]) => sentEvent(data).type === "response.create"),
    ).toHaveLength(1),
  );
  expect(apply).toHaveBeenCalledExactlyOnceWith({ currency: "AUD", revision: 0 });
  expect(contexts.map((item) => item.currency)).toEqual(["USD", "AUD"]);
  const outputs = peer()
    .channel.send.mock.calls.map(([data]) => sentEvent(data))
    .filter((event) => event.type === "response.item.create")
    .map((event) => event.item?.output);
  expect(outputs).toHaveLength(2);
  expect(outputs.join(" ")).not.toContain("rates");
});
