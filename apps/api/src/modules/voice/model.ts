import { z } from "zod";
import { id, localeSchema } from "../../platform/model";
export const showProductsSchema = z.object({ productIds: z.array(id).min(1).max(4) }).strict();
export const speechSpeedSchema = z.number().min(0.5).max(1.5).multipleOf(0.1);

export const speechSpeedInputSchema = z.object({ speed: speechSpeedSchema }).strict();

export const voiceToolNameSchema = z.enum([
  "getCatalog",
  "getTableState",
  "updateCart",
  "prepareConfirmation",
  "submitOrder",
  "callStaff",
  "setUiSection",
  "setLanguage",
  "setSpeechSpeed",
  "showProducts",
]);

export const voiceToolEventSchema = z.object({
  turnId: id,
  toolCallId: id,
  toolName: voiceToolNameSchema,
  state: z.enum(["running", "completed", "error"]),
  errorCode: z.enum(["VOICE_TOOL_FAILED", "VOICE_CANCELLED"]).optional(),
});

export const voiceProductsEventSchema = showProductsSchema.extend({ turnId: id });

export const voiceFailedEventSchema = z.object({
  turnId: id,
  code: z.enum(["VOICE_MODEL_FAILED", "VOICE_INTERNAL_ERROR"]),
});

export const voiceListQuerySchema = z
  .object({ locale: localeSchema, pageToken: z.string().max(2048).optional() })
  .strict();

export const voiceSummarySchema = z.object({
  voiceId: id,
  displayName: z.string().min(1).max(150),
  langCode: z.string().min(2).max(35),
});

export const voicePageSchema = z.object({
  voices: z.array(voiceSummarySchema).max(50),
  nextPageToken: z.string().max(2048).nullable(),
});

export type VoiceSummary = z.infer<typeof voiceSummarySchema>;

export type VoicePage = z.infer<typeof voicePageSchema>;

export type VoiceListQuery = z.infer<typeof voiceListQuerySchema>;

export const voiceTriggerSchema = z.enum(["user", "proactive"]);

export type VoiceTrigger = z.infer<typeof voiceTriggerSchema>;

export const voiceTurnSchema = z
  .object({
    transport: z.enum(["cascade", "realtime", "live"]).default("cascade"),
    turnId: id,
    voiceSessionId: id,
    locale: localeSchema,
    trigger: voiceTriggerSchema.default("user"),
    messages: z
      .array(
        z.discriminatedUnion("role", [
          z.object({ role: z.literal("user"), content: z.string().max(10000) }).strict(),
          z.object({ role: z.literal("assistant"), content: z.string().max(10000) }).strict(),
        ]),
      )
      .max(100),
    speaker: z
      .object({
        id: z.string().nullable(),
        streamId: z.string().max(100),
        words: z
          .array(
            z
              .object({
                text: z.string().max(500),
                speakerId: z.string().nullable(),
                startTime: z.number().nonnegative().nullable(),
                endTime: z.number().nonnegative().nullable(),
              })
              .strict(),
          )
          .max(2000),
      })
      .strict()
      .optional(),
  })
  .strict();

export { id } from "../../platform/model";

export const sessionBody = z.object({ voiceSessionId: id, turnId: id });

export const transcriptSchema = sessionBody.extend({ text: z.string().max(10000) }).strict();

export const toolSchema = sessionBody
  .extend({
    toolName: voiceToolNameSchema,
    toolCallId: id,
    arguments: z.record(z.string(), z.unknown()),
  })
  .strict();

export const playbackSchema = sessionBody
  .extend({ text: z.string().max(10000), interrupted: z.boolean() })
  .strict();

export const conversationItemSchema = z
  .object({
    voiceSessionId: id,
    itemId: id,
    role: z.enum(["user", "assistant"]),
    text: z.string().min(1).max(10000),
    interrupted: z.boolean().default(false),
  })
  .strict();
