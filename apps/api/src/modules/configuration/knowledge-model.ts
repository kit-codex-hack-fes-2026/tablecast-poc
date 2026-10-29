import { z } from "zod";

export const storeSkillLimits = {
  skills: 8,
  files: 30,
  fileCharacters: 32000,
  totalCharacters: 256000,
};
const storeSkillPathSchema = z
  .string()
  .max(160)
  .regex(/^(?:[\w-]+\/)*[\w-][\w.-]*$/);
export const storeSkillSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    files: z
      .array(
        z
          .object({
            path: storeSkillPathSchema,
            content: z.string().max(storeSkillLimits.fileCharacters),
          })
          .strict(),
      )
      .min(1)
      .max(storeSkillLimits.files),
  })
  .strict()
  .superRefine((skill, ctx) => {
    if (!skill.files.some((file) => file.path === "SKILL.md" && file.content.trim()))
      ctx.addIssue({ code: "custom", path: ["files"], message: "SKILL.mdが必要です。" });
    const paths = new Set<string>();
    skill.files.forEach((file, index) => {
      const path = file.path.toLowerCase();
      if (paths.has(path))
        ctx.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "ファイルパスが重複しています。",
        });
      paths.add(path);
    });
  })
  .meta({ id: "tablecastStoreSkill" });

export const storeSkillsSchema = z
  .array(storeSkillSchema)
  .max(storeSkillLimits.skills)
  .superRefine((skills, ctx) => {
    if (new Set(skills.map((skill) => skill.id)).size !== skills.length)
      ctx.addIssue({ code: "custom", message: "SkillのIDが重複しています。" });
    if (
      skills.reduce(
        (sum, skill) => sum + skill.files.reduce((size, file) => size + file.content.length, 0),
        0,
      ) > storeSkillLimits.totalCharacters
    )
      ctx.addIssue({ code: "custom", message: "店舗資料全体は256000文字以内にしてください。" });
  });
export type StoreSkill = z.infer<typeof storeSkillSchema>;

export const knowledgeSearchSchema = z
  .object({
    query: z.string().trim().max(200).default(""),
    offset: z.number().int().min(0).max(10000).default(0),
    version: z.number().int().positive().optional(),
  })
  .strict();
export const knowledgeReadSchema = z
  .object({
    skillId: storeSkillSchema.shape.id,
    path: storeSkillPathSchema.default("SKILL.md"),
    offset: z.number().int().min(0).max(storeSkillLimits.fileCharacters).default(0),
    version: z.number().int().positive(),
  })
  .strict();
