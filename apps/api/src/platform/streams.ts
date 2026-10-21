import { ensure } from "./errors";

// Workersの非generic streamを、変換・保存の入口でバイト列へ絞り込む。
export function byteStream(stream: ReadableStream<unknown>): ReadableStream<Uint8Array> {
  return stream.pipeThrough(
    new TransformStream<unknown, Uint8Array>({
      transform(chunk, controller) {
        ensure(chunk instanceof Uint8Array, "INVALID_IMAGE", 422);
        controller.enqueue(chunk);
      },
    }),
  );
}
