import type { PosCatalog, PosSettings } from "@tablecast/api/schema";

type Product = PosSettings["products"][number];
type Candidate = Pick<PosCatalog["items"][number], "available" | "id" | "name" | "price">;
export type PosMappingFilter = "all" | "duplicate" | "mapped" | "review" | "unmapped";
export type PosMappingRow = {
  candidates: Candidate[];
  duplicateWith: Product["name"][];
  externalId: string;
  id: string;
  issues: ("invalid" | "parent" | "price" | "unavailable")[];
  kind: "option" | "product";
  loaded: boolean;
  localId: string;
  name: Product["name"];
  option: null | Product["options"][number];
  parentId: string;
  price: number;
  product: Product;
  remote: Candidate | undefined;
};
export type PosMappingGroup = {
  id: string;
  options: PosMappingRow[];
  product: PosMappingRow;
};

/** 同じlocal optionは複数商品で使えても、保存する対応は一つに保つ。 */
export function posMappingValues(settings: PosSettings) {
  const saved = new Map(
    settings.mappings.map((value) => [`${value.kind}:${value.localId}`, value.externalId]),
  );
  const values = new Map<string, PosSettings["mappings"][number]>();
  for (const product of settings.products) {
    for (const value of [
      { kind: "product" as const, localId: product.id },
      ...product.options.map((option) => ({ kind: "option" as const, localId: option.id })),
    ]) {
      const key = `${value.kind}:${value.localId}`;
      values.set(key, { ...value, externalId: saved.get(key) ?? "" });
    }
  }
  return [...values.values()];
}

/** 保存前の入力全体から一覧を作り、絞込みに隠れた対応も検査する。 */
export function posMappingRows(
  products: Product[],
  mappings: PosSettings["mappings"],
  catalog?: PosCatalog,
): PosMappingRow[] {
  const selected = new Map(
    mappings.map((value) => [`${value.kind}:${value.localId}`, value.externalId]),
  );
  const remoteProducts = new Map(catalog?.items.map((item) => [item.id, item]));
  const groups = new Map<string, Map<string, Product["name"]>>();
  const rows = products.flatMap((product) => {
    const parentId = selected.get(`product:${product.id}`) ?? "";
    const parent = remoteProducts.get(parentId);
    return [null, ...product.options].map((option): PosMappingRow => {
      const kind = option ? "option" : "product";
      const localId = option?.id ?? product.id;
      const externalId = selected.get(`${kind}:${localId}`) ?? "";
      const candidates = option
        ? [...new Map((parent?.options ?? []).map((value) => [value.id, value])).values()]
        : (catalog?.items ?? []);
      const remote = candidates.find((candidate) => candidate.id === externalId);
      const price = option?.price ?? product.price;
      const issues: PosMappingRow["issues"] = [];
      if (externalId && catalog) {
        if (option && !parentId) issues.push("parent");
        else if (!remote) issues.push("invalid");
        else {
          if (!remote.available) issues.push("unavailable");
          if (remote.price === null || remote.price !== price) issues.push("price");
        }
      }
      const row: PosMappingRow = {
        id: `${product.id}:${kind}:${localId}`,
        kind,
        localId,
        product,
        option,
        parentId,
        name: option?.name ?? product.name,
        price,
        externalId,
        candidates,
        remote,
        loaded: !!catalog,
        issues,
        duplicateWith: [],
      };
      if (externalId) {
        const key = `${kind}:${option ? product.id : ""}:${externalId}`;
        const group = groups.get(key) ?? new Map<string, Product["name"]>();
        group.set(localId, row.name);
        groups.set(key, group);
      }
      return row;
    });
  });
  for (const row of rows) {
    const group = groups.get(`${row.kind}:${row.option ? row.product.id : ""}:${row.externalId}`);
    if (group && group.size > 1) {
      for (const [id, name] of group) {
        if (id !== row.localId) row.duplicateWith.push(name);
        if (row.duplicateWith.length === 2) break;
      }
    }
  }
  return rows;
}

export function matchesPosMapping(row: PosMappingRow, filter: PosMappingFilter) {
  switch (filter) {
    case "unmapped":
      return !row.externalId;
    case "duplicate":
      return row.duplicateWith.length > 0;
    case "review":
      return row.issues.length > 0;
    case "mapped":
      return !!row.externalId && row.loaded && !row.issues.length && !row.duplicateWith.length;
    case "all":
      return true;
    default:
      return false;
  }
}

/** 子だけが条件に一致しても親商品を残し、ページ分割で親子を切り離さない。 */
export function posMappingGroups(
  rows: PosMappingRow[],
  filter: PosMappingFilter,
  search: string,
): PosMappingGroup[] {
  const groups = new Map<string, PosMappingGroup>();
  for (const row of rows) {
    if (!row.option) groups.set(row.product.id, { id: row.product.id, product: row, options: [] });
    else groups.get(row.product.id)?.options.push(row);
  }
  const query = search.trim().toLocaleLowerCase();
  const matches = (row: PosMappingRow) =>
    matchesPosMapping(row, filter) &&
    (!query ||
      [...Object.values(row.product.name), ...Object.values(row.name), row.remote?.name]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query));
  return [...groups.values()].flatMap((group) => {
    const options = group.options.filter(matches);
    return matches(group.product) || options.length ? [{ ...group, options }] : [];
  });
}
