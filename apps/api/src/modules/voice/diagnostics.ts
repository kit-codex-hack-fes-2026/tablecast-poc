export type VoiceDiagnostics = {
  releaseSha: string;
  runId?: string;
  storeId?: string;
  tableSessionId?: string;
  traceId: string;
  turnId?: string;
  voiceSessionId?: string;
};

export type VoicePhase =
  | "accepted"
  | "failed"
  | "generated"
  | "interrupted"
  | "rejected"
  | "skipped";

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
