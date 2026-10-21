import { z } from "zod";

export const pointerEvent = z.object({
  at: z.number(),
  x: z.number(),
  y: z.number(),
  cursorType: z.string(),
  interactionType: z.enum(["move", "click", "mouseup"]),
});
export const screenProject = z.object({
  version: z.literal(2),
  media: z.looseObject({ screenVideoPath: z.string() }),
  editor: z.looseObject({}),
});
export const videoDimensions = z.object({
  streams: z.tuple([z.object({ width: z.number(), height: z.number() })]),
});
export function assertCaptureFrame(
  frame: { height: number; width: number },
  viewport: { height: number; width: number },
) {
  if (frame.width !== viewport.width + 2 || frame.height !== viewport.height + 82)
    throw new Error(`Chrome client領域が実測済み配置と異なります: ${JSON.stringify(frame)}`);
}
export const recordedTable = z.looseObject({
  id: z.string(),
  tableId: z.string(),
  tableName: z.string(),
  cart: z.looseObject({ lines: z.array(z.unknown()) }),
  orders: z.array(
    z.looseObject({
      id: z.string(),
      status: z.string(),
      snapshot: z.looseObject({ tableSessionId: z.string() }),
    }),
  ),
});
export const captureEvents = z.looseObject({
  audioStartedAt: z.number(),
  pointer: z.array(pointerEvent),
  result: z
    .looseObject({ sessionId: z.string(), orders: z.array(z.looseObject({ id: z.string() })) })
    .optional(),
});

type SpeechEvent = { at: number; duration: number; id: string };
declare global {
  interface Window {
    tablecastCapture: {
      dump(): Promise<string>;
      events: SpeechEvent[];
      speak(base64: string, id: string): Promise<void>;
      start(): Promise<number>;
      startedAt: number;
      stop(): Promise<string>;
    };
    tablecastPointerEvents: z.infer<typeof pointerEvent>[];
    tablecastScreenEvents: { at: number; text: string }[];
  }
}

// Playwrightが実際に送ったイベントだけをブラウザー内で記録する。
export function captureBrowserPointer() {
  window.tablecastPointerEvents = [];
  const interactionTypes = {
    pointermove: "move",
    pointerdown: "click",
    pointerup: "mouseup",
  } as const;
  for (const [kind, interactionType] of Object.entries(interactionTypes)) {
    document.addEventListener(
      kind,
      (event) => {
        if (!(event instanceof PointerEvent) || !(event.target instanceof Element)) return;
        window.tablecastPointerEvents.push({
          at: Date.now(),
          x: event.clientX,
          y: event.clientY,
          interactionType,
          cursorType: getComputedStyle(event.target).cursor === "pointer" ? "pointer" : "arrow",
        });
      },
      true,
    );
  }
}
