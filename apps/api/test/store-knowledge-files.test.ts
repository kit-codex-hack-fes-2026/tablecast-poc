import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { StoreSkill } from "../src/modules/configuration/knowledge-model";
import {
  mergeSkillArchive,
  parseSkillArchive,
  unzipSkillArchive,
  zipSkillArchive,
} from "../src/modules/configuration/knowledge-archive";
import {
  editStoreSkills,
  knowledgeLintPage,
  lintStoreSkills,
  skillFrontmatter,
} from "../src/modules/configuration/knowledge-files";
const content =
  "---\nname: restaurant\ndescription: 店舗の接客資料\n---\n# 店舗案内\n[営業](references/visit.md)";
const skills: StoreSkill[] = [
  {
    id: "restaurant",
    files: [
      { path: "SKILL.md", content },
      { path: "references/visit.md", content: "# 営業\n17時から" },
    ],
  },
];
const archive = (extra: Record<string, Uint8Array> = {}) =>
  zipSync({
    "restaurant/SKILL.md": strToU8(content),
    "restaurant/references/visit.md": strToU8("営業時間"),
    ...extra,
  });

describe("Agent Skillsの検査とファイル操作", () => {
  it("SKILL.md・frontmatterの必須項目とSkill名、参照先を検査する", () => {
    expect(lintStoreSkills(skills)).toEqual([]);
    expect(lintStoreSkills([{ id: "missing", files: [] }])[0]?.code).toBe("SKILL_REQUIRED");
    for (const [text, code] of [
      ["# 本文", "FRONTMATTER_REQUIRED"],
      [
        "---\nname: restaurant\nname: duplicate\ndescription: 説明\n---\n本文",
        "FRONTMATTER_INVALID",
      ],
      ["---\nname: restaurant\ndescription: ''\n---\n本文", "METADATA_INVALID"],
      ["---\nname: wrong\ndescription: 説明\n---\n本文", "NAME_MISMATCH"],
      ["---\nname: restaurant\ndescription: 説明\n---\n", "BODY_EMPTY"],
    ])
      expect(
        lintStoreSkills([
          { id: "restaurant", files: [{ path: "SKILL.md", content: text ?? "" }] },
        ]).map((issue) => issue.code),
      ).toContain(code);
    expect(
      lintStoreSkills([{ id: "restaurant", files: [{ path: "SKILL.md", content }] }]),
    ).toContainEqual(
      expect.objectContaining({
        code: "REFERENCE_MISSING",
        reference: "references/visit.md",
        line: 6,
      }),
    );
    expect(
      lintStoreSkills([
        {
          id: "restaurant",
          files: [
            {
              path: "SKILL.md",
              content: `${content.split("[営業]")[0]}\n\`\`\`md\n[x](missing.md)\n\`\`\``,
            },
          ],
        },
      ]),
    ).toEqual([]);
  });
  it("YAML aliasを展開せず、長い本文は警告にとどめる", () => {
    expect(
      lintStoreSkills([
        {
          id: "restaurant",
          files: [
            {
              path: "SKILL.md",
              content: "---\nname: &name restaurant\ndescription: *name\n---\n本文",
            },
          ],
        },
      ])[0]?.code,
    ).toBe("FRONTMATTER_INVALID");
    expect(
      lintStoreSkills([
        {
          id: "restaurant",
          files: [
            { path: "SKILL.md", content: `${content.split("[営業]")[0]}${"\n行".repeat(501)}` },
          ],
        },
      ]),
    ).toEqual([expect.objectContaining({ code: "BODY_LONG", severity: "warning" })]);
  });
  it("Skill改名でmetadataと原文を保ち、ファイルの作成・更新・改名・削除を共通操作で行う", () => {
    let next = editStoreSkills(skills, {
      type: "rename-skill",
      skillId: "restaurant",
      newId: "visit",
    });
    const root = next[0]?.files[0];
    expect(root && "content" in root ? skillFrontmatter(root.content).body : "").toBe(
      skillFrontmatter(content).body,
    );
    expect(lintStoreSkills(next)).toEqual([]);
    next = editStoreSkills(next, {
      type: "put-file",
      skillId: "visit",
      file: { path: "references/new.md", content: "追加" },
    });
    next = editStoreSkills(next, {
      type: "put-file",
      skillId: "visit",
      file: { path: "references/new.md", content: "更新" },
    });
    next = editStoreSkills(next, {
      type: "rename-file",
      skillId: "visit",
      path: "references/new.md",
      newPath: "references/updated.md",
    });
    expect(next[0]?.files).toContainEqual({ path: "references/updated.md", content: "更新" });
    next = editStoreSkills(next, {
      type: "delete-file",
      skillId: "visit",
      path: "references/updated.md",
    });
    expect(next[0]?.files).toHaveLength(2);
    expect(() =>
      editStoreSkills(next, { type: "delete-file", skillId: "visit", path: "SKILL.md" }),
    ).toThrow("KNOWLEDGE_SKILL_REQUIRED");
    expect(() =>
      editStoreSkills(next, {
        type: "rename-file",
        skillId: "visit",
        path: "references/visit.md",
        newPath: "../escape.md",
      }),
    ).toThrow(Error);
    expect(editStoreSkills(next, { type: "delete-skill", skillId: "visit" })).toEqual([]);
  });
});

describe("店舗資料ZIPの移植と容量・整合性", () => {
  it("複数Skill・画像・出所をZIPで往復し、店舗の画像キーを持ち出さない", () => {
    const image = {
      path: "assets/seat.webp",
      imageKey: "tablecast/uploads/private.webp",
      imageKind: "photograph" as const,
      imageSource: { generated: false, description: "店主撮影" },
      alt: "客席",
    };
    const value = [
      ...skills.map((skill) => ({ ...skill, files: [...skill.files, image] })),
      {
        id: "wine",
        files: [
          {
            path: "SKILL.md",
            content: "---\nname: wine\ndescription: ワイン\n---\nワインは店員へ",
          },
        ],
      },
    ];
    const bytes = zipSkillArchive(
      value,
      new Map([["restaurant/assets/seat.webp", new Uint8Array([1, 2, 3])]]),
    );
    const parsed = parseSkillArchive(bytes);
    expect(parsed.skills).toHaveLength(2);
    expect(parsed.images[0]).toMatchObject({
      skillId: "restaurant",
      path: image.path,
      metadata: { imageKind: image.imageKind, imageSource: image.imageSource },
    });
    expect(parsed.skills[0]?.files).toContainEqual(
      expect.objectContaining({ path: image.path, alt: "客席" }),
    );
    expect(new TextDecoder().decode(bytes)).not.toContain(image.imageKey);
    expect(lintStoreSkills(parsed.skills)).toEqual([]);
  });
  it("ルート直下の標準Skillも読めるが、出所のない画像とSkillの混在を拒否する", () => {
    expect(
      parseSkillArchive(zipSync({ "SKILL.md": strToU8(content.split("[営業]")[0] ?? "") }))
        .skills[0]?.id,
    ).toBe("restaurant");
    expect(() =>
      parseSkillArchive(archive({ "restaurant/assets/seat.png": new Uint8Array([1]) })),
    ).toThrow("KNOWLEDGE_ARCHIVE_IMAGE_SOURCE");
    expect(() => parseSkillArchive(archive({ "SKILL.md": strToU8(content) }))).toThrow(
      "KNOWLEDGE_ARCHIVE_PATH",
    );
    expect(() => parseSkillArchive(zipSync({ "restaurant/README.md": strToU8("資料") }))).toThrow(
      "KNOWLEDGE_SKILL_REQUIRED",
    );
  });
  it("同名Skillは明示した置換だけを認め、他のSkillを保持する", () => {
    expect(() => mergeSkillArchive(skills, skills, false)).toThrow("KNOWLEDGE_SKILL_EXISTS");
    const other = { id: "other", files: [{ path: "SKILL.md", content: "本文" }] };
    expect(mergeSkillArchive([...skills, other], skills, true)).toEqual([other, ...skills]);
  });
  it.each(["../escape.md", "/escape.md", "restaurant/../../escape.md", "restaurant/a\\b.md"])(
    "逸脱パス%sを拒否する",
    (path) => {
      expect(() => unzipSkillArchive(archive({ [path]: strToU8("不可") }))).toThrow(
        "KNOWLEDGE_ARCHIVE_PATH",
      );
    },
  );
  it("途中切断・本文破損・大文字小文字の重複・展開後の上限超過を拒否する", () => {
    const bytes = archive();
    expect(() => unzipSkillArchive(bytes.subarray(0, bytes.length - 5))).toThrow(Error);
    const stored = zipSkillArchive(skills, new Map());
    const corrupted = new Uint8Array(stored);
    const nameLength = new DataView(corrupted.buffer).getUint16(26, true);
    corrupted[30 + nameLength] = (corrupted[30 + nameLength] ?? 0) ^ 1;
    expect(() => unzipSkillArchive(corrupted)).toThrow("KNOWLEDGE_ARCHIVE_INVALID");
    expect(() => unzipSkillArchive(archive({ "restaurant/skill.md": strToU8("重複") }))).toThrow(
      "KNOWLEDGE_ARCHIVE_PATH",
    );
    expect(() =>
      unzipSkillArchive(archive({ "restaurant/big.txt": new Uint8Array(6 * 1024 * 1024) })),
    ).toThrow("KNOWLEDGE_ARCHIVE_SIZE");
  });
});

it("大量のlint指摘を50件ずつ返し、残りの件数と位置を明示する", () => {
  const files = [
    {
      path: "SKILL.md",
      content: `---\nname: restaurant\ndescription: 店舗資料\n---\n${Array.from({ length: 60 }, (_, index) => `[参照](references/missing-${index}.md)`).join("\n")}`,
    },
  ];
  const first = knowledgeLintPage([{ id: "restaurant", files }]);
  expect(first.issues).toHaveLength(50);
  expect(first).toMatchObject({ totalIssues: 60, nextOffset: 50 });
  const second = knowledgeLintPage([{ id: "restaurant", files }], 50);
  expect(second).toMatchObject({ totalIssues: 60, nextOffset: null });
  expect(second.issues).toHaveLength(10);
  expect(second.issues.at(-1)?.reference).toBe("references/missing-59.md");
});
