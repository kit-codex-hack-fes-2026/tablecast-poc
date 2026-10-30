import type { Locale } from "@tablecast/api/schema";
import { MicVAD } from "@ricky0123/vad-web";
import type { StandbyOutput, StandbyStatus, WakeActivation } from "./standby-model";
import { WakeDecision } from "./standby-model";

type Capture = {
  abort: AbortController;
  context: AudioContext;
  keepAudio?: boolean;
  speech: Worker;
  speechLimit?: ReturnType<typeof setTimeout>;
  stream?: MediaStream;
  timer?: ReturnType<typeof setInterval>;
  vad?: MicVAD;
  video: HTMLVideoElement;
  vision: Worker;
};

export class LocalStandby {
  private capture?: Capture;
  private generation = 0;
  constructor(
    private onStatus: (status: StandbyStatus) => void,
    private onActivate: (
      activation: WakeActivation,
      locale: Locale | undefined,
      microphone: MediaStream,
    ) => Promise<void>,
  ) {}
  async start(audioContext?: AudioContext, microphoneId = "default") {
    const version = ++this.generation;
    const previous = this.capture;
    this.capture = undefined;
    if (previous) await this.release(previous);
    if (version !== this.generation) {
      void audioContext?.close();
      return;
    }
    if (
      !navigator.gpu ||
      !navigator.mediaDevices?.getUserMedia ||
      !globalThis.OffscreenCanvas ||
      !globalThis.Worker
    ) {
      void audioContext?.close();
      this.onStatus("error");
      return;
    }
    const context = audioContext ?? new AudioContext();
    const capture: Capture = {
      abort: new AbortController(),
      context,
      video: document.createElement("video"),
      vision: new Worker(new URL("./standby-inference.worker.ts", import.meta.url), {
        type: "module",
        name: "tablecast-standby-vision",
      }),
      speech: new Worker(new URL("./standby-inference.worker.ts", import.meta.url), {
        type: "module",
        name: "tablecast-standby-speech",
      }),
    };
    this.capture = capture;
    this.onStatus("preparing");
    const signal = capture.abort.signal;
    const decision = new WakeDecision();
    let activating = false;
    const activate = async (activation: WakeActivation, locale?: Locale) => {
      if (activating || signal.aborted || !capture.stream) return;
      activating = true;
      capture.keepAudio = true;
      const microphone = new MediaStream(capture.stream.getAudioTracks());
      await this.release(capture);
      if (this.capture !== capture) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }
      this.capture = undefined;
      this.onStatus("connecting");
      try {
        await this.onActivate(activation, locale, microphone);
      } catch {
        microphone.getTracks().forEach((track) => track.stop());
        this.onStatus("error");
      }
    };
    const fail = () => {
      if (signal.aborted) return;
      void this.release(capture);
      if (this.capture === capture) {
        this.capture = undefined;
        this.onStatus("error");
      }
    };
    // 自動開始でAudioContextが保留された場合は、既存画面への操作で再開する。
    const resumeAudio = () => {
      if (context.state !== "running") void context.resume().catch(fail);
    };
    document.addEventListener("pointerdown", resumeAudio, { signal });
    document.addEventListener("keydown", resumeAudio, { signal });
    resumeAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 10, max: 15 },
        },
        audio: {
          ...(microphoneId === "default" ? {} : { deviceId: { exact: microphoneId } }),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      capture.stream = stream;
      if (signal.aborted) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      for (const track of stream.getTracks())
        track.addEventListener("ended", fail, { once: true, signal });
      capture.video.muted = true;
      capture.video.playsInline = true;
      capture.video.srcObject = stream;
      await capture.video.play();
      let frameBusy = false;
      let speechBusy = false;
      let speaking = false;
      let speechId = 0;
      let speechAt = 0;
      let speechPerson: number | undefined;
      const ready = (worker: Worker, mode: "speech" | "vision") =>
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("MODEL_TIMEOUT")), 180_000);
          const cancel = () => {
            clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
          };
          signal.addEventListener("abort", cancel, { once: true });
          worker.addEventListener("error", () => {
            clearTimeout(timeout);
            reject(new Error("MODEL_UNAVAILABLE"));
            fail();
          });
          worker.addEventListener("message", ({ data }: MessageEvent<StandbyOutput>) => {
            if (signal.aborted) return;
            if (data.type === "ready") {
              clearTimeout(timeout);
              signal.removeEventListener("abort", cancel);
              resolve();
            } else if (data.type === "error") {
              clearTimeout(timeout);
              reject(new Error("INFERENCE_FAILED"));
              fail();
            } else if (data.type === "frame") {
              frameBusy = false;
              const activation = decision.observe(data.observation, performance.now());
              if (activation && (activation !== "gaze" || (!speechBusy && !speaking)))
                void activate(activation);
            } else {
              speechBusy = false;
              if (
                data.locale &&
                data.id === speechId &&
                performance.now() - speechAt < 5000 &&
                speechPerson !== undefined &&
                decision.currentPerson(performance.now()) === speechPerson
              )
                void activate("wake_word", data.locale);
            }
          });
          worker.postMessage({ type: "init", mode }, []);
        });
      // VADのWASMとライブラリの版を一致させ、非分離ページでも単一threadで動かす。
      const vadPromise = MicVAD.new({
        ortConfig: (ort) => {
          ort.env.wasm.numThreads = 1;
        },
        audioContext: context,
        model: "v5",
        startOnLoad: false,
        baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/",
        onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/",
        getStream: async () => {
          signal.throwIfAborted();
          return new MediaStream(stream.getAudioTracks());
        },
        pauseStream: async () => {},
        resumeStream: async () => {
          signal.throwIfAborted();
          return new MediaStream(stream.getAudioTracks());
        },
        submitUserSpeechOnPause: false,
        redemptionMs: 400,
        minSpeechMs: 300,
        onSpeechStart: () => {
          speaking = true;
          decision.beginSpeech(performance.now());
          clearTimeout(capture.speechLimit);
          // 長い会話を蓄積しない。定型呼出しの最大長を越えた区間は破棄する。
          capture.speechLimit = setTimeout(() => {
            void capture.vad?.pause().then(() => {
              decision.endSpeech(performance.now());
              speaking = false;
              if (!signal.aborted) void capture.vad?.start();
            });
          }, 5000);
        },
        onSpeechEnd: (audio) => {
          speaking = false;
          clearTimeout(capture.speechLimit);
          const person = decision.endSpeech(performance.now());
          if (signal.aborted || speechBusy || person === undefined || audio.length > 80_000) {
            audio.fill(0);
            return;
          }
          speechBusy = true;
          speechAt = performance.now();
          speechPerson = person;
          speechId++;
          capture.speech.postMessage({ type: "speech", audio, id: speechId }, [audio.buffer]);
        },
        onVADMisfire: () => {
          speaking = false;
          clearTimeout(capture.speechLimit);
          decision.endSpeech(performance.now());
        },
      }).then(async (vad) => {
        capture.vad = vad;
        if (signal.aborted) await vad.destroy();
      });
      await Promise.all([
        ready(capture.vision, "vision"),
        ready(capture.speech, "speech"),
        vadPromise,
      ]);
      if (signal.aborted) return;
      await capture.vad?.start();
      this.onStatus("armed");
      capture.timer = setInterval(() => {
        if (frameBusy || signal.aborted || capture.video.readyState < 2) return;
        frameBusy = true;
        const at = performance.now();
        void createImageBitmap(capture.video)
          .then((bitmap) => {
            if (signal.aborted) {
              bitmap.close();
              return;
            }
            capture.vision.postMessage({ type: "frame", bitmap, at }, [bitmap]);
          })
          .catch(fail);
      }, 125);
    } catch {
      if (!signal.aborted) fail();
    }
  }
  private async release(capture: Capture) {
    capture.abort.abort();
    clearInterval(capture.timer);
    clearTimeout(capture.speechLimit);
    capture.stream?.getTracks().forEach((track) => {
      if (!capture.keepAudio || track.kind === "video") track.stop();
    });
    capture.video.pause();
    capture.video.srcObject = null;
    capture.vision.terminate();
    capture.speech.terminate();
    await capture.vad?.destroy().catch(() => undefined);
    await capture.context.close().catch(() => undefined);
  }
  async stop() {
    this.generation++;
    const capture = this.capture;
    this.capture = undefined;
    if (capture) await this.release(capture);
  }
}
