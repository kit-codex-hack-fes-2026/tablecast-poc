import { useLocation, useNavigate } from "@tanstack/react-router";
import type { OnChangeFn, PaginationState, SortingState } from "@tanstack/react-table";
import {
  collectionSearchKeys,
  collectionSearchSchema,
  parseCollectionSort,
} from "./collection-model";

export function useCollectionSearch({
  prefix = "",
  sortIds,
}: {
  prefix?: string;
  sortIds: readonly string[];
}) {
  const location = useLocation();
  const search = location.search;
  const navigate = useNavigate();
  const keys = collectionSearchKeys(prefix);
  const read = (value: Record<string, unknown>) => ({
    globalFilter: collectionSearchSchema.shape.q.parse(value[keys.q]) ?? "",
    pagination: {
      pageIndex: (collectionSearchSchema.shape.page.parse(value[keys.page]) ?? 1) - 1,
      pageSize: 20,
    },
    sorting: parseCollectionSort(
      collectionSearchSchema.shape.sort.parse(value[keys.sort]),
      sortIds,
    ),
  });
  const update = (
    patch: (previous: Record<string, unknown>) => Record<string, string | number | undefined>,
    replace = false,
  ) => {
    void navigate({
      to: ".",
      replace,
      resetScroll: false,
      search: (previous) => ({ ...previous, ...patch(previous) }),
    });
  };
  const onGlobalFilterChange: OnChangeFn<string> = (updater) =>
    update((previous) => {
      const value = typeof updater === "function" ? updater(read(previous).globalFilter) : updater;
      return { [keys.q]: value || undefined, [keys.page]: undefined };
    }, true);
  const onPaginationChange: OnChangeFn<PaginationState> = (updater) =>
    update((previous) => {
      const value = typeof updater === "function" ? updater(read(previous).pagination) : updater;
      return { [keys.page]: value.pageIndex > 0 ? value.pageIndex + 1 : undefined };
    });
  const onSortingChange: OnChangeFn<SortingState> = (updater) =>
    update((previous) => {
      const first = (typeof updater === "function" ? updater(read(previous).sorting) : updater)[0];
      return {
        [keys.sort]:
          first && sortIds.includes(first.id)
            ? `${first.id}:${first.desc ? "desc" : "asc"}`
            : undefined,
        [keys.page]: undefined,
      };
    });
  return {
    state: read(search),
    onPaginationClamp: (value: PaginationState) =>
      update(() => ({ [keys.page]: value.pageIndex > 0 ? value.pageIndex + 1 : undefined }), true),
    onGlobalFilterChange,
    onPaginationChange,
    onSortingChange,
    onReset: () =>
      update(() => ({ [keys.q]: undefined, [keys.sort]: undefined, [keys.page]: undefined })),
  };
}
