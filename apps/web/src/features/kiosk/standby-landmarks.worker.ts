/// <reference lib="webworker" />
// MediaPipeの公開IIFE版とWASMを標準classic Workerで読み込む。moduleの読込方式を上書きしない。
let tablecastFace: TablecastStandbyFace;
let tablecastPose: TablecastStandbyPose;
let tablecastHands: TablecastStandbyHands;
const tablecastModelPath = (name: string) =>
  `https://storage.googleapis.com/mediapipe-models/${name === "pose_landmarker_lite" ? "pose_landmarker" : name}/${name}/float16/1/${name}.task`;
async function tablecastLandmarks({ data }: MessageEvent<TablecastStandbyInput>) {
  try {
    if (data.type === "init") {
      importScripts("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/vision_bundle.js");
      const files = await Vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm",
      );
      tablecastFace = await Vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: tablecastModelPath("face_landmarker"), delegate: "CPU" },
        runningMode: "VIDEO",
        numFaces: 4,
      });
      tablecastPose = await Vision.PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: tablecastModelPath("pose_landmarker_lite"),
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 4,
      });
      tablecastHands = await Vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: tablecastModelPath("hand_landmarker"), delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 4,
      });
      postMessage({ type: "ready" }, { transfer: [] });
    } else if (data.type === "frame") {
      postMessage(
        {
          type: "landmarks",
          faces: tablecastFace.detectForVideo(data.bitmap, data.at).faceLandmarks,
          poses: tablecastPose.detectForVideo(data.bitmap, data.at).landmarks,
          hands: tablecastHands.detectForVideo(data.bitmap, data.at).landmarks,
        },
        { transfer: [] },
      );
    }
  } catch {
    postMessage({ type: "error" }, { transfer: [] });
  } finally {
    if (data.type === "frame") data.bitmap.close();
  }
}
addEventListener("message", (event: MessageEvent<TablecastStandbyInput>) => {
  void tablecastLandmarks(event);
});
