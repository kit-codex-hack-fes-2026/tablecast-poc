import type * as MediaPipe from "@mediapipe/tasks-vision";
import type { StandbyInput } from "./standby-model";

// 公開IIFEが作るglobalと型だけを宣言し、classic WorkerへES module markerを生成しない。
declare global {
  const Vision: typeof MediaPipe;
  type TablecastStandbyFace = MediaPipe.FaceLandmarker;
  type TablecastStandbyPose = MediaPipe.PoseLandmarker;
  type TablecastStandbyHands = MediaPipe.HandLandmarker;
  type TablecastStandbyInput = StandbyInput;
}
