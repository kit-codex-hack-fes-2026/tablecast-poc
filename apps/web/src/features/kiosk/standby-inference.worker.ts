import {
  type AutomaticSpeechRecognitionPipeline,
  type DepthEstimationPipeline,
  env,
  pipeline,
  RawImage,
} from "@huggingface/transformers";
import type { Point } from "./standby-geometry-model";
/// <reference lib="webworker" />
import type { StandbyInput, StandbyOutput } from "./standby-model";
import { landmark, personFeatures, PersonTracker } from "./standby-geometry-model";
import { wakeLanguage } from "./standby-model";

declare const self: DedicatedWorkerGlobalScope;
const worker = self;
const send = (message: StandbyOutput) => worker.postMessage(message, []);
let landmarkWorker: Worker;
let depth: DepthEstimationPipeline;
let transcribe: AutomaticSpeechRecognitionPipeline;
let latestDepth: undefined | { at: number; data: Uint8Array; height: number; width: number };
const tracker = new PersonTracker();
const canvas = new OffscreenCanvas(640, 480);
const context = canvas.getContext("2d", { willReadFrequently: true });
let busy = false;

type LandmarkFrame = {
  faces: Point[][];
  hands: Point[][];
  poses: Point[][];
  type: "error" | "landmarks" | "ready";
};
function detect(input: StandbyInput): Promise<LandmarkFrame> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("LANDMARK_TIMEOUT"));
    }, 60_000);
    const cleanup = () => {
      clearTimeout(timeout);
      landmarkWorker.removeEventListener("message", received);
      landmarkWorker.removeEventListener("error", fail);
    };
    const received = ({ data }: MessageEvent<LandmarkFrame>) => {
      cleanup();
      if (data.type === "error") reject(new Error("LANDMARK_UNAVAILABLE"));
      else resolve(data);
    };
    const fail = () => {
      cleanup();
      reject(new Error("LANDMARK_UNAVAILABLE"));
    };
    landmarkWorker.addEventListener("message", received);
    landmarkWorker.addEventListener("error", fail);
    landmarkWorker.postMessage(input, input.type === "frame" ? [input.bitmap] : []);
  });
}
async function initialise(mode: "speech" | "vision") {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
  if (mode === "speech") {
    transcribe = await pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny", {
      revision: "ff4177021cc41f7db950912b73ea4fdf7d01d8e7",
      device: "webgpu",
      dtype: "q8",
    });
    // 初回のshader準備と空音声の推論を待受開始前に済ませ、結果は破棄する。
    await transcribe(new Float32Array(16000), { task: "transcribe", max_new_tokens: 20 });
  } else {
    landmarkWorker = new Worker(new URL("./standby-landmarks.worker.ts", import.meta.url), {
      name: "tablecast-standby-landmarks",
    });
    await detect({ type: "init", mode: "vision" });
    depth = await pipeline("depth-estimation", "onnx-community/depth-anything-v2-small", {
      revision: "4472b7362082ad9968fee890ca0f1e5aca36b93d",
      device: "webgpu",
      dtype: "fp32",
    });
  }
  send({ type: "ready" });
}

async function frame(bitmap: ImageBitmap, at: number) {
  if (!context) throw new Error("CANVAS_UNAVAILABLE");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  context.drawImage(bitmap, 0, 0);
  const { faces, poses, hands: handPoints } = await detect({ type: "frame", bitmap, at });
  if (!faces.length || !poses.length) {
    tracker.reset();
    send({ type: "frame" });
    return;
  }
  if (!latestDepth || at - latestDepth.at > 1500) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = await depth(
      new RawImage(new Uint8ClampedArray(image.data), canvas.width, canvas.height, 4),
    );
    latestDepth = {
      data: new Uint8Array(result.depth.data),
      width: result.depth.width,
      height: result.depth.height,
      at,
    };
  }
  const map = latestDepth;
  const relativeDepth = (x: number, y: number) => {
    const value =
      map.data[
        Math.floor(Math.min(0.999, Math.max(0, y)) * map.height) * map.width +
          Math.floor(Math.min(0.999, Math.max(0, x)) * map.width)
      ];
    let less = 0;
    let count = 0;
    for (let i = 0; i < map.data.length; i += 64) {
      if ((map.data[i] ?? 0) <= (value ?? 0)) less++;
      count++;
    }
    return less / count;
  };
  const people = poses.map((points) => {
    const matches = faces.filter(
      (landmarks) =>
        Math.hypot(
          landmark(points, 0).x - landmark(landmarks, 1).x,
          landmark(points, 0).y - landmark(landmarks, 1).y,
        ) < 0.12,
    );
    return matches.length === 1
      ? personFeatures(
          points,
          matches[0] ?? [],
          handPoints,
          relativeDepth(landmark(points, 0).x, landmark(points, 0).y),
        )
      : undefined;
  });
  // 大きく写る別人の特徴を取得できない場合も、所属を推測して補わない。
  if (
    people.some(
      (person, index) =>
        !person &&
        Math.abs(landmark(poses[index] ?? [], 11).x - landmark(poses[index] ?? [], 12).x) >= 0.18,
    )
  ) {
    tracker.reset();
    send({ type: "frame" });
    return;
  }
  send({
    type: "frame",
    observation: tracker.observe(
      people.filter((person) => person !== undefined),
      at,
    ),
  });
}

async function receive({ data }: MessageEvent<StandbyInput>) {
  if (busy) {
    if (data.type === "frame") data.bitmap.close();
    return;
  }
  busy = true;
  try {
    if (data.type === "init") await initialise(data.mode);
    else if (data.type === "frame") await frame(data.bitmap, data.at);
    else {
      const result = await transcribe(data.audio, { task: "transcribe", max_new_tokens: 20 });
      send({ type: "speech", id: data.id, locale: wakeLanguage(result.text) });
    }
  } catch {
    send({ type: "error" });
  } finally {
    if (data.type === "frame") data.bitmap.close();
    if (data.type === "speech") data.audio.fill(0);
    busy = false;
  }
}
worker.addEventListener("message", (event: MessageEvent<StandbyInput>) => {
  void receive(event);
});
