import type { Locale } from "@tablecast/api/schema";
import type { z } from "zod";
import type {
  Caption,
  PendingResponse,
  responseEnvelope,
  SavedCaption,
  transcriptEvent,
} from "./voice-events-model";
import { type TableClient } from "../../lib/api";
import { initialMicrophone, type MicrophoneView, type VoiceView } from "./voice-model";
export class VoiceRuntime {
  attempt = 0;
  view: VoiceView = { status: "idle" };
  peer?: RTCPeerConnection;
  channel?: RTCDataChannel;
  microphone?: MediaStream;
  microphoneSender?: RTCRtpSender;
  switchingMicrophone?: MediaStream;
  audio?: HTMLAudioElement;
  sessionId?: string;
  desired = false;
  ready = false;
  stopping?: Promise<void>;
  startingRequest?: AbortController;
  delegation?: AbortController;
  delegations = new Map<string, Promise<string | undefined>>();
  responses = new Map<string, PendingResponse>();
  responseIds = new Map<string, string>();
  activeDelegation?: string;
  transcriptEvents = new Set<string>();
  captions: Caption[] = [];
  pendingCaptions = new Map<string, SavedCaption>();
  saving?: Promise<void>;
  saveTimer?: ReturnType<typeof setTimeout>;
  readyTimer?: ReturnType<typeof setTimeout>;
  proactiveTimer?: ReturnType<typeof setTimeout>;
  proactive = false;
  locale: Locale = "ja";
  speechSpeed = 1;
  requestedSpeechSpeed = 1;
  microphoneView = initialMicrophone;
  deviceRequest = 0;
  microphoneErrorSource?: "capture" | "devices";
  declare observeMicrophones: () => () => void;
  declare refreshMicrophones: () => Promise<void>;
  declare selectMicrophone: (deviceId: string) => Promise<void>;
  declare captureMicrophone: (deviceId: string) => Promise<MediaStream>;
  declare observeMicrophone: (stream: MediaStream, attempt: number) => void;
  declare updateMicrophone: (
    change: Partial<MicrophoneView>,
    errorSource?: "capture" | "devices",
  ) => void;
  declare updateSpeechSpeed: () => void;
  declare stop: (options?: { existingSession?: boolean; serverStopped?: boolean }) => Promise<void>;
  declare receiveCaption: (event: z.infer<typeof transcriptEvent>, attempt: number) => void;
  declare finishCaption: (caption: Caption, interrupted: boolean) => void;
  declare scheduleSave: () => void;
  declare saveCaptions: (sessionId: string) => Promise<void>;
  declare registerDelegation: (
    id: null | string,
    trigger: "proactive" | "user",
    attempt: number,
  ) => Promise<string | undefined>;
  declare receiveResponse: (
    envelope: z.infer<typeof responseEnvelope>,
    attempt: number,
  ) => Promise<void>;
  declare reportFailure: () => void;
  declare scheduleProactive: (attempt: number) => void;
  declare proactiveSuggestion: (attempt: number) => Promise<void>;
  declare closeTransport: (peer?: RTCPeerConnection, channel?: RTCDataChannel) => Promise<void>;
  declare fail: (attempt: number) => Promise<void>;
  declare emit: (change: Partial<VoiceView>) => void;
  declare current: (attempt: number) => boolean;
  declare retire: (voiceSessionId?: string) => Promise<void>;
  constructor(
    public onChange: (view: VoiceView) => void,
    public onSync: () => void,
    public client: TableClient,
  ) {}
}
