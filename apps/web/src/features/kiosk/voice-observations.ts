import { voiceObservationSchema } from "@tablecast/api/schema";
import { z } from "zod";
import type { TableClient } from "../../lib/api";

type Observation = z.infer<typeof voiceObservationSchema>;
const response = z.object({
  type: z.literal("response.event"),
  delegation_id: z.string().optional().nullable(),
  event: z.object({
    type: z.string(),
    response_id: z.string().optional(),
    delta: z.string().optional(),
    item: z.object({ type: z.string(), call_id: z.string().optional() }).optional(),
    response: z
      .object({
        id: z.string(),
        model: z.string().optional(),
        usage: voiceObservationSchema.shape.usage,
        output: z
          .array(
            z.object({
              content: z
                .array(z.object({ type: z.string(), text: z.string().optional() }))
                .optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  }),
});

// 保存はbest effort。診断の失敗を音声状態へ返さず、再送による二重計上もしない。
export class VoiceObservations {
  private pending: Observation[] = [];
  private dropped = 0;
  private seen = new Set<string>();
  private started = new Map<
    string,
    { calls: string[]; text: string; time: number; truncated: boolean }
  >();
  private turns = new Map<string, string>();
  private timer?: ReturnType<typeof setTimeout>;
  private sending?: Promise<void>;
  constructor(
    private client: TableClient,
    private sessionId: string,
    private captureContent: boolean,
  ) {}

  append(event: Observation) {
    if (this.seen.has(event.eventId)) return;
    this.seen.add(event.eventId);
    if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value ?? "");
    if (this.pending.length >= 100) {
      this.dropped++;
      return;
    }
    this.pending.push(this.captureContent ? event : { ...event, content: undefined });
    if (this.pending.length >= 20) void this.flush();
    else if (!this.timer) this.timer = setTimeout(() => void this.flush(), 1000);
  }

  receive(raw: unknown, turnId?: string) {
    const parsed = response.safeParse(raw);
    if (!parsed.success) return;
    const envelope = parsed.data;
    const event = envelope.event;
    const id = event.response?.id ?? event.response_id;
    if (!id) return;
    if (event.type === "response.created") {
      if (!this.started.has(id) && this.started.size < 100)
        this.started.set(id, { time: Date.now(), text: "", truncated: false, calls: [] });
      return;
    }
    const started = this.started.get(id);
    if (
      started &&
      event.item?.call_id &&
      !started.calls.includes(event.item.call_id) &&
      started.calls.length < 50
    )
      started.calls.push(event.item.call_id);
    if (event.type === "response.output_text.delta" && started && this.captureContent) {
      const text = started.text + (event.delta ?? "");
      started.truncated ||= text.length > 16000;
      started.text = text.slice(0, 16000);
      return;
    }
    if (
      !event.response ||
      !["response.completed", "response.failed", "response.incomplete"].includes(event.type)
    )
      return;
    const status =
      event.type === "response.completed"
        ? "completed"
        : event.type === "response.failed"
          ? "failed"
          : "incomplete";
    const text = event.response.output
      ?.flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text")
      .map((part) => part.text ?? "")
      .join("\n");
    const now = Date.now();
    this.append({
      eventId: id,
      kind: "response",
      startedAt: started?.time ?? now,
      endedAt: now,
      responseId: id,
      delegationId: envelope.delegation_id ?? undefined,
      turnId:
        turnId ?? (envelope.delegation_id ? this.turns.get(envelope.delegation_id) : undefined),
      toolCallIds: started?.calls,
      model: event.response.model,
      usage: event.response.usage,
      status,
      contentTruncated: started?.truncated === true || (text?.length ?? 0) > 16000,
      content: this.captureContent ? (text || started?.text)?.slice(0, 16000) : undefined,
    });
    this.started.delete(id);
  }

  bindTurn(delegationId: string, turnId: string) {
    if (this.turns.size >= 100) this.turns.delete(this.turns.keys().next().value ?? "");
    this.turns.set(delegationId, turnId);
    for (const event of this.pending)
      if (event.delegationId === delegationId) event.turnId = turnId;
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.sending) {
      await this.sending;
      return this.flush();
    }
    const events: Observation[] = [];
    while (events.length < 20 && this.pending.length) {
      const next = this.pending[0];
      if (!next) break;
      if (
        new TextEncoder().encode(
          JSON.stringify({ voiceSessionId: this.sessionId, events: [...events, next] }),
        ).byteLength >
        240 * 1024
      )
        break;
      events.push(next);
      this.pending.shift();
    }
    if (!events.length) return;
    if (this.dropped && events[0]) {
      events[0].droppedEvents = this.dropped;
      this.dropped = 0;
    }
    this.sending = this.client.voice.observations
      .$post(
        { json: { voiceSessionId: this.sessionId, events } },
        { init: { signal: AbortSignal.timeout(3000) } },
      )
      .then(() => undefined)
      .catch(() => undefined);
    await this.sending;
    this.sending = undefined;
    if (this.pending.length) await this.flush();
  }

  cancel() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = [];
    this.started.clear();
  }
}
