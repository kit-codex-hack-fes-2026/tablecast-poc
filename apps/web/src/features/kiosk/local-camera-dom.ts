// プレビューのCSS鏡像を適用せず、元の映像から転送上限内のJPEGを作る。
export async function captureCameraFrame(
  video: HTMLVideoElement,
  signal: AbortSignal,
  maxBytes: number,
) {
  signal.throwIfAborted();
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight)
    throw new Error("Camera frame is unavailable");
  const canvas = document.createElement("canvas");
  const ratio = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
  canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Camera frame cannot be captured");
  try {
    for (let scale = 0; scale < 4; scale++) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.6, 0.4]) {
        signal.throwIfAborted();
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (!blob || (blob.size * 4) / 3 + 32 > maxBytes) continue;
        const imageUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener("load", () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error("Invalid camera image")),
          );
          reader.addEventListener("error", () =>
            reject(new Error("Camera image could not be read")),
          );
          reader.readAsDataURL(blob);
        });
        signal.throwIfAborted();
        if (new TextEncoder().encode(imageUrl).byteLength <= maxBytes) return imageUrl;
      }
      canvas.width = Math.max(1, Math.floor(canvas.width * 0.75));
      canvas.height = Math.max(1, Math.floor(canvas.height * 0.75));
    }
    throw new Error("Camera image exceeds the transport limit");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
export const localCameraDefaults = { width: 128, aspectRatio: 4 / 3 };
