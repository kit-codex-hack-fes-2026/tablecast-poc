import { assert, describe, expect, it } from "vitest";
import { readStoreSkill, searchStoreSkills } from "../src/modules/configuration/knowledge";
import { type StoreSkill, storeSkillsSchema } from "../src/modules/configuration/knowledge-model";

const skills: StoreSkill[] = [
  {
    id: "restaurant",
    files: [
      {
        path: "SKILL.md",
        content:
          "---\nname: restaurant\ndescription: 店舗案内\n---\n# 店舗案内\n[予約](references/reservations.md)",
      },
      {
        path: "references/reservations.md",
        content:
          "# 予約 / Reservations\n予約はスタッフへ相談します。Private rooms are not available.",
      },
    ],
  },
];

const make = (id: string, length: number) => ({
  id,
  files: Array.from({ length }, (_, index) => ({
    path: index === 0 ? "SKILL.md" : `references/${index}.md`,
    content: "あ".repeat(32000),
  })),
});

describe("店舗資料の入力と段階的取得", () => {
  it("任意の複数ファイルを原文保持し、SKILL.mdと安全な相対パスを必須にする", () => {
    expect(storeSkillsSchema.parse(skills)).toEqual(skills);
    for (const path of [
      "../secret",
      "/absolute.md",
      "references/../secret.md",
      "a//b.md",
      "a\\b.md",
      "https://example.com/a.md",
    ])
      expect(
        storeSkillsSchema.safeParse([
          { ...skills[0], files: [...(skills[0]?.files ?? []), { path, content: "内容" }] },
        ]).success,
      ).toBe(false);
    expect(
      storeSkillsSchema.safeParse([
        { id: "restaurant", files: [{ path: "guide.md", content: "本文" }] },
      ]).success,
    ).toBe(false);
    expect(
      storeSkillsSchema.safeParse([
        { id: "restaurant", files: [{ path: "SKILL.md", content: " " }] },
      ]).success,
    ).toBe(false);
    expect(storeSkillsSchema.safeParse([...skills, ...skills]).success).toBe(false);
    expect(
      storeSkillsSchema.safeParse([
        {
          ...skills[0],
          files: [...(skills[0]?.files ?? []), { path: "skill.md", content: "重複" }],
        },
      ]).success,
    ).toBe(false);
  });
  it("本文の個別上限と店舗全体の上限を守る", () => {
    expect(storeSkillsSchema.safeParse([make("restaurant", 8)]).success).toBe(true);
    expect(storeSkillsSchema.safeParse([make("restaurant", 9)]).success).toBe(false);
    expect(
      storeSkillsSchema.safeParse([
        { id: "restaurant", files: [{ path: "SKILL.md", content: "x".repeat(32001) }] },
      ]).success,
    ).toBe(false);
  });
  it.each(["予約", "reservations", "private rooms"])(
    "%sを参照ファイルから検索し原文位置を返す",
    (query) => {
      const result = searchStoreSkills(skills, query, 0);
      expect(result.matches.some((item) => item.path === "references/reservations.md")).toBe(true);
      for (const item of result.matches)
        expect(
          readStoreSkill(skills, item.skillId, item.path, item.offset)?.content.startsWith(
            item.excerpt,
          ),
        ).toBe(true);
      expect(searchStoreSkills(skills, "宇宙旅行xyz未登録", 0).matches).toEqual([]);
    },
  );
  it("多数ファイルの検索と長いファイルの原文を上限付きで最後まで取得する", () => {
    const content =
      "# 駐車場 / Parking\n" + "駐車場の最新情報はスタッフへ相談してください。\n".repeat(220);
    const many = [
      {
        id: "restaurant",
        files: [
          { path: "SKILL.md", content },
          ...Array.from({ length: 29 }, (_, i) => ({ path: `references/${i}.md`, content })),
        ],
      },
    ];
    const result = searchStoreSkills(many, "駐車場", 0);
    expect(result.total).toBeGreaterThan(100);
    expect(result.matches).toHaveLength(5);
    expect(JSON.stringify(result).length).toBeLessThan(7500);
    expect(result.nextOffset).toBe(5);
    expect(searchStoreSkills(many, "駐車場", 5).matches[0]).not.toEqual(result.matches[0]);
    let offset = 0;
    let actual = "";
    for (;;) {
      const page = readStoreSkill(many, "restaurant", "SKILL.md", offset);
      assert(page);
      actual += page.content;
      if (page.nextOffset === null) break;
      offset = page.nextOffset;
    }
    expect(actual).toBe(content);
    expect(readStoreSkill(many, "other-store", "SKILL.md", 0)).toBeNull();
    expect(readStoreSkill(many, "restaurant", "missing.md", 0)).toBeNull();
    expect(readStoreSkill(many, "restaurant", "SKILL.md", content.length + 1)).toBeNull();
  });
});
