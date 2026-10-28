import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { tableEndpoint } from "../../lib/api";
import { apiFetch } from "../../lib/api-fetch";
import { VoiceObservations } from "./voice-observations";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("重複したresponseを一度だけbatch送信しusageと完了までの区間を保つ", async () => {
  const fetch = vi.mocked(apiFetch).mockResolvedValue(Response.json({ ok: true }));
  vi.useFakeTimers();
  const observations = new VoiceObservations(tableEndpoint.client, "tablecast-live", true);
  observations.receive({
    type: "response.event",
    delegation_id: "tablecast-delegation",
    event: { type: "response.created", response: { id: "tablecast-response" } },
  });
  vi.advanceTimersByTime(250);
  const event = {
    type: "response.event",
    delegation_id: "tablecast-delegation",
    event: {
      type: "response.completed",
      response: {
        id: "tablecast-response",
        model: "gpt-6.1-terra",
        usage: { input_tokens: 10, output_tokens: 2 },
        output: [{ content: [{ type: "output_text", text: "回答" }] }],
      },
    },
  };
  observations.receive(event);
  observations.receive(event);
  await observations.flush();
  expect(fetch).toHaveBeenCalledTimes(1);
  const encoded = z.string().parse(fetch.mock.calls[0]?.[1]?.body);
  const body = z
    .object({
      events: z.array(
        z.object({
          content: z.string(),
          responseId: z.string(),
          delegationId: z.string(),
          usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
          startedAt: z.number(),
          endedAt: z.number(),
        }),
      ),
    })
    .parse(JSON.parse(encoded));
  expect(body.events).toHaveLength(1);
  expect(body.events[0]).toMatchObject({
    content: "回答",
    responseId: "tablecast-response",
    delegationId: "tablecast-delegation",
    usage: { input_tokens: 10, output_tokens: 2 },
  });
  expect((body.events[0]?.endedAt ?? 0) - (body.events[0]?.startedAt ?? 0)).toBe(250);
  observations.cancel();
});

it("本文停止・会員切替・送信障害が音声処理へ伝わらず古いbatchを残さない", async () => {
  const fetch = vi.mocked(apiFetch).mockRejectedValue(new Error("collector unavailable"));
  const observations = new VoiceObservations(tableEndpoint.client, "tablecast-live", false);
  observations.append({
    eventId: "one",
    kind: "transcript",
    startedAt: 1,
    endedAt: 1,
    content: "保存しない会話",
  });
  await expect(observations.flush()).resolves.toBeUndefined();
  expect(z.string().parse(fetch.mock.calls[0]?.[1]?.body)).not.toContain("保存しない会話");
  observations.append({ eventId: "two", kind: "transcript", startedAt: 1, endedAt: 1 });
  observations.cancel();
  await observations.flush();
  expect(fetch).toHaveBeenCalledTimes(1);
});
