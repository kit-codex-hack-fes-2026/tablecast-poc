import Fuse from "fuse.js";
import type { Configuration } from "../configuration/model";

type MenuSection = "categories" | "plans" | "products";
type SearchDocument = {
  categories: string[];
  categoryId?: string;
  descriptions: string[];
  id: string;
  names: string[];
};

function normalise(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
    .trim()
    .replace(/\s+/g, " ");
}

function searchFields(text: Configuration["categories"][number]["text"]) {
  const names = Object.values(text).flatMap((value) => [
    value.displayName,
    value.speechName,
    ...value.aliases,
  ]);
  return {
    names: [...new Set(names.map(normalise).filter(Boolean))],
    descriptions: [
      ...new Set(
        Object.values(text)
          .map((value) => normalise(value.description))
          .filter(Boolean),
      ),
    ],
  };
}

// 設定の寿命で索引を再利用する。価格・認可・DBや表示言語には依存しない。
export function createMenuSearch(configuration: Configuration, section: MenuSection = "products") {
  const categoryFields = new Map(
    configuration.categories.map((category) => [category.id, searchFields(category.text)]),
  );
  const documents: SearchDocument[] = configuration[section].map((item) => {
    const categoryId = "categoryId" in item ? item.categoryId : undefined;
    const category = categoryId ? categoryFields.get(categoryId) : undefined;
    const fields = searchFields(item.text);
    return {
      id: item.id,
      categoryId,
      names: fields.names,
      categories: category?.names ?? [],
      descriptions: [...fields.descriptions, ...(category?.descriptions ?? [])],
    };
  });
  const options = {
    keys: [
      { name: "names", weight: 4 },
      { name: "categories", weight: 2 },
      { name: "descriptions", weight: 1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    includeScore: true,
    useTokenSearch: true,
    // 空白区切りの一括照会と、句読点を含む登録名を同じ規則で扱う。
    tokenize: /\S+/g,
  };
  const any = new Fuse(documents, { ...options, tokenMatch: "any" });
  const all = new Fuse(documents, { ...options, tokenMatch: "all" }, any.getIndex());
  return (query = "") => {
    const value = normalise(query);
    if (!value) return { ids: documents.map((item) => item.id), detail: false };
    const exact = documents.filter(
      (item) => normalise(item.id) === value || item.names.includes(value),
    );
    if (exact.length)
      return {
        ids: exact.map((item) => item.id),
        detail: section === "products" && exact.length === 1,
      };
    const category = documents.filter(
      (item) =>
        item.categories.includes(value) ||
        (item.categoryId && normalise(item.categoryId) === value),
    );
    if (category.length) return { ids: category.map((item) => item.id), detail: false };

    const terms = value.split(" ");
    const whole =
      terms.length > 1 ? new Set(all.search(value).map(({ refIndex }) => refIndex)) : undefined;
    const matches = new Map(
      any.search(value).map(({ refIndex, score, item }) => [refIndex, { item, score: score ?? 1 }]),
    );
    documents.forEach((item, index) => {
      // 自然な照会に含まれる登録名と、IDの完全一致も候補へ含める。
      if (
        (value.length > 2 && item.names.some((name) => value.includes(name))) ||
        terms.includes(normalise(item.id)) ||
        (item.categoryId && terms.includes(normalise(item.categoryId)))
      )
        matches.set(index, { item, score: 0 });
    });
    const ranked = [...matches].toSorted(
      ([left, leftMatch], [right, rightMatch]) =>
        Number(whole?.has(right) ?? false) - Number(whole?.has(left) ?? false) ||
        leftMatch.score - rightMatch.score ||
        left - right,
    );
    const ids = ranked.map(([, { item }]) => item.id);
    const only = ids.length === 1 ? ranked[0]?.[1].item : undefined;
    const includesTerm = (name: string) =>
      terms.some((term) => name.includes(term) || term.includes(name));
    const detail =
      section === "products" &&
      !!only &&
      terms.every((term) =>
        only.names.some((name) => name.includes(term) || term.includes(name)),
      ) &&
      !only.categories.some(includesTerm) &&
      !terms.includes(normalise(only.categoryId ?? ""));
    return { ids, detail };
  };
}
