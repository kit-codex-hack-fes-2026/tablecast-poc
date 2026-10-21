import type { TableEvent } from "@tablecast/api/schema";
import type { VoiceView } from "./voice-model";
export type ConversationLine = {
  createdAt: number;
  displayIncomplete?: boolean;
  id: string;
  interrupted: boolean;
  live?: boolean;
  locale: "en" | "ja";
  rawText?: string;
  role: "assistant" | "user";
  speaker?: string;
  streamId?: string;
  synthetic?: boolean;
  text: string;
  turnId?: string;
};

export function conversationLines(events: TableEvent[]): ConversationLine[] {
  return events.flatMap((event) => {
    const data = event.data;
    if (
      (data.role !== "user" && data.role !== "assistant") ||
      typeof data.text !== "string" ||
      (data.locale !== "ja" && data.locale !== "en")
    )
      return [];
    const speaker = data.speaker && typeof data.speaker === "object" ? data.speaker : undefined;
    return [
      {
        id: String(event.cursor),
        role: data.role,
        text: data.text,
        locale: data.locale,
        createdAt: event.createdAt,
        interrupted: data.interrupted === true,
        synthetic: typeof data.source === "string" && data.source.startsWith("synthetic-"),
        turnId: typeof data.turnId === "string" ? data.turnId : undefined,
        speaker:
          speaker && "id" in speaker && typeof speaker.id === "string" ? speaker.id : undefined,
        streamId:
          speaker && "streamId" in speaker && typeof speaker.streamId === "string"
            ? speaker.streamId
            : undefined,
      },
    ];
  });
}

export function mergeConversation(lines: ConversationLine[], view: VoiceView, locale: "en" | "ja") {
  const saved = lines.filter((line) => line.text.trim());
  const merged: ConversationLine[] = [];
  for (const message of view.messages ?? []) {
    if (!message.text && (message.role === "user" || message.final)) continue;
    const index = saved.findIndex(
      (line) =>
        line.role === message.role &&
        (message.turnId
          ? line.turnId === message.turnId
          : line.text === message.text && Math.abs(line.createdAt - message.createdAt) < 15000),
    );
    if (index >= 0) {
      const [line] = saved.splice(index, 1);
      if (line)
        merged.push({
          ...line,
          // 保存時刻とcursorへ切り替えると、表示中の吹き出しが後発の発話を追い越す。
          id: `live-${message.role}-${message.id}`,
          createdAt: message.createdAt,
          text:
            line.interrupted || line.text.length >= message.text.length ? line.text : message.text,
          interrupted: line.interrupted || message.interrupted === true,
          rawText: message.rawText,
          live: !message.final && !line.interrupted,
          displayIncomplete: message.displayIncomplete,
        });
    } else
      merged.push({
        ...message,
        id: `live-${message.role}-${message.id}`,
        locale: message.locale ?? locale,
        interrupted: message.interrupted ?? false,
        live: !message.final,
      });
  }
  return [...saved, ...merged].toSorted((a, b) => a.createdAt - b.createdAt);
}

export function voiceOperationState(events: TableEvent[]) {
  const tools = new Map<string, TableEvent>();
  for (const event of events)
    if (event.kind === "voice.tool" && typeof event.data.toolCallId === "string")
      tools.set(event.data.toolCallId, event);
  const turns = new Map<string, TableEvent>();
  for (const event of events)
    if (event.kind === "voice.turn" && typeof event.data.turnId === "string")
      turns.set(event.data.turnId, event);
  const failedTurns = new Set(
    events.flatMap((event) => (event.kind === "voice.failed" ? [event.data.turnId] : [])),
  );
  for (const event of turns.values())
    if (event.data.status === "failed") failedTurns.add(event.data.turnId);
  const latestBusinessTurn =
    [...events]
      .toReversed()
      .find((event) => event.kind === "voice.turn" && event.data.status === "started")?.data
      .turnId ??
    [...events]
      .toReversed()
      .find((event) => event.kind === "voice.tool" || event.kind === "voice.failed")?.data.turnId;
  const running = [...tools.values()].filter((event) => {
    const turn = typeof event.data.turnId === "string" ? turns.get(event.data.turnId) : undefined;
    return (
      (event.data.state === "requested" || event.data.state === "running") &&
      !failedTurns.has(event.data.turnId) &&
      (!turn || turn.data.status === "started")
    );
  });
  return { tools, turns, failedTurns, latestBusinessTurn, running };
}
