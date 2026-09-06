import { z } from "zod";
import type { Actor } from "../auth";
import { DomainError, ensure } from "../errors";
import {
  voiceSummarySchema,
  type Configuration,
  type ConfigurationIssue,
  type Locale,
  type VoiceListQuery,
  type VoicePage,
} from "../schema";

const voiceMetadataSchema = voiceSummarySchema.extend({ source: z.string().min(1).max(50) });
const providerPageSchema = z.object({
  voices: z.array(voiceMetadataSchema).max(50).default([]),
  nextPageToken: z.string().max(2048).default(""),
});
const voiceOrigin = "https://api.inworld.ai/voices/v1/voices";
async function requestMetadata<T>(
  env: TablecastEnv,
  url: URL,
  schema: z.ZodType<T>,
  allowMissing = false,
): Promise<T | null> {
  ensure(env.TABLECAST_INWORLD_VOICES_API_KEY, "VOICE_CATALOG_NOT_CONFIGURED", 503);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${env.TABLECAST_INWORLD_VOICES_API_KEY}`,
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (allowMissing && response.status === 404) return null;
      throw new Error("音声一覧の取得に失敗しました");
    }
    ensure(response.body, "VOICE_CATALOG_UNAVAILABLE", 503);
    let bytes = 0;
    const limited = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          ensure(bytes <= 256 * 1024, "VOICE_CATALOG_UNAVAILABLE", 503);
          controller.enqueue(chunk);
        },
      }),
    );
    return schema.parse(await new Response(limited).json());
  } catch {
    // providerの本文・headers・例外をHTTP/MCP応答や一般ログへ渡さない。
    throw new DomainError("VOICE_CATALOG_UNAVAILABLE", 503, "VOICE_CATALOG_UNAVAILABLE");
  }
}
function matchesLanguage(langCode: string, locale: Locale) {
  return langCode.split(/[-_]/)[0]?.toLowerCase() === locale;
}
export async function listVoices(
  env: TablecastEnv,
  actor: Actor,
  input: VoiceListQuery,
): Promise<VoicePage> {
  ensure(actor.kind === "staff" || actor.kind === "mcp", "STAFF_REQUIRED", 403);
  const url = new URL(voiceOrigin);
  url.searchParams.set("filter", `source = "SYSTEM" AND lang_code = "${input.locale}"`);
  url.searchParams.set("orderBy", "display_name asc");
  url.searchParams.set("pageSize", "50");
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
  const page = await requestMetadata(env, url, providerPageSchema);
  ensure(page, "VOICE_CATALOG_UNAVAILABLE", 503);
  const ids = new Set<string>();
  return {
    voices: page.voices
      .filter((voice) => {
        if (
          voice.source !== "SYSTEM" ||
          !matchesLanguage(voice.langCode, input.locale) ||
          ids.has(voice.voiceId)
        )
          return false;
        ids.add(voice.voiceId);
        return true;
      })
      .map(({ voiceId, displayName, langCode }) => ({ voiceId, displayName, langCode })),
    nextPageToken: page.nextPageToken || null,
  };
}
export async function voiceConfigurationErrors(
  env: TablecastEnv,
  configuration: Configuration,
  published: Configuration,
): Promise<ConfigurationIssue[]> {
  const results = await Promise.all(
    (["ja", "en"] as const).map(async (locale): Promise<ConfigurationIssue[]> => {
      const voiceId = configuration.cast.voice[locale];
      if (voiceId === null || voiceId === published.cast.voice[locale]) return [];
      const voice = await requestMetadata(
        env,
        new URL(`${voiceOrigin}/${encodeURIComponent(voiceId)}`),
        voiceMetadataSchema,
        true,
      );
      const path = ["cast", "voice", locale];
      if (!voice) return [{ code: "VOICE_NOT_FOUND", path, params: { voiceId } }];
      ensure(voice.voiceId === voiceId, "VOICE_CATALOG_UNAVAILABLE", 503);
      if (voice.source !== "SYSTEM")
        return [{ code: "VOICE_NOT_STANDARD", path, params: { voiceId } }];
      if (!matchesLanguage(voice.langCode, locale))
        return [
          {
            code: "VOICE_LANGUAGE_MISMATCH",
            path,
            params: { voiceId, locale, langCode: voice.langCode },
          },
        ];
      return [];
    }),
  );
  return results.flat();
}
