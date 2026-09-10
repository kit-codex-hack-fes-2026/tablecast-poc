import type { Locale } from "@tablecast/api/schema";
import type { LocalAudioTrack, RemoteAudioTrack } from "livekit-client";
export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "stopping"
  | "paused"
  | "error";
export type LiveMessage = {
  id: string;
  role: "user" | "assistant";
  turnId?: string;
  text: string;
  rawText?: string;
  final: boolean;
  interrupted?: boolean;
  createdAt: number;
  speaker?: string;
  streamId?: string;
  locale?: Locale;
  displayIncomplete?: boolean;
};
export type VoiceView = {
  status: VoiceStatus;
  error?: "permission" | "unconfigured" | "connection" | "active";
  interim?: string;
  messages?: LiveMessage[];
  inputTrack?: LocalAudioTrack;
  outputTrack?: RemoteAudioTrack;
};
