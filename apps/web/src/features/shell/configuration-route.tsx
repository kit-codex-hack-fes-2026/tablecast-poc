import { useParams, useRouterState, useSearch } from "@tanstack/react-router";

export function useConfigurationRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { draftId } = useParams({ strict: false });
  const designDraftId = useSearch({
    from: "/admin/stores/$storeId/design",
    shouldThrow: false,
    select: (search) => search.draftId,
  });
  const design = pathname.endsWith("/design");
  return {
    active: pathname.includes("/menu/") || design,
    draftId: draftId ?? designDraftId,
  };
}
