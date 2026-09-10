import { z } from "zod";
import { DomainError, ensure } from "../../platform/errors";
import type { Locale } from "../../platform/model";
import type { Actor } from "../auth/model";
import { type Configuration, type ConfigurationIssue } from "../configuration/model";
import { voiceSummarySchema, type VoiceListQuery, type VoicePage } from "./model";
const voiceMetadataSchema = voiceSummarySchema.extend({ source: z.string().min(1).max(50) });
const providerPageSchema = z.object({
  voices: z.array(voiceMetadataSchema).max(50).default([]),
  nextPageToken: z.string().max(2048).default(""),
});
const voiceOrigin = "https://api.inworld.ai/voices/v1/voices";
async function requestPage(
  env: TablecastEnv,
  filter: string,
  pageToken?: string,
  signal = AbortSignal.timeout(5000),
) {
  ensure(env.TABLECAST_INWORLD_VOICES_API_KEY, "VOICE_CATALOG_NOT_CONFIGURED", 503);
  const url = new URL(voiceOrigin);
  url.searchParams.set("filter", filter);
  url.searchParams.set("orderBy", "display_name asc");
  url.searchParams.set("pageSize", "50");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  try {
    signal.throwIfAborted();
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${env.TABLECAST_INWORLD_VOICES_API_KEY}`,
        Accept: "application/json",
      },
      redirect: "manual",
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
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
    return providerPageSchema.parse(await new Response(limited).json());
  } catch (error) {
    // causeは診断境界で型と位置に制限し、provider本文を応答へ返さない。
    throw new DomainError(
      "VOICE_CATALOG_UNAVAILABLE",
      503,
      "VOICE_CATALOG_UNAVAILABLE",
      undefined,
      { cause: error },
    );
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
  const page = await requestPage(
    env,
    `source = "SYSTEM" AND lang_code = "${input.locale}"`,
    input.pageToken,
  );
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
  const changed = (["ja", "en"] as const).flatMap((locale) => {
    const voiceId = configuration.cast.voice[locale];
    return voiceId === null || voiceId === published.cast.voice[locale]
      ? []
      : [{ locale, voiceId }];
  });
  if (!changed.length) return [];
  const missing = new Set(changed.map(({ voiceId }) => voiceId));
  const voices = new Map<string, z.infer<typeof voiceMetadataSchema>>();
  const tokens = new Set<string>([""]);
  const signal = AbortSignal.timeout(5000);
  let pageToken = "";
  for (;;) {
    // 標準音声は単体GETでは取得できない。全言語の一覧を共有し、走査は40ページ/5秒で打ち切る。
    ensure(tokens.size <= 40, "VOICE_CATALOG_UNAVAILABLE", 503);
    const page = await requestPage(env, 'source = "SYSTEM"', pageToken, signal);
    for (const voice of page.voices)
      if (missing.delete(voice.voiceId)) voices.set(voice.voiceId, voice);
    if (!missing.size || !page.nextPageToken) break;
    ensure(!tokens.has(page.nextPageToken), "VOICE_CATALOG_UNAVAILABLE", 503);
    pageToken = page.nextPageToken;
    tokens.add(pageToken);
  }
  return changed.flatMap(({ locale, voiceId }): ConfigurationIssue[] => {
    const voice = voices.get(voiceId);
    const path = ["cast", "voice", locale];
    if (!voice) return [{ code: "VOICE_NOT_FOUND", path, params: { voiceId } }];
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
  });
}
