import { eq } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import { voiceUsageSessions } from "../../db/billing-schema";
import { closeProviderLiveSession } from "../../integrations/openai-live";
import { DomainError } from "../../platform/errors";
import { sessionCredential } from "../billing/credentials";
import { recordVoiceUsage } from "../billing/usage";

export async function closeLiveSession(
  services: ApiServices,
  voiceSessionId: string,
  apiKey?: string,
) {
  const usage = await services.db
    .select({ credentialId: voiceUsageSessions.credentialId })
    .from(voiceUsageSessions)
    .where(eq(voiceUsageSessions.id, voiceSessionId))
    .get();
  if (
    !usage &&
    !apiKey &&
    !services.env.TABLECAST_MODEL_API_KEY &&
    services.env.TABLECAST_ORGANIZATION_AI_ENABLED !== "true"
  )
    return;
  const key = apiKey ?? (await sessionCredential(services, usage?.credentialId ?? null));
  const closed = await closeProviderLiveSession(voiceSessionId, key);
  if (usage && closed) {
    try {
      await recordVoiceUsage(services, voiceSessionId, closed);
    } catch (cause) {
      throw new DomainError(
        "VOICE_USAGE_RECORDING_FAILED",
        503,
        "VOICE_USAGE_RECORDING_FAILED",
        undefined,
        { cause },
      );
    }
  }
}

export async function stopVoiceRoom(services: ApiServices, voiceSessionId: string) {
  await closeLiveSession(services, voiceSessionId);
  return true;
}
