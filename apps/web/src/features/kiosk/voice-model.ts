import type { Locale } from "@tablecast/api/schema";
export type VoiceStatus =
  | "connecting"
  | "error"
  | "idle"
  | "listening"
  | "paused"
  | "speaking"
  | "stopping"
  | "thinking";
export type LiveMessage = {
  createdAt: number;
  displayIncomplete?: boolean;
  final: boolean;
  id: string;
  interrupted?: boolean;
  locale?: Locale;
  rawText?: string;
  role: "assistant" | "user";
  speaker?: string;
  streamId?: string;
  text: string;
  turnId?: string;
};
export type MicrophoneError = "disconnected" | "empty" | "failed" | "permission" | "unsupported";
export type MicrophoneView = {
  activeLabel?: string;
  devices: { deviceId: string; label: string }[];
  error?: MicrophoneError;
  limited?: boolean;
  loading?: boolean;
  permissionRequired?: boolean;
  selectedId: string;
  switching?: boolean;
};
export const initialMicrophone: MicrophoneView = { devices: [], selectedId: "default" };
export type VoiceView = {
  error?: "active" | "connection" | "permission" | "unconfigured";
  inputTrack?: MediaStreamTrack;
  interim?: string;
  messages?: LiveMessage[];
  microphone?: MicrophoneView;
  outputTrack?: MediaStreamTrack;
  status: VoiceStatus;
  suggestions?: string[];
};
