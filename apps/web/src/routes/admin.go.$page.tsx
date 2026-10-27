import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { isNavigationPageId, navigationTarget } from "../features/shell/navigation-model";
import { storesOptions } from "../features/store/store-query";
import { sessionOptions } from "../lib/session-query";

export const Route = createFileRoute("/admin/go/$page")({
  loader: async ({ params, context }) => {
    if (!isNavigationPageId(params.page)) throw notFound();
    const id = params.page;
    const stores = await context.queryClient.ensureQueryData(storesOptions);
    const session = await context.queryClient.ensureQueryData(sessionOptions);
    const store =
      stores.stores.find((item) => item.organizationId === session?.session.activeOrganizationId) ??
      stores.stores[0];
    // 公開ヘルプでは店舗情報を取得せず、認証後にアクセス可能な店舗へ解決する。
    const to = navigationTarget(id, {
      selectedStore: store?.id,
      selectedOrganization: store?.organizationId,
    });
    throw redirect({ to: to ?? "/organisations" });
  },
});
