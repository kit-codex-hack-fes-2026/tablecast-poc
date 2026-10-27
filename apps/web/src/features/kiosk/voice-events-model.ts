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
  delegation_id: z.string().nullable().optional(),
  client_event_id: z.string().optional(),
  event: z.discriminatedUnion("type", [
    z.object({ type: z.literal("response.created"), response: z.object({ id: z.string() }) }),
    z.object({
      type: z.enum(["response.output_item.done", "response.output_item.added"]),
      response_id: z.string().optional(),
      item: z.object({
        type: z.string(),
        call_id: z.string().optional(),
        name: z.string().optional(),
        arguments: z.string().optional(),
        summary: z.array(z.object({ text: z.string() })).optional(),
        content: z
          .array(
            z.object({
              type: z.string(),
              annotations: z
                .array(
                  z.object({
                    type: z.string(),
                    url: z.string().optional(),
                    title: z.string().optional(),
                  }),
                )
                .optional(),
            }),
          )
          .optional(),
      }),
    }),
    z.object({
      type: z.literal("response.reasoning_summary_text.delta"),
      response_id: z.string().optional(),
      delta: z.string().max(10000),
    }),
    z.object({
      type: z.enum([
        "response.web_search_call.in_progress",
        "response.web_search_call.searching",
        "response.web_search_call.completed",
      ]),
      response_id: z.string().optional(),
    }),
    z.object({
      type: z.literal("response.output_text.annotation.added"),
      response_id: z.string().optional(),
      annotation: z.object({
        type: z.literal("url_citation"),
        url: z.string().max(2048),
        title: z.string().max(500),
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
  delegationId: string;
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
  locale?: Locale;
  role: "assistant" | "user";
  text: string;
};
