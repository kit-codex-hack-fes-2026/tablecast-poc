import Fuse from "fuse.js";
import type { StoreSkill } from "./knowledge-model";

const pageSize = 5;
const chunkCharacters = 1200;
const normalise = (text: string) => text.normalize("NFKC").toLowerCase();

/** 公開設定の参照資料だけを検索し、原文位置を維持した抜粋を返す。 */
export function searchStoreSkills(skills: StoreSkill[], query: string, offset: number) {
  if (!query.trim()) {
    const items = skills.map((skill) => ({
      skillId: skill.id,
      path: "SKILL.md",
      excerpt:
        skill.files.flatMap((file) =>
          file.path === "SKILL.md" && "content" in file ? [file.content.slice(0, 600)] : [],
        )[0] ?? "",
      fileCount: skill.files.length,
    }));
    return {
      skills: items.slice(offset, offset + pageSize),
      matches: [],
      total: items.length,
      nextOffset: offset + pageSize < items.length ? offset + pageSize : null,
    };
  }
  const chunks = skills.flatMap((skill) =>
    skill.files.flatMap((file) => {
      const text =
        "content" in file ? file.content : `${file.alt}\n${file.imageSource.description}`;
      const result = [];
      for (let start = 0; start < text.length; start += chunkCharacters - 160) {
        const excerpt = text.slice(start, start + chunkCharacters);
        result.push({
          skillId: skill.id,
          path: file.path,
          offset: start,
          excerpt,
          text: normalise(excerpt),
          name: normalise(`${skill.id}/${file.path}`),
        });
        if (start + chunkCharacters >= text.length) break;
      }
      return result;
    }),
  );
  const matches = new Fuse(chunks, {
    keys: ["text", "name"],
    ignoreLocation: true,
    threshold: 0.25,
    useTokenSearch: true,
    tokenMatch: "any",
    tokenize: /\S+/g,
  }).search(normalise(query));
  return {
    skills: [],
    matches: matches
      .slice(offset, offset + pageSize)
      .map(({ item: { text: _text, name: _name, ...item } }) => item),
    total: matches.length,
    nextOffset: offset + pageSize < matches.length ? offset + pageSize : null,
  };
}

export function readStoreSkill(
  skills: StoreSkill[],
  skillId: string,
  path: string,
  offset: number,
) {
  const skill = skills.find((item) => item.id === skillId);
  const file = skill?.files.find((item) => item.path === path);
  if (!skill || !file) return null;
  if (!("content" in file))
    return offset === 0
      ? {
          skillId,
          path,
          kind: "image",
          imageKey: file.imageKey,
          alt: file.alt,
          imageSource: file.imageSource,
          files: skill.files.map((item) => item.path),
          nextOffset: null,
          content: `${file.alt}\n${file.imageSource.description}`,
          offset,
          totalCharacters: file.alt.length + 1 + file.imageSource.description.length,
        }
      : null;
  if (offset > file.content.length) return null;
  const content = file.content.slice(offset, offset + 4000);
  return {
    skillId,
    path,
    content,
    offset,
    totalCharacters: file.content.length,
    nextOffset: offset + content.length < file.content.length ? offset + content.length : null,
    files: skill.files.map((item) => item.path),
  };
}
