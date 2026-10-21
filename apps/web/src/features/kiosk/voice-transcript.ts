import type { z } from "zod";
import type { VoiceRuntime } from "./voice-runtime";
import { parseResponse } from "../../lib/api";
import { type Caption, type transcriptEvent } from "./voice-events-model";
export function receiveCaption(
  runtime: VoiceRuntime,
  event: z.infer<typeof transcriptEvent>,
  attempt: number,
) {
  if (runtime.transcriptEvents.has(event.event_id) || event.end_ms < event.start_ms || !event.delta)
    return;
  runtime.transcriptEvents.add(event.event_id);
  const role = event.type === "session.input_transcript.delta" ? "user" : "assistant";
  // 字幕のまとまりは表示だけに使い、委任開始や業務の中断条件には使わない。
  let caption = runtime.captions.findLast(
    (row) =>
      row.message.role === role &&
      !row.message.interrupted &&
      row.message.text.length + event.delta.length <= 10000 &&
      event.start_ms <= row.end + 1500 &&
      event.end_ms >= row.start - 1500,
  );
  if (!caption) {
    const id = crypto.randomUUID();
    caption = {
      message: {
        id,
        turnId: id,
        role,
        locale: runtime.locale,
        text: "",
        final: false,
        createdAt: Date.now(),
      },
      start: event.start_ms,
      end: event.end_ms,
      fragments: [],
    };
    runtime.captions.push(caption);
    if (runtime.captions.length > 100) {
      const oldest = runtime.captions.shift();
      if (oldest && !oldest.message.final) runtime.finishCaption(oldest, false);
    }
  }
  clearTimeout(caption.timer);
  caption.fragments.push({ text: event.delta, start: event.start_ms, end: event.end_ms });
  caption.start = Math.min(caption.start, event.start_ms);
  caption.end = Math.max(caption.end, event.end_ms);
  caption.message = {
    ...caption.message,
    text: caption.fragments
      .toSorted((a, b) => a.start - b.start)
      .map((part) => part.text)
      .join(""),
    final: false,
  };
  const current = caption;
  caption.timer = setTimeout(() => {
    if (!runtime.current(attempt)) return;
    runtime.finishCaption(current, false);
    runtime.emit({
      messages: runtime.captions.map((row) => row.message),
      status: runtime.delegation ? "thinking" : "listening",
    });
    runtime.scheduleSave();
  }, 1500);
  runtime.emit({
    messages: runtime.captions.map((row) => row.message),
    status: role === "assistant" ? "speaking" : "listening",
  });
  runtime.scheduleProactive(attempt);
}

export function finishCaption(runtime: VoiceRuntime, caption: Caption, interrupted: boolean) {
  clearTimeout(caption.timer);
  caption.message = { ...caption.message, final: true, interrupted };
  runtime.pendingCaptions.set(caption.message.id, {
    itemId: caption.message.id,
    role: caption.message.role,
    text: caption.message.text,
    interrupted,
  });
}

export function scheduleSave(runtime: VoiceRuntime) {
  if (runtime.saveTimer || !runtime.sessionId) return;
  runtime.saveTimer = setTimeout(() => {
    runtime.saveTimer = undefined;
    if (runtime.sessionId)
      void runtime.saveCaptions(runtime.sessionId).catch(() => runtime.onSync());
  }, 1500);
}

export async function saveCaptions(runtime: VoiceRuntime, sessionId: string): Promise<void> {
  if (runtime.saving) await runtime.saving;
  if (!runtime.pendingCaptions.size) return;
  const items = [...runtime.pendingCaptions.values()].slice(0, 20);
  for (const item of items) runtime.pendingCaptions.delete(item.itemId);
  runtime.saving = parseResponse(
    runtime.client.voice.conversation.$post(
      { json: { voiceSessionId: sessionId, items } },
      { init: { signal: AbortSignal.timeout(5000) } },
    ),
  ).then(() => runtime.onSync());
  try {
    await runtime.saving;
  } catch (error) {
    for (const item of items)
      if (!runtime.pendingCaptions.has(item.itemId)) runtime.pendingCaptions.set(item.itemId, item);
    throw error;
  } finally {
    runtime.saving = undefined;
  }
  if (runtime.pendingCaptions.size) await runtime.saveCaptions(sessionId);
}
