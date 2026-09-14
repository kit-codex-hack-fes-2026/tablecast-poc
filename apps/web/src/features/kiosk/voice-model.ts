import type { Locale } from "@tablecast/api/schema";
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
export type MicrophoneError = "permission" | "empty" | "disconnected" | "failed" | "unsupported";
export type MicrophoneView = {
  devices: { deviceId: string; label: string }[];
  selectedId: string;
  activeLabel?: string;
  loading?: boolean;
  switching?: boolean;
  permissionRequired?: boolean;
  limited?: boolean;
  error?: MicrophoneError;
};
export const initialMicrophone: MicrophoneView = { devices: [], selectedId: "default" };
export type VoiceView = {
  microphone?: MicrophoneView;
  status: VoiceStatus;
  error?: "permission" | "unconfigured" | "connection" | "active";
  interim?: string;
  messages?: LiveMessage[];
  inputTrack?: MediaStreamTrack;
  outputTrack?: MediaStreamTrack;
};
