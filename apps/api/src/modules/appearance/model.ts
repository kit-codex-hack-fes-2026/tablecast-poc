import generate from "css-tree/generator";
import parse from "css-tree/parser";
import { z } from "zod";
import { imageMetadataSchema } from "../media/model";

export const themeParts = [
  "screen",
  "header",
  "conversation",
  "voice-controls",
  "menu",
  "menu-masthead",
  "menu-section",
  "banner",
  "product-card",
  "category-button",
  "menu-tab",
  "action-button",
  "checkout",
  "dialog",
] as const;
export const themeFonts = {
  sans: '-apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
  serif: '"Hiragino Mincho ProN", "Yu Mincho", Georgia, serif',
  rounded: '"Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", sans-serif',
} as const;
const text = z
  .object({ ja: z.string().trim().min(1).max(200), en: z.string().trim().min(1).max(200) })
  .strict();
export const themeImageSchema = imageMetadataSchema
  .extend({
    imageKey: z.string().regex(/^tablecast\/uploads\/[a-f0-9]{64}\.webp$/),
    alt: text,
  })
  .strict()
  .meta({ id: "tablecastThemeImage" });
export type ThemeImage = z.infer<typeof themeImageSchema>;
const colour = z.string().regex(/^#[a-fA-F0-9]{6}$/);
const decoration = z
  .object({
    asset: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
    fit: z.enum(["contain", "cover", "repeat"]),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    opacity: z.number().min(0).max(1),
    widthPercent: z
      .number()
      .min(10)
      .max(200)
      .optional()
      .describe("単発画像の幅（部品に対する%）。省略時はfitに従う。"),
    tileSize: z
      .number()
      .int()
      .min(32)
      .max(1024)
      .optional()
      .describe("repeat時のタイル幅px。省略時は原寸。"),
  })
  .strict();
export const themePartSchema = z
  .object({
    background: z.union([colour, z.literal("transparent")]).optional(),
    foreground: colour.optional(),
    borderColor: colour.optional(),
    radius: z.number().min(0).max(24).optional(),
    borderWidth: z.number().min(0).max(4).optional(),
    shadow: z.enum(["none", "soft", "offset"]).optional(),
    font: z.enum(["sans", "serif", "rounded"]).optional(),
    image: decoration.optional(),
  })
  .strict()
  .meta({ id: "tablecastThemePart" });
export type ThemePart = z.infer<typeof themePartSchema>;

const sectionText = z
  .object({ ja: z.string().trim().max(3000), en: z.string().trim().max(3000) })
  .strict();
const assetName = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const sectionBase = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  title: sectionText.optional(),
  body: sectionText.optional(),
  align: z.enum(["start", "center"]).optional(),
  spacing: z.enum(["compact", "comfortable"]).optional(),
  style: themePartSchema.optional(),
});
export const menuSectionSchema = z.discriminatedUnion("kind", [
  sectionBase.extend({ kind: z.literal("intro"), imageAsset: assetName.optional() }).strict(),
  sectionBase.extend({ kind: z.literal("story"), imageAsset: assetName.optional() }).strict(),
  sectionBase
    .extend({
      kind: z.literal("products"),
      source: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("all") }).strict(),
        z.object({ kind: z.literal("category"), categoryId: z.string().min(1).max(100) }).strict(),
        z
          .object({
            kind: z.literal("selection"),
            productIds: z.array(z.string().min(1).max(100)).min(1).max(100),
          })
          .strict(),
      ]),
      layout: z.enum(["list", "gallery", "feature"]),
    })
    .strict(),
  sectionBase.extend({ kind: z.literal("artwork"), bannerId: z.string().min(1).max(100) }).strict(),
]);
export type MenuSection = z.infer<typeof menuSectionSchema>;

// 公開した単一部品だけを選択可能にし、DOM構造や親・兄弟の選択を契約へ含めない。
export function themeCssRules(css: string, assets: string[] = []) {
  const ast = parse(css, {
    positions: true,
    onParseError(error) {
      throw error;
    },
  });
  if (ast.type !== "StyleSheet") throw new Error("CSS stylesheet が必要です");
  return ast.children.toArray().map((rule) => {
    if (rule.type !== "Rule" || rule.prelude.type !== "SelectorList")
      throw new Error("CSSの@規則は使用できません");
    const selector = generate(rule.prelude);
    const match =
      /^\[data-theme-part=(?:"([a-z-]+)"|([a-z-]+))\](:hover|:focus-visible|\[aria-pressed=true\])?$/.exec(
        selector,
      );
    const part = match?.[1] ?? match?.[2];
    if (!part || !themeParts.some((value) => value === part))
      throw new Error(`使用できない部品: ${selector}`);
    const flexible = ["menu", "product-card", "category-button"].includes(part);
    const declarations = rule.block.children.toArray().map((node) => {
      const location = node.loc ? `${node.loc.start.line}:${node.loc.start.column}` : "";
      if (node.type !== "Declaration" || node.important)
        throw new Error(`${location} !important・入れ子の規則は使用できません`);
      const property = node.property;
      const value = generate(node.value);
      const length = /^(?:0|(?:[0-9]|[12][0-9]|3[0-2])px)$/;
      const colorValue = /^(?:#[a-fA-F0-9]{6}|var\(--tablecast-theme-(?:ink|paper|accent)\))$/;
      let allowed = false;
      if (["color", "background-color", "border-color"].includes(property))
        allowed = colorValue.test(value);
      if (property === "background-color" && value === "transparent") allowed = true;
      if (property === "border-radius") allowed = length.test(value);
      if (property === "border-width") allowed = /^(0|[1-4]px)$/.test(value);
      if (property === "border-style") allowed = /^(solid|dashed|double)$/.test(value);
      if (property === "font-family")
        allowed = /^var\(--tablecast-font-(heading|body)\)$/.test(value);
      if (property === "box-shadow")
        allowed = /^(none|[0-8]px [0-8]px (?:0|[0-8]px) #[a-fA-F0-9]{6})$/.test(value);
      if (property === "background-image")
        allowed = assets.some((asset) => value === `var(--tablecast-image-${asset})`);
      if (property === "background-size") allowed = /^(cover|contain)$/.test(value);
      if (property === "background-repeat") allowed = /^(repeat|no-repeat)$/.test(value);
      if (flexible && ["padding", "gap"].includes(property)) allowed = length.test(value);
      if (flexible && property === "font-size") allowed = /^(1[4-9]|2[0-4])px$/.test(value);
      if (!allowed) throw new Error(`${location} ${part}: ${property}: ${value} は使用できません`);
      return `${property}:${value}`;
    });
    return { part, suffix: match?.[3] ?? "", declarations: declarations.join(";") };
  });
}

export const appearanceSchema = z
  .object({
    version: z.literal(2).optional(),
    sections: z.array(menuSectionSchema).max(40).optional(),
    header: z
      .object({
        logoWidth: z.number().int().min(64).max(320),
        logoHeight: z.number().int().min(24).max(64),
        gap: z.number().int().min(8).max(24),
      })
      .strict()
      .optional(),
    voice: z
      .object({
        mode: z.enum(["orb", "face", "character"]),
        character: assetName.optional(),
        states: z
          .partialRecord(z.enum(["idle", "listening", "thinking", "speaking", "error"]), assetName)
          .optional(),
      })
      .strict()
      .optional(),
    composition: z
      .object({
        masthead: z
          .object({
            visible: z.boolean(),
            align: z.enum(["start", "center"]),
            logoWidth: z.number().int().min(120).max(360),
            logoHeight: z.number().int().min(40).max(160),
            padding: z.number().int().min(0).max(32),
          })
          .strict()
          .optional(),
        banners: z
          .object({
            columns: z.union([z.literal(1), z.literal(2)]),
            gap: z.number().int().min(8).max(32),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    colours: z.object({ ink: colour, paper: colour, accent: colour }).strict().optional(),
    fonts: z
      .object({
        heading: z.enum(["sans", "serif", "rounded"]),
        body: z.enum(["sans", "serif", "rounded"]),
      })
      .strict()
      .optional(),
    assets: z
      .record(z.string().regex(/^[a-z][a-z0-9-]{0,39}$/), themeImageSchema)
      .refine((value) => Object.keys(value).length <= 20)
      .optional(),
    parts: z.partialRecord(z.enum(themeParts), themePartSchema).optional(),
    customCss: z.string().max(20_000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.version !== 2 && (value.sections || value.header || value.voice))
      ctx.addIssue({
        code: "custom",
        path: ["version"],
        message: "新しいテーマ設定にはversion: 2が必要です",
      });
    const requireAsset = (name: string | undefined, path: (string | number)[]) => {
      if (name && !value.assets?.[name])
        ctx.addIssue({ code: "custom", path, message: "登録済み画像を選択してください" });
    };
    requireAsset(value.voice?.character, ["voice", "character"]);
    if (value.voice?.mode === "character" && !value.voice.character)
      ctx.addIssue({
        code: "custom",
        path: ["voice", "character"],
        message: "キャラクターの基本画像を選択してください",
      });
    for (const [state, asset] of Object.entries(value.voice?.states ?? {}))
      requireAsset(asset, ["voice", "states", state]);
    const ids = new Set<string>();
    for (const [index, section] of (value.sections ?? []).entries()) {
      if (ids.has(section.id))
        ctx.addIssue({
          code: "custom",
          path: ["sections", index, "id"],
          message: "セクションIDが重複しています",
        });
      ids.add(section.id);
      if (section.kind === "intro" || section.kind === "story")
        requireAsset(section.imageAsset, ["sections", index, "imageAsset"]);
      requireAsset(section.style?.image?.asset, ["sections", index, "style", "image", "asset"]);
      for (const field of ["title", "body"] as const) {
        const content = section[field];
        if (content && Boolean(content.ja) !== Boolean(content.en))
          ctx.addIssue({
            code: "custom",
            path: ["sections", index, field],
            message: "日本語と英語を両方入力してください",
          });
      }
    }
    for (const [part, style] of Object.entries(value.parts ?? {})) {
      if (style.image && !value.assets?.[style.image.asset])
        ctx.addIssue({
          code: "custom",
          path: ["parts", part, "image", "asset"],
          message: "登録済み画像を選択してください",
        });
    }
    try {
      themeCssRules(value.customCss ?? "", Object.keys(value.assets ?? {}));
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: ["customCss"],
        message: error instanceof Error ? error.message : "CSSを確認してください",
      });
    }
  });
export type Appearance = z.infer<typeof appearanceSchema>;
export const bannerSchema = z
  .object({
    id: z.string().min(1).max(100),
    image: themeImageSchema,
    enabled: z.boolean(),
    span: z
      .enum(["column", "full"])
      .optional()
      .describe("2列配置でfullは全幅。画像は切り抜かない。"),
    hotspots: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            productId: z.string().min(1).max(100),
            rect: z
              .object({
                x: z.number().min(0).max(1),
                y: z.number().min(0).max(1),
                width: z.number().positive().max(1),
                height: z.number().positive().max(1),
              })
              .strict()
              .refine(
                (rect) => rect.x + rect.width <= 1.000001 && rect.y + rect.height <= 1.000001,
                "領域を画像内に収めてください",
              ),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export type Banner = z.infer<typeof bannerSchema>;
export const brandingSchema = z.object({ logo: themeImageSchema.nullable() }).strict();
