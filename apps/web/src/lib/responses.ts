import { configDraftSchema, storeSummarySchema, tableEventSchema } from "@tablecast/api/schema";
import { z } from "zod";

export const storesSchema = z.object({ stores: z.array(storeSummarySchema) });
export const draftsSchema = z.object({ drafts: z.array(configDraftSchema) });
export const eventsSchema = z.object({
  events: z.array(tableEventSchema),
  cursor: z.number().int(),
});
export const voiceCredentialsSchema = z.object({
  voiceSessionId: z.string(),
  token: z.string(),
  url: z.string(),
});
export const pairingCodeSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  expires_in: z.number(),
  interval: z.number(),
});
export const pairingStatusSchema = z.object({ ready: z.boolean() });
