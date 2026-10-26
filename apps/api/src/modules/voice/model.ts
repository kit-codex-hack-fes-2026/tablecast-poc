import { z } from "zod";
import { id, localeSchema } from "../../platform/model";
import { displayCurrencyContextSchema } from "../currency/model";
export const showProductsSchema = z.object({ productIds: z.array(id).min(1).max(4) }).strict();
export const speechSpeedSchema = z.number().min(0.5).max(1.5).multipleOf(0.1);

export const speechSpeedInputSchema = z.object({ speed: speechSpeedSchema }).strict();

export const voiceToolNameSchema = z.enum([
  "showReference",
  "captureCamera",
  "endConversation",
  "getCatalog",
  "getCustomerContext",
  "getCustomerSuggestions",
  "saveCustomerMemory",
  "getTableState",
  "updateCart",
  "prepareConfirmation",
  "submitOrder",
  "callStaff",
  "setUiSection",
  "setLanguage",
  "setSpeechSpeed",
  "setDisplayCurrency",
  "showProducts",
]);

export const voiceToolEventSchema = z
  .object({
    turnId: id,
    toolCallId: id,
    toolName: voiceToolNameSchema,
    state: z.enum(["requested", "running", "completed", "error"]),
    query: z.string().max(100).optional(),
    errorCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,79}$/)
      .optional(),
  })
  .refine((event) => event.query === undefined || event.toolName === "getCatalog");

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

export const voiceTriggerSchema = z.enum(["user", "proactive", "opening"]);

export type VoiceTrigger = z.infer<typeof voiceTriggerSchema>;

export const voiceTurnSchema = z
  .object({
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
  })
  .strict();

export const toolSchema = z
  .object({
    voiceSessionId: id,
    turnId: id,
    toolName: voiceToolNameSchema,
    toolCallId: id,
    arguments: z.record(z.string(), z.unknown()),
    displayCurrency: displayCurrencyContextSchema.optional(),
  })
  .strict();

const conversationItemSchema = z
  .object({
    itemId: id,
    locale: localeSchema.optional(),
    role: z.enum(["user", "assistant"]),
    text: z.string().min(1).max(10000),
    interrupted: z.boolean().default(false),
  })
  .strict();

export const voiceStartSchema = z.object({ sdp: z.string().min(1).max(64000) }).strict();

export const voiceDelegationSchema = z
  .object({
    voiceSessionId: id,
    delegationId: id.nullable(),
    locale: localeSchema,
    messages: voiceTurnSchema.shape.messages,
    trigger: voiceTriggerSchema.default("user"),
  })
  .strict();

export const voiceConversationSchema = z
  .object({
    voiceSessionId: id,
    items: z.array(conversationItemSchema).min(1).max(20),
  })
  .strict();

export const voiceSuggestionsSchema = z
  .object({
    voiceSessionId: id,
    locale: localeSchema,
    itemId: id,
    text: z.string().min(1).max(10000),
  })
  .strict();
export const voiceSuggestionsResultSchema = z
  .object({
    suggestions: z.array(z.string().trim().min(1).max(500)).max(3),
  })
  .strict();

export const voiceReferenceSchema = z
  .object({
    url: z.url().max(2048),
    title: z.string().min(1).max(200),
    description: z.string().max(300).optional(),
    imageUrl: z.url().max(2048).optional(),
    faviconUrl: z.url().max(2048).optional(),
  })
  .strict();
export const voiceReferenceEventSchema = z
  .object({ turnId: id, reference: voiceReferenceSchema })
  .strict();
export type VoiceReference = z.infer<typeof voiceReferenceSchema>;
