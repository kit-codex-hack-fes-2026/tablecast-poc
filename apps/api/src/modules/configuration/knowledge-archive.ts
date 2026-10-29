import { strToU8, Unzip, UnzipInflate, zipSync } from "fflate";
import { z } from "zod";
import { imageMetadataSchema, maxImageBytes, uploadImageSchema } from "../media/model";
import { readSkillMetadata } from "./knowledge-files";
import { type StoreSkill, storeSkillSchema, storeSkillsSchema } from "./knowledge-model";

export const skillArchiveLimits = {
  compressedBytes: maxImageBytes,
  expandedBytes: 20 * 1024 * 1024,
  entries: 250,
};
export const skillArchiveFilesSchema = z
  .object({
    data: z
      .string()
      .min(4)
      .max(4 * Math.ceil(maxImageBytes / 3))
      .optional(),
    file: uploadImageSchema.shape.file,
    replaceExisting: z.boolean().default(false),
    imageMetadata: imageMetadataSchema.optional(),
  })
  .strict();
export const skillArchiveImportSchema = skillArchiveFilesSchema.extend({
  expectedVersion: z.number().int().positive(),
});
const archiveManifestSchema = z
  .object({
    version: z.literal(1),
    images: z.record(z.string(), imageMetadataSchema.extend({ alt: z.string().max(300) })),
  })
  .strict();

// ZIPの中央ディレクトリを照合し、途中切断・暗号化・symlink・ZIP64を拒否する。
function archiveDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (
    end >= Math.max(0, bytes.length - 65557) &&
    (view.getUint32(end, true) !== 0x06054b50 ||
      end + 22 + view.getUint16(end + 20, true) !== bytes.length)
  )
    end--;
  if (end < Math.max(0, bytes.length - 65557)) throw new Error("KNOWLEDGE_ARCHIVE_INVALID");
  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true),
    start = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    count !== view.getUint16(end + 8, true) ||
    !count ||
    count > skillArchiveLimits.entries ||
    start + size !== end
  )
    throw new Error("KNOWLEDGE_ARCHIVE_INVALID");
  const directory = new Map<string, { crc: number; size: number }>();
  const names = new Set<string>();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let offset = start,
    total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("KNOWLEDGE_ARCHIVE_INVALID");
    const flags = view.getUint16(offset + 8, true),
      method = view.getUint16(offset + 10, true),
      compressed = view.getUint32(offset + 20, true),
      expanded = view.getUint32(offset + 24, true);
    const length = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true),
      local = view.getUint32(offset + 42, true);
    if (
      offset + 46 + length + extra + comment > end ||
      local + 30 > start ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      ((view.getUint32(offset + 38, true) >>> 16) & 0xf000) === 0xa000 ||
      view.getUint16(offset + 34, true)
    )
      throw new Error("KNOWLEDGE_ARCHIVE_INVALID");
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + length));
    if (!/^(?:[\w-]+\/)*[\w-][\w.-]*\/?$/.test(name) || names.has(name.toLowerCase()))
      throw new Error("KNOWLEDGE_ARCHIVE_PATH");
    names.add(name.toLowerCase());
    const localLength = view.getUint16(local + 26, true),
      localExtra = view.getUint16(local + 28, true);
    if (
      view.getUint32(local, true) !== 0x04034b50 ||
      local + 30 + localLength + localExtra + compressed > start ||
      decoder.decode(bytes.subarray(local + 30, local + 30 + localLength)) !== name ||
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== method
    )
      throw new Error("KNOWLEDGE_ARCHIVE_INVALID");
    total += expanded;
    if (expanded > maxImageBytes || total > skillArchiveLimits.expandedBytes)
      throw new Error("KNOWLEDGE_ARCHIVE_SIZE");
    if (!name.endsWith("/"))
      directory.set(name, { size: expanded, crc: view.getUint32(offset + 16, true) });
    offset += 46 + length + extra + comment;
  }
  if (offset !== end) throw new Error("KNOWLEDGE_ARCHIVE_INVALID");
  return directory;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crcTable[(crc ^ byte) & 255] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 展開中の実サイズも数え、偽のサイズ宣言やパス逸脱を保存前に拒否する。 */
export function unzipSkillArchive(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > skillArchiveLimits.compressedBytes)
    throw new Error("KNOWLEDGE_ARCHIVE_SIZE");
  const directory = archiveDirectory(bytes);
  const entries = new Map<string, Uint8Array>();
  const names = new Set<string>();
  let expanded = 0;
  let unfinished = 0;
  const unzip = new Unzip((file) => {
    const name = file.name;
    if (/^(?:[\w-]+\/)*$/.test(name) && name.endsWith("/")) return;
    if (!/^(?:[\w-]+\/)*[\w-][\w.-]*$/.test(name) || names.has(name.toLowerCase()))
      throw new Error("KNOWLEDGE_ARCHIVE_PATH");
    names.add(name.toLowerCase());
    if (names.size > skillArchiveLimits.entries || (file.originalSize ?? 0) > maxImageBytes)
      throw new Error("KNOWLEDGE_ARCHIVE_SIZE");
    unfinished++;
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      size += chunk.length;
      expanded += chunk.length;
      if (size > maxImageBytes || expanded > skillArchiveLimits.expandedBytes) {
        file.terminate();
        throw new Error("KNOWLEDGE_ARCHIVE_SIZE");
      }
      chunks.push(chunk);
      if (final) {
        const result = new Uint8Array(size);
        let offset = 0;
        for (const item of chunks) {
          result.set(item, offset);
          offset += item.length;
        }
        const declared = directory.get(name);
        if (!declared || declared.size !== size || declared.crc !== crc32(result))
          throw new Error("KNOWLEDGE_ARCHIVE_INVALID");
        entries.set(name, result);
        unfinished--;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += 1024)
    unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
  if (unfinished || !entries.size || entries.size !== directory.size)
    throw new Error("KNOWLEDGE_ARCHIVE_INVALID");
  return entries;
}

export function parseSkillArchive(
  bytes: Uint8Array,
  fallback?: z.infer<typeof imageMetadataSchema>,
) {
  const entries = unzipSkillArchive(bytes);
  const manifestBytes = entries.get("tablecast-skills.json");
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const manifest = manifestBytes
    ? archiveManifestSchema.parse(JSON.parse(decoder.decode(manifestBytes)))
    : undefined;
  entries.delete("tablecast-skills.json");
  const roots = [...entries.keys()].filter(
    (path) => path === "SKILL.md" || /^[\w-]+\/SKILL\.md$/.test(path),
  );
  if (roots.includes("SKILL.md") && roots.length > 1) throw new Error("KNOWLEDGE_ARCHIVE_PATH");
  if (!roots.length) throw new Error("KNOWLEDGE_SKILL_REQUIRED");
  const images: {
    bytes: Uint8Array;
    metadata: z.infer<typeof imageMetadataSchema>;
    path: string;
    skillId: string;
  }[] = [];
  const claimed = new Set<string>();
  const skills = roots.map((root): StoreSkill => {
    const content = decoder.decode(entries.get(root));
    const directory = root === "SKILL.md" ? "" : root.slice(0, -"SKILL.md".length);
    const id = directory ? directory.slice(0, -1) : readSkillMetadata(content)?.name;
    if (!id) throw new Error("KNOWLEDGE_ARCHIVE_METADATA");
    const files: StoreSkill["files"] = [];
    for (const [entry, data] of entries) {
      if (!entry.startsWith(directory)) continue;
      const path = entry.slice(directory.length);
      claimed.add(entry);
      if (/\.(png|jpe?g|webp)$/i.test(path)) {
        const metadata = manifest?.images[`${id}/${path}`] ?? fallback;
        if (!metadata) throw new Error("KNOWLEDGE_ARCHIVE_IMAGE_SOURCE");
        images.push({
          skillId: id,
          path,
          bytes: data,
          metadata: { imageKind: metadata.imageKind, imageSource: metadata.imageSource },
        });
        files.push({
          path,
          imageKey: "tablecast/archive-pending.webp",
          ...metadata,
          alt: manifest?.images[`${id}/${path}`]?.alt ?? path,
        });
      } else {
        if (data.length > 4 * 32000) throw new Error("KNOWLEDGE_ARCHIVE_SIZE");
        files.push({ path, content: decoder.decode(data) });
      }
    }
    return storeSkillSchema.parse({ id, files });
  });
  if (claimed.size !== entries.size) throw new Error("KNOWLEDGE_ARCHIVE_PATH");
  return { skills: storeSkillsSchema.parse(skills), images };
}

export function mergeSkillArchive(
  existing: StoreSkill[],
  imported: StoreSkill[],
  replaceExisting: boolean,
) {
  if (!replaceExisting && imported.some((skill) => existing.some((old) => old.id === skill.id)))
    throw new Error("KNOWLEDGE_SKILL_EXISTS");
  const ids = new Set(imported.map((skill) => skill.id));
  return storeSkillsSchema.parse([...existing.filter((skill) => !ids.has(skill.id)), ...imported]);
}

export function zipSkillArchive(skills: StoreSkill[], images: Map<string, Uint8Array>) {
  const entries: Record<string, Uint8Array> = {};
  const metadata: z.infer<typeof archiveManifestSchema>["images"] = {};
  for (const skill of skills)
    for (const file of skill.files) {
      const path = `${skill.id}/${file.path}`;
      if ("content" in file) entries[path] = strToU8(file.content);
      else {
        const bytes = images.get(path);
        if (!bytes) throw new Error("MEDIA_NOT_FOUND");
        entries[path] = bytes;
        metadata[path] = {
          imageKind: file.imageKind,
          imageSource: file.imageSource,
          alt: file.alt,
        };
      }
    }
  entries["tablecast-skills.json"] = strToU8(JSON.stringify({ version: 1, images: metadata }));
  const result = zipSync(entries, { level: 0 });
  if (result.length > skillArchiveLimits.compressedBytes) throw new Error("KNOWLEDGE_ARCHIVE_SIZE");
  return result;
}
