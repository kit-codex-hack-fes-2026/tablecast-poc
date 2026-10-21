import { createFileRoute } from "@tanstack/react-router";
import { ConfigurationHistory } from "../features/configuration/configuration-history";
import {
  configurationHistoryOptions,
  configurationHistorySearchSchema,
  configurationReleaseOptions,
} from "../features/configuration/configuration-history-query";
import { isStoreManager } from "../features/store/store-query";

export const Route = createFileRoute("/admin/stores/$storeId/menu/history")({
  staticData: {
    document: { title: "configuration_history_title", description: "head_history_description" },
  },
  validateSearch: configurationHistorySearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const { store } = context;
    if (!isStoreManager(store)) return;
    await Promise.all([
      context.queryClient.prefetchInfiniteQuery(configurationHistoryOptions(store.id)),
      deps.version === undefined
        ? undefined
        : context.queryClient.prefetchQuery(configurationReleaseOptions(store.id, deps.version)),
    ]);
  },
  component: HistoryRoute,
});
function HistoryRoute() {
  const navigate = Route.useNavigate();
  return (
    <ConfigurationHistory
      version={Route.useSearch().version}
      onSelect={(version) => void navigate({ search: { version }, resetScroll: false })}
    />
  );
}
