import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const point = z.tuple([z.number().min(0).max(1792), z.number().min(0).max(660)]);
// 図の座標は本文1792×660内。構造図・時系列・根拠を同じカード配列へ変換しない。
export const technicalSchema = z
  .object({
    view: z.enum([
      "decision",
      "architecture",
      "sequence",
      "exception",
      "evidence",
      "state-machine",
      "test-matrix",
      "latency",
    ]),
    legend: z.string().min(1),
    sources: z.array(z.string().regex(/^[a-zA-Z0-9/_.-]+$/)).min(1),
    panels: z
      .array(
        z.object({
          id,
          style: z.enum([
            "plain",
            "system",
            "lane",
            "code",
            "state",
            "image",
            "note",
            "section",
            "card",
            "brand",
            "test-header",
            "test-row",
            "event",
          ]),
          x: z.number().min(0),
          y: z.number().min(0),
          width: z.number().positive(),
          height: z.number().positive(),
          label: z.string().min(1),
          detail: z.string().optional(),
          meta: z.string().optional(),
          tone: z.enum(["ink", "teal", "amber"]).default("ink"),
          image: z
            .string()
            .regex(/^assets\/images\/[a-z0-9-]+\.(png|jpg|webp)$/)
            .optional(),
          icon: z
            .string()
            .regex(/^assets\/images\/tablecast-logo-[a-z0-9-]+\.svg$/)
            .optional(),
        }),
      )
      .min(1),
    connections: z.array(
      z.object({
        id,
        from: id,
        to: id,
        points: z.array(point).min(2),
        label: z.string().min(1),
        labelAt: point,
        response: z.boolean().default(false),
      }),
    ),
    lifelines: z.array(z.number().min(0).max(1792)).optional(),
    focus: z
      .array(
        z.object({
          cue: id,
          offset: z.number().nonnegative(),
          targets: z.array(id).min(1),
          summary: z.string().min(1).max(85),
        }),
      )
      .min(1),
  })
  .superRefine((board, ctx) => {
    const ids = [...board.panels, ...board.connections].map((item) => item.id);
    const panels = board.panels.map((panel) => panel.id);
    if (
      new Set(ids).size !== ids.length ||
      board.focus.some((f) => f.targets.some((target) => !ids.includes(target)))
    )
      ctx.addIssue({ code: "custom", message: "技術図の識別子と注目先が一致しません" });
    if (board.panels.some((p) => p.x + p.width > 1792 || p.y + p.height > 660))
      ctx.addIssue({ code: "custom", message: "技術図の領域を超えています" });
    if (
      board.connections.some(
        (c) => !panels.includes(c.from) || !panels.includes(c.to) || c.from === c.to,
      )
    )
      ctx.addIssue({ code: "custom", message: "通信の主体がありません" });
    if (board.panels.some((p) => (p.style === "image") !== Boolean(p.image)))
      ctx.addIssue({ code: "custom", message: "実画面パネルには画像が必要です" });
  });
