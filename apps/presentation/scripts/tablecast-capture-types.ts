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

type SpeechEvent = { id: string; at: number; duration: number };
declare global {
  interface Window {
    tablecastPointerEvents: z.infer<typeof pointerEvent>[];
    tablecastScreenEvents: { at: number; text: string }[];
    tablecastCapture: {
      startedAt: number;
      events: SpeechEvent[];
      start(): Promise<number>;
      speak(base64: string, id: string): Promise<void>;
      dump(): Promise<string>;
      stop(): Promise<string>;
    };
  }
}

// Playwrightが実際に送ったイベントだけをブラウザー内で記録する。
export function captureBrowserPointer() {
  window.tablecastPointerEvents = [];
  for (const kind of ["pointermove", "pointerdown", "pointerup"] as const) {
    document.addEventListener(
      kind,
      (event) => {
        if (!(event.target instanceof Element)) return;
        window.tablecastPointerEvents.push({
          at: Date.now(),
          x: event.clientX,
          y: event.clientY,
          interactionType:
            kind === "pointerdown" ? "click" : kind === "pointerup" ? "mouseup" : "move",
          cursorType: getComputedStyle(event.target).cursor === "pointer" ? "pointer" : "arrow",
        });
      },
      true,
    );
  }
}
