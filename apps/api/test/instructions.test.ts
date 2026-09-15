import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  castInstructionSchema,
  instructionText,
} from "../src/modules/configuration/instruction-model";
import { configurationSchema } from "../src/modules/configuration/model";

const rich = (content: unknown[]) => ({
  format: "tiptap-json",
  version: 1,
  document: { type: "doc", content },
});
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("接客方針の保存契約", () => {
  it.each([
    "",
    "# 文字のまま\n\n\n最後\n",
    "<speak>静かに</speak>",
    "![写真](https://example.invalid/a.png)",
    "🙂".repeat(2500),
  ])("既存の文字列を解釈せずそのまま保持する: %s", (value) => {
    expect(castInstructionSchema.parse(value)).toBe(value);
    expect(instructionText(value)).toBe(value);
  });
  it("本文の記号、末尾と連続改行、強調をJSONの往復で維持する", () => {
    const value = rich([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "# 記号" },
          { type: "hardBreak" },
          { type: "hardBreak" },
          { type: "text", text: "丁寧", marks: [{ type: "bold" }] },
          { type: "hardBreak" },
        ],
      },
    ]);
    const saved = castInstructionSchema.parse(value);
    expect(castInstructionSchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(instructionText(saved)).toBe("\\# 記号\n\n**丁寧**\n");
  });
  it("見出しと開始番号を持つリストをモデル向け本文へ投影する", () => {
    const value = castInstructionSchema.parse(
      rich([
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "案内" }] },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [{ type: "listItem", content: [paragraph("確認")] }],
        },
      ]),
    );
    expect(instructionText(value)).toBe("## 案内\n\n3. 確認");
  });
  it("書式を含めた上限で判定し、空文書は空文字になる", () => {
    expect(instructionText(castInstructionSchema.parse(rich([{ type: "paragraph" }])))).toBe("");
    expect(castInstructionSchema.safeParse(rich([paragraph("あ".repeat(5000))])).success).toBe(
      true,
    );
    expect(castInstructionSchema.safeParse(rich([paragraph("あ".repeat(5001))])).success).toBe(
      false,
    );
    expect(
      castInstructionSchema.safeParse(
        rich([
          {
            type: "paragraph",
            content: [{ type: "text", text: "あ".repeat(4997), marks: [{ type: "bold" }] }],
          },
        ]),
      ).success,
    ).toBe(false);
  });
  it.each(["image", "iframe", "attachment", "video"])(
    "禁止ノード%sを黙って捨てず拒否する",
    (type) => {
      expect(
        castInstructionSchema.safeParse(
          rich([{ type, attrs: { src: "https://example.invalid/a" } }]),
        ).success,
      ).toBe(false);
    },
  );
  it("未知属性・版・過度な入れ子を拒否する", () => {
    expect(
      castInstructionSchema.safeParse({ ...rich([paragraph("本文")]), version: 2 }).success,
    ).toBe(false);
    expect(
      castInstructionSchema.safeParse(rich([{ ...paragraph("本文"), attrs: { onclick: "bad" } }]))
        .success,
    ).toBe(false);
    let node: unknown = paragraph("本文");
    for (let index = 0; index < 50; index += 1)
      node = {
        type: "bulletList",
        content: [{ type: "listItem", content: [paragraph("項目"), node] }],
      };
    expect(castInstructionSchema.safeParse(rich([node])).success).toBe(false);
  });
  it("MCPへ公開できるJSON schemaを生成する", () => {
    expect(JSON.stringify(z.toJSONSchema(configurationSchema))).toContain("tiptap-json");
  });
});
