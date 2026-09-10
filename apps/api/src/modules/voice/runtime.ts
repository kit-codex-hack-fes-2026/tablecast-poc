import { context, propagation } from "@opentelemetry/api";
import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
  RoomServiceClient,
  ServerError,
  TrackSource,
} from "livekit-server-sdk";
import { ensure } from "../../platform/errors";
export const voiceParticipantIdentity = (voiceSessionId: string) =>
  `tablecast-device-${voiceSessionId}`;

export const voiceRoomName = (env: TablecastEnv, sessionId: string) =>
  `${env.TABLECAST_AGENT_NAME || "tablecast"}-${sessionId}`;

export async function stopVoiceRoom(env: TablecastEnv, voiceSessionId: string) {
  if (
    !env.TABLECAST_LIVEKIT_URL ||
    !env.TABLECAST_LIVEKIT_API_KEY ||
    !env.TABLECAST_LIVEKIT_API_SECRET
  )
    return;
  const service = new RoomServiceClient(
    env.TABLECAST_LIVEKIT_URL,
    env.TABLECAST_LIVEKIT_API_KEY,
    env.TABLECAST_LIVEKIT_API_SECRET,
    { failover: false, requestTimeout: 5 },
  );
  try {
    await service.deleteRoom(voiceRoomName(env, voiceSessionId));
  } catch (error) {
    if (!(error instanceof ServerError && error.code === "not_found"))
      ensure(false, "VOICE_ROOM_STOP_FAILED", 503);
  }
  if (env.TABLECAST_CONTAINERS_ENABLED === "true")
    await env.TABLECAST_VOICE.getByName("tablecast-voice").release(voiceSessionId);
}

export async function issueVoiceToken(env: TablecastEnv, voiceSessionId: string) {
  ensure(
    env.TABLECAST_LIVEKIT_URL &&
      env.TABLECAST_LIVEKIT_API_KEY &&
      env.TABLECAST_LIVEKIT_API_SECRET &&
      env.TABLECAST_VOICE_API_TOKEN &&
      env.TABLECAST_MODEL_API_KEY,
    "VOICE_NOT_CONFIGURED",
    503,
  );
  const roomName = voiceRoomName(env, voiceSessionId);
  const token = new AccessToken(env.TABLECAST_LIVEKIT_API_KEY, env.TABLECAST_LIVEKIT_API_SECRET, {
    identity: voiceParticipantIdentity(voiceSessionId),
    ttl: "5m",
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  const traceContext: Record<string, string> = {};
  propagation.inject(context.active(), traceContext);
  token.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: env.TABLECAST_AGENT_NAME || "tablecast-voice",
        metadata: JSON.stringify({ voiceSessionId, traceContext }),
      }),
    ],
  });
  const jwt = await token.toJwt();
  if (env.TABLECAST_CONTAINERS_ENABLED === "true") {
    try {
      await env.TABLECAST_VOICE.getByName("tablecast-voice").reserve(voiceSessionId);
    } catch {
      ensure(false, "VOICE_RUNTIME_UNAVAILABLE", 503);
    }
  }
  return { url: env.TABLECAST_LIVEKIT_URL, token: jwt, voiceSessionId };
}
