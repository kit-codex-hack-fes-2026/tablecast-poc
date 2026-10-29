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

export const voiceStatusLabels = {
  idle: "kiosk_voice_paused",
  paused: "kiosk_voice_paused",
  connecting: "kiosk_voice_connecting",
  listening: "kiosk_voice_listening",
  thinking: "kiosk_voice_thinking",
  speaking: "kiosk_voice_speaking",
  stopping: "kiosk_voice_stopping",
  error: "kiosk_voice_error",
} as const;
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
  citations?: { title: string; url: string }[];
  error?: "active" | "connection" | "permission" | "unconfigured";
  inputTrack?: MediaStreamTrack;
  interim?: string;
  messages?: LiveMessage[];
  microphone?: MicrophoneView;
  outputTrack?: MediaStreamTrack;
  progress?: { stage: "reading" | "searching" | "thinking"; summary: string };
  returnToStandby?: boolean;
  status: VoiceStatus;
  suggestions?: string[];
};

export type VoiceCameraState = {
  facing?: "environment" | "user";
  permission?: "unknown" | PermissionState;
  status:
    | "capturing"
    | "off"
    | "permission-denied"
    | "reading"
    | "ready"
    | "starting"
    | "unavailable";
};

export type VoiceCamera = {
  capture: (
    signal: AbortSignal,
    maxBytes: number,
  ) => Promise<
    | {
        error: "CAMERA_OFF" | "CAMERA_PERMISSION_DENIED" | "CAMERA_STARTING" | "CAMERA_UNAVAILABLE";
      }
    | { imageUrl: string }
  >;
  complete: () => void;
  getState?: () => VoiceCameraState;
};
