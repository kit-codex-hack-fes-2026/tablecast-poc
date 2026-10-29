import { marked } from "marked";
import { parseDocument, stringify } from "yaml";
import { z } from "zod";
import { type StoreSkill, storeSkillSchema, storeSkillsSchema } from "./knowledge-model";

export const skillMetadataSchema = z
  .object({
    name: storeSkillSchema.shape.id,
    description: z.string().trim().min(1).max(1024),
    license: z.string().optional(),
    compatibility: z.string().max(500).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    "allowed-tools": z.string().optional(),
  })
  .strict();
export const knowledgeIssueCodes = [
  "SKILL_REQUIRED",
  "FRONTMATTER_REQUIRED",
  "FRONTMATTER_INVALID",
  "METADATA_INVALID",
  "NAME_MISMATCH",
  "BODY_EMPTY",
  "BODY_LONG",
  "REFERENCE_MISSING",
] as const;
export type KnowledgeIssue = {
  code: (typeof knowledgeIssueCodes)[number];
  line: number;
  path: string;
  reference?: string;
  severity: "error" | "warning";
  skillId: string;
};

export function skillFrontmatter(content: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  return {
    header: match?.[0] ?? "",
    yaml: match?.[1] ?? "",
    body: match ? content.slice(match[0].length) : content,
  };
}

export function readSkillMetadata(content: string) {
  const parts = skillFrontmatter(content);
  if (!parts.header) return undefined;
  try {
    const document = parseDocument(parts.yaml, { uniqueKeys: true });
    if (document.errors.length) return undefined;
    const value: unknown = document.toJS({ maxAliasCount: 0 });
    const result = skillMetadataSchema.safeParse(value);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function resolveSkillReference(from: string, href: string) {
  if (!href || /^[a-z][a-z0-9+.-]*:|^\/\/|^#/i.test(href)) return undefined;
  try {
    return decodeURIComponent(new URL(href, `https://tablecast.invalid/${from}`).pathname.slice(1));
  } catch {
    return undefined;
  }
}

/** Agent Skills仕様のmetadataと店舗資料の参照整合を同じ規則で検査する。 */
export function lintStoreSkills(skills: StoreSkill[]): KnowledgeIssue[] {
  return skills.flatMap((skill) => {
    const issues: KnowledgeIssue[] = [];
    const add = (
      code: KnowledgeIssue["code"],
      path = "SKILL.md",
      line = 1,
      severity: KnowledgeIssue["severity"] = "error",
      reference?: string,
    ) =>
      issues.push({
        code,
        path,
        line,
        severity,
        skillId: skill.id,
        ...(reference ? { reference } : {}),
      });
    const root = skill.files.find((file) => file.path === "SKILL.md");
    if (!root || !("content" in root)) add("SKILL_REQUIRED");
    else {
      const parts = skillFrontmatter(root.content);
      if (!parts.header) add("FRONTMATTER_REQUIRED");
      else {
        try {
          const document = parseDocument(parts.yaml, { uniqueKeys: true });
          if (document.errors.length) add("FRONTMATTER_INVALID");
          else {
            const value: unknown = document.toJS({ maxAliasCount: 0 });
            const metadata = skillMetadataSchema.safeParse(value);
            if (!metadata.success) add("METADATA_INVALID");
            else if (metadata.data.name !== skill.id) add("NAME_MISMATCH");
          }
        } catch {
          add("FRONTMATTER_INVALID");
        }
      }
      if (!parts.body.trim()) add("BODY_EMPTY");
      if (root.content.split("\n").length > 500) add("BODY_LONG", "SKILL.md", 1, "warning");
    }
    for (const file of skill.files) {
      if (!("content" in file) || !/\.md$/i.test(file.path)) continue;
      const parts =
        file.path === "SKILL.md"
          ? skillFrontmatter(file.content)
          : { body: file.content, header: "" };
      // Markdownのtokenを使い、参照形式リンクも検査し、コード内の例は除外する。
      const tokens = marked.lexer(parts.body);
      void marked.walkTokens(tokens, (token) => {
        if (token.type !== "link" && token.type !== "image") return;
        const href: unknown = token.href;
        if (typeof href !== "string") return;
        const path = resolveSkillReference(file.path, href);
        if (path && !skill.files.some((item) => item.path === path)) {
          const start = file.content.indexOf(token.raw, parts.header.length);
          add(
            "REFERENCE_MISSING",
            file.path,
            file.content.slice(0, Math.max(0, start)).split("\n").length,
            "error",
            path,
          );
        }
      });
    }
    return issues.filter(
      (issue, index) =>
        issues.findIndex(
          (other) =>
            other.code === issue.code &&
            other.path === issue.path &&
            other.line === issue.line &&
            other.reference === issue.reference,
        ) === index,
    );
  });
}

/** 指摘が多い資料でもtool応答を肥大化させず、続きを明示する。 */
export function knowledgeLintPage(skills: StoreSkill[], offset = 0) {
  const issues = lintStoreSkills(skills);
  const end = Math.min(offset + 50, issues.length);
  return {
    issues: issues.slice(offset, end),
    totalIssues: issues.length,
    nextOffset: end < issues.length ? end : null,
  };
}

export const knowledgeEditSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create-skill"), skill: storeSkillSchema }),
  z.object({ type: z.literal("delete-skill"), skillId: storeSkillSchema.shape.id }),
  z.object({
    type: z.literal("rename-skill"),
    skillId: storeSkillSchema.shape.id,
    newId: storeSkillSchema.shape.id,
  }),
  z.object({
    type: z.literal("put-file"),
    skillId: storeSkillSchema.shape.id,
    file: storeSkillSchema.shape.files.element,
  }),
  z.object({
    type: z.literal("rename-file"),
    skillId: storeSkillSchema.shape.id,
    path: z.string(),
    newPath: z.string(),
  }),
  z.object({
    type: z.literal("delete-file"),
    skillId: storeSkillSchema.shape.id,
    path: z.string(),
  }),
]);

/** GUIの未保存編集とMCPの版付き保存でファイル操作の規則を共有する。 */
export function editStoreSkills(
  skills: StoreSkill[],
  input: z.infer<typeof knowledgeEditSchema>,
): StoreSkill[] {
  const action = knowledgeEditSchema.parse(input);
  if (action.type === "create-skill") return storeSkillsSchema.parse([...skills, action.skill]);
  const skill = skills.find((item) => item.id === action.skillId);
  if (!skill) throw new Error("KNOWLEDGE_FILE_NOT_FOUND");
  if (action.type === "delete-skill") return skills.filter((item) => item !== skill);
  let next = skill;
  if (action.type === "rename-skill") {
    next = {
      ...skill,
      id: action.newId,
      files: skill.files.map((file) => {
        if (file.path !== "SKILL.md" || !("content" in file)) return file;
        const metadata = readSkillMetadata(file.content);
        return metadata
          ? {
              ...file,
              content: `---\n${stringify({ ...metadata, name: action.newId })}---\n${skillFrontmatter(file.content).body}`,
            }
          : file;
      }),
    };
  } else if (action.type === "put-file") {
    next = {
      ...skill,
      files: [...skill.files.filter((file) => file.path !== action.file.path), action.file],
    };
  } else {
    if (action.path === "SKILL.md") throw new Error("KNOWLEDGE_SKILL_REQUIRED");
    if (!skill.files.some((file) => file.path === action.path))
      throw new Error("KNOWLEDGE_FILE_NOT_FOUND");
    next = {
      ...skill,
      files:
        action.type === "delete-file"
          ? skill.files.filter((file) => file.path !== action.path)
          : skill.files.map((file) =>
              file.path === action.path ? { ...file, path: action.newPath } : file,
            ),
    };
  }
  return storeSkillsSchema.parse(skills.map((item) => (item === skill ? next : item)));
}
