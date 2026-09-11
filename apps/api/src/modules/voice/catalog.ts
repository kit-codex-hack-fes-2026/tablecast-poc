import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import type { Configuration, ConfigurationIssue } from "../configuration/model";
import type { VoiceListQuery, VoicePage } from "./model";

// GPT-Liveの標準音声。既存のInworld設定は保存したままMarinで接続する。
const voices = ["marin", "cedar"] as const;
export function liveVoice(value: string | null): string {
  return voices.find((voice) => voice === value) ?? "marin";
}

export async function listVoices(
  _env: TablecastEnv,
  actor: Actor,
  input: VoiceListQuery,
): Promise<VoicePage> {
  ensure(actor.kind === "staff" || actor.kind === "mcp", "STAFF_REQUIRED", 403);
  return {
    voices: voices.map((voiceId) => ({
      voiceId,
      displayName: voiceId === "marin" ? "Marin" : "Cedar",
      langCode: input.locale,
    })),
    nextPageToken: null,
  };
}

export async function voiceConfigurationErrors(
  _env: TablecastEnv,
  configuration: Configuration,
  published: Configuration,
): Promise<ConfigurationIssue[]> {
  return (["ja", "en"] as const).flatMap((locale): ConfigurationIssue[] => {
    const voiceId = configuration.cast.voice[locale];
    if (
      voiceId === null ||
      voiceId === published.cast.voice[locale] ||
      voices.some((voice) => voice === voiceId)
    )
      return [];
    return [{ code: "VOICE_NOT_FOUND", path: ["cast", "voice", locale], params: { voiceId } }];
  });
}
