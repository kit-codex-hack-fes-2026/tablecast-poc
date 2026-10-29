import { z } from "zod";
import { productSchema } from "../catalog/model";
import { imageMetadataSchema } from "../media/model";

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
const textFileSchema = z
  .object({ path: storeSkillPathSchema, content: z.string().max(storeSkillLimits.fileCharacters) })
  .strict();
const imageFileSchema = imageMetadataSchema
  .extend({
    path: storeSkillPathSchema.regex(/\.(png|jpe?g|webp)$/i),
    imageKey: productSchema.shape.imageKey.unwrap().unwrap(),
    alt: z.string().max(300).default(""),
  })
  .strict();
const storeSkillFileSchema = z.union([textFileSchema, imageFileSchema]);
export const storeSkillSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    files: z.array(storeSkillFileSchema).min(1).max(storeSkillLimits.files),
  })
  .strict()
  .superRefine((skill, ctx) => {
    if (
      !skill.files.some(
        (file) => file.path === "SKILL.md" && "content" in file && file.content.trim(),
      )
    )
      ctx.addIssue({ code: "custom", path: ["files"], message: "SKILL.mdが必要です。" });
    const paths = new Set<string>();
    skill.files.forEach((file, index) => {
      const path = file.path.toLowerCase();
      if (
        paths.has(path) ||
        skill.files.some(
          (other) =>
            other.path.toLowerCase().startsWith(`${path}/`) ||
            path.startsWith(`${other.path.toLowerCase()}/`),
        )
      )
        ctx.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "ファイルパスが重複しています。",
        });
      paths.add(path);
    });
  });

export const storeSkillsSchema = z
  .array(storeSkillSchema)
  .max(storeSkillLimits.skills)
  .superRefine((skills, ctx) => {
    if (new Set(skills.map((skill) => skill.id)).size !== skills.length)
      ctx.addIssue({ code: "custom", message: "SkillのIDが重複しています。" });
    if (
      skills.reduce(
        (sum, skill) =>
          sum +
          skill.files.reduce(
            (size, file) => size + ("content" in file ? file.content.length : 0),
            0,
          ),
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
