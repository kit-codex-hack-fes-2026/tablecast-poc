import { z } from "zod";

export const instructionLimit = 5000;
const markSchema = z.object({ type: z.enum(["bold", "italic"]) }).strict();
const inlineSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("text"),
        text: z.string().min(1),
        marks: z.array(markSchema).max(2).optional(),
      })
      .strict(),
    z.object({ type: z.literal("hardBreak") }).strict(),
  ])
  .meta({ id: "tablecastInstructionInline" });
type Inline = z.infer<typeof inlineSchema>;
type TextBlock =
  | { type: "paragraph"; content?: Inline[] }
  | { type: "heading"; attrs: { level: number }; content?: Inline[] };
type Previous = [never, 0, 1];
type ListBlock<Depth extends 0 | 1 | 2> = (
  | { type: "bulletList" }
  | { type: "orderedList"; attrs?: { start: number; type?: null } }
) & {
  content: {
    type: "listItem";
    content: (TextBlock | (Depth extends 0 ? never : ListBlock<Previous[Depth]>))[];
  }[];
};
export type InstructionBlock = TextBlock | ListBlock<2>;
export type InstructionDocument = { type: "doc"; content: InstructionBlock[] };
const paragraphSchema = z
  .object({ type: z.literal("paragraph"), content: z.array(inlineSchema).optional() })
  .strict()
  .meta({ id: "tablecastInstructionParagraph" });
const textBlockSchema = z
  .discriminatedUnion("type", [
    paragraphSchema,
    z
      .object({
        type: z.literal("heading"),
        attrs: z.object({ level: z.number().int().min(1).max(3) }).strict(),
        content: z.array(inlineSchema).optional(),
      })
      .strict(),
  ])
  .meta({ id: "tablecastInstructionTextBlock" });
function listSchema<Child extends z.ZodType>(child: Child) {
  const items = z
    .array(
      z
        .object({ type: z.literal("listItem"), content: z.tuple([paragraphSchema]).rest(child) })
        .strict(),
    )
    .min(1);
  return z.discriminatedUnion("type", [
    z.object({ type: z.literal("bulletList"), content: items }).strict(),
    z
      .object({
        type: z.literal("orderedList"),
        attrs: z
          .object({ start: z.number().int().min(1).max(9999), type: z.null().optional() })
          .strict()
          .optional(),
        content: items,
      })
      .strict(),
  ]);
}
// JSON Schemaでは同じ深さのリストを参照し、日英・入れ子ごとの展開を避ける。
const firstListSchema = listSchema(textBlockSchema).meta({ id: "tablecastInstructionListDepth1" });
const secondListSchema = listSchema(z.union([textBlockSchema, firstListSchema])).meta({
  id: "tablecastInstructionListDepth2",
});
const blockSchema: z.ZodType<InstructionBlock> = z
  .union([textBlockSchema, listSchema(z.union([textBlockSchema, secondListSchema]))])
  .meta({ id: "tablecastInstructionBlock" });
// 再帰schemaの評価前に、大量の空ノードと過度の入れ子を止める。
const boundedDocument = z.unknown().superRefine((value, ctx) => {
  const pending = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!current) break;
    count += 1;
    if (count > 30000 || current.depth > 40) {
      ctx.addIssue({ code: "custom", message: "接客文書の構造が上限を超えています。" });
      return;
    }
    if (current.value && typeof current.value === "object") {
      for (const child of Object.values(current.value))
        pending.push({ value: child, depth: current.depth + 1 });
    }
  }
});
export const instructionDocumentSchema = boundedDocument.pipe(
  z
    .object({
      type: z.literal("doc"),
      content: z.array(blockSchema).min(1),
    })
    .strict(),
);
const richInstructionSchema = z
  .object({
    format: z.literal("tiptap-json"),
    version: z.literal(1),
    document: instructionDocumentSchema,
  })
  .strict();
export type CastInstruction = string | z.infer<typeof richInstructionSchema>;

/** 保存版1の本文投影。HTMLを作らず、構造とliteral文字を区別する。 */
function inlineText(items: Inline[] = []): string {
  return items
    .map((item) => {
      if (item.type === "hardBreak") return "\n";
      let text = item.text.replace(/[\\*_#<>[\]]/g, "\\$&");
      if (item.marks?.some((mark) => mark.type === "bold")) text = `**${text}**`;
      if (item.marks?.some((mark) => mark.type === "italic")) text = `_${text}_`;
      return text;
    })
    .join("");
}
function blockText(node: InstructionBlock): string {
  if (node.type === "paragraph") return inlineText(node.content);
  if (node.type === "heading") return `${"#".repeat(node.attrs.level)} ${inlineText(node.content)}`;
  return node.content
    .map((item, index) => {
      const prefix = node.type === "orderedList" ? `${(node.attrs?.start ?? 1) + index}. ` : "- ";
      return prefix + item.content.map(blockText).join("\n").replace(/\n/g, "\n  ");
    })
    .join("\n");
}
export function instructionText(value: CastInstruction): string {
  return typeof value === "string" ? value : value.document.content.map(blockText).join("\n\n");
}

export const castInstructionSchema = z
  .union([z.string().max(instructionLimit), richInstructionSchema])
  .superRefine((value, ctx) => {
    if (instructionText(value).length > instructionLimit)
      ctx.addIssue({
        code: "custom",
        message: "接客方針は書式と改行を含め5000文字以内にしてください。",
      });
  });
