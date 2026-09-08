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
  if (preservedSearchString !== undefined) return preservedSearchString;

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
