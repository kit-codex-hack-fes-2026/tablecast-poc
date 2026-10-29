import type { z } from "zod";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { DomainError, ensure } from "../../platform/errors";
import { requireManager, requireManagerRead } from "../auth/policy";
import { getCatalog } from "../catalog/queries";
import {
  downloadUploadedFile,
  imageMimeType,
  requireImageAssets,
  saveMenuImage,
} from "../media/service";
import { readStoreSkill } from "./knowledge";
import {
  mergeSkillArchive,
  parseSkillArchive,
  type skillArchiveFilesSchema,
  skillArchiveImportSchema,
  skillArchiveLimits,
  zipSkillArchive,
} from "./knowledge-archive";
import {
  editStoreSkills,
  type knowledgeEditSchema,
  lintStoreSkills,
  readSkillMetadata,
} from "./knowledge-files";
import { getDraft } from "./queries";
import { updateDraft } from "./use-cases/drafts";

export async function knowledgeSource(services: ApiServices, actor: Actor, draftId?: string) {
  requireManagerRead(actor);
  if (draftId) return getDraft(services, actor, draftId);
  return getCatalog(services, actor.storeId);
}

export function knowledgeSummary(
  skills: NonNullable<
    Awaited<ReturnType<typeof knowledgeSource>>["configuration"]["cast"]["skills"]
  >,
) {
  return skills.map((skill) => ({
    id: skill.id,
    metadata: readSkillMetadata(
      skill.files.flatMap((file) =>
        file.path === "SKILL.md" && "content" in file ? [file.content] : [],
      )[0] ?? "",
    ),
    files: skill.files.map((file) => ({
      path: file.path,
      kind: "content" in file ? "text" : "image",
      characters: "content" in file ? file.content.length : 0,
    })),
  }));
}

function archiveError(error: unknown): never {
  if (error instanceof DomainError) throw error;
  const code =
    error instanceof Error && /^KNOWLEDGE_[A-Z_]+$/.test(error.message)
      ? error.message
      : "KNOWLEDGE_ARCHIVE_INVALID";
  throw new DomainError(code, 422, code);
}

export async function editDraftKnowledge(
  services: ApiServices,
  actor: Actor,
  draftId: string,
  expectedVersion: number,
  action: z.infer<typeof knowledgeEditSchema>,
) {
  requireManager(actor);
  const draft = await getDraft(services, actor, draftId);
  ensure(draft.version === expectedVersion, "DRAFT_CONFLICT");
  let skills;
  try {
    skills = editStoreSkills(draft.configuration.cast.skills ?? [], action);
  } catch (error) {
    return archiveError(error);
  }
  return updateDraft(services, actor, draftId, {
    expectedVersion,
    instructionFormatVersion: 1,
    configuration: { ...draft.configuration, cast: { ...draft.configuration.cast, skills } },
  });
}

export async function importDraftKnowledge(
  services: ApiServices,
  actor: Actor,
  draftId: string,
  input: z.infer<typeof skillArchiveImportSchema>,
) {
  requireManager(actor);
  const parsed = skillArchiveImportSchema.parse(input);
  ensure(Boolean(parsed.file) !== Boolean(parsed.data), "KNOWLEDGE_ARCHIVE_INPUT", 422);
  const draft = await getDraft(services, actor, draftId);
  ensure(
    draft.version === parsed.expectedVersion && ["draft", "ready"].includes(draft.status),
    "DRAFT_CONFLICT",
  );
  const skills = await importKnowledgeFiles(
    services,
    actor,
    draft.configuration.cast.skills ?? [],
    parsed,
  );
  return updateDraft(services, actor, draftId, {
    expectedVersion: parsed.expectedVersion,
    instructionFormatVersion: 1,
    configuration: { ...draft.configuration, cast: { ...draft.configuration.cast, skills } },
  });
}

export async function importKnowledgeFiles(
  services: ApiServices,
  actor: Actor,
  existing: NonNullable<
    Awaited<ReturnType<typeof knowledgeSource>>["configuration"]["cast"]["skills"]
  >,
  parsed: z.infer<typeof skillArchiveFilesSchema>,
) {
  requireManager(actor);
  ensure(Boolean(parsed.file) !== Boolean(parsed.data), "KNOWLEDGE_ARCHIVE_INPUT", 422);
  try {
    const bytes = parsed.file
      ? new Uint8Array(await (await downloadUploadedFile(parsed.file)).arrayBuffer())
      : Uint8Array.fromBase64(parsed.data ?? "", { lastChunkHandling: "strict" });
    const archive = parseSkillArchive(bytes, parsed.imageMetadata);
    const issues = lintStoreSkills(archive.skills);
    ensure(!issues.some((issue) => issue.severity === "error"), "KNOWLEDGE_LINT_FAILED", 422, {
      issues,
    });
    // 容量・重複・全参照を検査してから画像を取り込み、下書きは最後に一度だけ更新する。
    mergeSkillArchive(existing, archive.skills, parsed.replaceExisting);
    for (const image of archive.images) {
      const uploaded = await saveMenuImage(
        services,
        actor,
        new File([new Uint8Array(image.bytes).buffer], image.path, {
          type: imageMimeType(image.bytes),
        }),
        image.metadata,
      );
      archive.skills = archive.skills.map((skill) =>
        skill.id !== image.skillId
          ? skill
          : {
              ...skill,
              files: skill.files.map((file) =>
                file.path === image.path ? { ...file, imageKey: uploaded.imageKey } : file,
              ),
            },
      );
    }
    const skills = mergeSkillArchive(existing, archive.skills, parsed.replaceExisting);
    return skills;
  } catch (error) {
    return archiveError(error);
  }
}

export async function exportKnowledge(
  services: ApiServices,
  actor: Actor,
  draftId?: string,
  skillId?: string,
  inputSkills?: NonNullable<
    Awaited<ReturnType<typeof knowledgeSource>>["configuration"]["cast"]["skills"]
  >,
) {
  requireManagerRead(actor);
  const source = inputSkills ? undefined : await knowledgeSource(services, actor, draftId);
  const skills = (inputSkills ?? source?.configuration.cast.skills ?? []).filter(
    (skill) => !skillId || skill.id === skillId,
  );
  ensure(skills.length, "KNOWLEDGE_FILE_NOT_FOUND", 404);
  const files = skills.flatMap((skill) =>
    skill.files.flatMap((file) =>
      "imageKey" in file ? [{ ...file, archivePath: `${skill.id}/${file.path}` }] : [],
    ),
  );
  await requireImageAssets(
    services,
    actor,
    files
      .filter((file) => file.imageKey.startsWith("tablecast/uploads/"))
      .map((file) => ({ ...file, verifySource: true })),
  );
  const images = new Map<string, Uint8Array>();
  const cache = new Map<string, Uint8Array>();
  let totalBytes = skills.reduce(
    (sum, skill) =>
      sum +
      skill.files.reduce(
        (size, file) =>
          size + ("content" in file ? new TextEncoder().encode(file.content).length : 0),
        0,
      ),
    0,
  );
  for (const file of files) {
    // 拡張子別に変換し、同じ素材を再利用する。総量を超えたら次のR2読取前に止める。
    const format = /\.png$/i.test(file.path)
      ? "image/png"
      : /\.jpe?g$/i.test(file.path)
        ? "image/jpeg"
        : "image/webp";
    const cacheKey = `${file.imageKey}:${format}`;
    let bytes = cache.get(cacheKey);
    if (!bytes) {
      const object = await services.env.TABLECAST_MEDIA.get(file.imageKey);
      ensure(object, "MEDIA_NOT_FOUND", 404);
      ensure(object.size <= skillArchiveLimits.compressedBytes, "KNOWLEDGE_ARCHIVE_SIZE", 422);
      const original = await object.arrayBuffer();
      const converted =
        object.httpMetadata?.contentType === format
          ? original
          : await (
              await services.env.TABLECAST_IMAGES.input(
                new ReadableStream<Uint8Array>({
                  start(controller) {
                    controller.enqueue(new Uint8Array(original));
                    controller.close();
                  },
                }),
              ).output({ format })
            )
              .response()
              .arrayBuffer();
      bytes = new Uint8Array(converted);
      cache.set(cacheKey, bytes);
    }
    totalBytes += bytes.length;
    ensure(totalBytes <= skillArchiveLimits.compressedBytes, "KNOWLEDGE_ARCHIVE_SIZE", 422);
    images.set(file.archivePath, bytes);
  }
  try {
    return { bytes: zipSkillArchive(skills, images), version: source?.version ?? null };
  } catch (error) {
    return archiveError(error);
  }
}

export async function readKnowledgeFile(
  services: ApiServices,
  actor: Actor,
  input: {
    draftId?: string;
    expectedVersion?: number;
    offset: number;
    path: string;
    skillId: string;
  },
) {
  const source = await knowledgeSource(services, actor, input.draftId);
  ensure(
    input.offset === 0 || input.expectedVersion !== undefined,
    "KNOWLEDGE_VERSION_REQUIRED",
    422,
  );
  ensure(
    input.expectedVersion === undefined || input.expectedVersion === source.version,
    "KNOWLEDGE_VERSION_STALE",
    409,
  );
  const file = readStoreSkill(
    source.configuration.cast.skills ?? [],
    input.skillId,
    input.path,
    input.offset,
  );
  ensure(file, "KNOWLEDGE_FILE_NOT_FOUND", 404);
  return { version: source.version, ...file };
}
