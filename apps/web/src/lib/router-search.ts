const rawSearchString = Symbol("rawSearchString");

type FlatValue = string | number | boolean | null | undefined;
type FlatSearch = Record<string, FlatValue | FlatValue[]> & {
  [rawSearchString]?: string;
};

export const parseFlatSearch = (searchString: string): FlatSearch => {
  const search: FlatSearch = Object.fromEntries<FlatValue | FlatValue[]>([]);
  for (const [key, value] of new URLSearchParams(searchString)) {
    const current = search[key];
    search[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }

  Object.defineProperty(search, rawSearchString, {
    enumerable: true,
    value: searchString ? (searchString.startsWith("?") ? searchString : `?${searchString}`) : "",
  });
  return search;
};

const appendSearchValue = (searchParams: URLSearchParams, key: string, value: FlatValue) => {
  if (value === undefined) return;
  searchParams.append(key, String(value));
};

export const stringifyFlatSearch = (search: FlatSearch) => {
  const preservedSearchString = search[rawSearchString];
  if (preservedSearchString !== undefined) {
    // Routerのsearch合成後も、変更していない署名対象の表記・順序を保つ。
    const original = new URLSearchParams(preservedSearchString);
    const unchanged = new Set<string>();
    for (const key of original.keys()) {
      const expected = original.getAll(key);
      const value = search[key];
      const actual = (Array.isArray(value) ? value : [value])
        .filter((item) => item !== undefined)
        .map(String);
      if (
        expected.length === actual.length &&
        expected.every((item, index) => item === actual[index])
      )
        unchanged.add(key);
    }
    if (
      [...original.keys()].every((key) => unchanged.has(key)) &&
      Object.entries(search).every(([key, value]) => value === undefined || unchanged.has(key))
    )
      return preservedSearchString;
    const segments = preservedSearchString
      .replace(/^\?/, "")
      .split("&")
      .filter((segment) => {
        const key = new URLSearchParams(segment).keys().next().value;
        return key !== undefined && unchanged.has(key);
      });
    const changed = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
      if (unchanged.has(key)) continue;
      if (Array.isArray(value)) for (const item of value) appendSearchValue(changed, key, item);
      else appendSearchValue(changed, key, value);
    }
    const query = [...segments, changed.toString()].filter(Boolean).join("&");
    return query ? `?${query}` : "";
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const item of value) appendSearchValue(searchParams, key, item);
    } else {
      appendSearchValue(searchParams, key, value);
    }
  }
  const searchString = searchParams.toString();
  return searchString ? `?${searchString}` : "";
};
