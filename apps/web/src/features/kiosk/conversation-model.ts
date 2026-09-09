import type { TableEvent } from "@tablecast/api/schema";
import type { VoiceView } from "./voice-model";
export type ConversationLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
  locale: "ja" | "en";
  createdAt: number;
  interrupted: boolean;
  speaker?: string;
  streamId?: string;
  synthetic?: boolean;
  turnId?: string;
  rawText?: string;
  live?: boolean;
  displayIncomplete?: boolean;
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

export function mergeConversation(lines: ConversationLine[], view: VoiceView, locale: "ja" | "en") {
  const merged = lines.filter((line) => line.text.trim());
  for (const message of view.messages ?? []) {
    if (!message.text && (message.role === "user" || message.final)) continue;
    const index = merged.findIndex(
      (line) =>
        line.role === message.role &&
        (message.turnId
          ? line.turnId === message.turnId
          : line.text === message.text && Math.abs(line.createdAt - message.createdAt) < 15000),
    );
    if (index >= 0) {
      const line = merged[index];
      if (line) merged[index] = { ...line, rawText: message.rawText };
    } else
      merged.push({
        ...message,
        id: `live-${message.role}-${message.id}`,
        locale: message.locale ?? locale,
        interrupted: message.interrupted ?? false,
        live: !message.final,
      });
  }
  return merged.toSorted((a, b) => a.createdAt - b.createdAt);
}
