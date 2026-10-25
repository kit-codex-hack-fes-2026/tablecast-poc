import type { Locale } from "@tablecast/api/schema";
import { z } from "zod";
import { type LiveMessage } from "./voice-model";

export const transcriptEvent = z.object({
  type: z.enum(["session.input_transcript.delta", "session.output_transcript.delta"]),
  event_id: z.string(),
  delta: z.string().max(10000),
  start_ms: z.number().nonnegative(),
  end_ms: z.number().nonnegative(),
});

export const delegationEvent = z.object({
  type: z.literal("session.delegation.created"),
  delegation: z.object({ id: z.string().max(200), target: z.literal("responses") }),
});

export const responseEnvelope = z.object({
  type: z.literal("response.event"),
  delegation_id: z.string(),
  event: z.discriminatedUnion("type", [
    z.object({ type: z.literal("response.created"), response: z.object({ id: z.string() }) }),
    z.object({
      type: z.literal("response.output_item.done"),
      response_id: z.string().optional(),
      item: z.object({
        type: z.string(),
        call_id: z.string().optional(),
        name: z.string().optional(),
        arguments: z.string().optional(),
      }),
    }),
    z.object({
      type: z.enum(["response.completed", "response.failed", "response.incomplete"]),
      response: z.object({ id: z.string() }),
    }),
  ]),
});

export type PendingResponse = {
  calls: { arguments: string; callId: string; name: string }[];
  handled: boolean;
  locale: Locale;
};

export type Caption = {
  end: number;
  fragments: { end: number; start: number; text: string }[];
  message: LiveMessage;
  start: number;
  timer?: ReturnType<typeof setTimeout>;
};

export type SavedCaption = {
  interrupted: boolean;
  itemId: string;
  role: "assistant" | "user";
  text: string;
};
