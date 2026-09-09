import { DomainError } from "../../platform/errors";
export type VoiceDiagnostics = {
  traceId: string;
  releaseSha: string;
  storeId?: string;
  tableSessionId?: string;
  voiceSessionId?: string;
  turnId?: string;
  runId?: string;
};

export type VoicePhase =
  | "accepted"
  | "generated"
  | "rejected"
  | "interrupted"
  | "failed"
  | "skipped";

export const diagnosticCodes = new Set([
  "INVALID_INPUT",
  "VOICE_UNAUTHORIZED",
  "VOICE_SESSION_STALE",
  "VOICE_LOCALE_STALE",
  "PROACTIVE_TURN_STALE",
  "PROACTIVE_SPEAKER_FORBIDDEN",
  "USER_TURN_REQUIRED",
  "VOICE_NOT_CONFIGURED",
  "VOICE_MODEL_FAILED",
  "VOICE_CANCELLED",
]);

export function voiceErrorCode(error: unknown) {
  return error instanceof DomainError && diagnosticCodes.has(error.code)
    ? error.code
    : "VOICE_INTERNAL_ERROR";
}

export function logVoiceTurn(diagnostics: VoiceDiagnostics, phase: VoicePhase, code?: string) {
  console.info(
    JSON.stringify({
      event: "tablecast.voice_turn",
      operation: "turn",
      phase,
      traceId: diagnostics.traceId,
      releaseSha: diagnostics.releaseSha,
      storeId: diagnostics.storeId,
      tableSessionId: diagnostics.tableSessionId,
      voiceSessionId: diagnostics.voiceSessionId,
      turnId: diagnostics.turnId,
      runId: diagnostics.runId,
      code,
    }),
  );
}
