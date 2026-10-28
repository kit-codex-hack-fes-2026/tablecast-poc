import type { ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageProvider } from "../../components/image-provider";
import { authClient } from "../../lib/auth-client";
import { catalogOptions } from "../catalog/catalog-query";
import { useConfigurationRoute } from "../configuration/configuration-route";
import { MenuNavigation } from "../configuration/menu-navigation";
import { AdminShell as Shell } from "../shell/admin-shell";
import { useSidebarStore } from "./sidebar-selection";

export function StoreAdminShell(
  props: Omit<ComponentProps<typeof Shell>, "renderMenuNavigation" | "selection">,
) {
  const selection = useSidebarStore(props);
  const mediaCatalog = useQuery({
    ...catalogOptions(selection.selectedStore ?? ""),
    enabled: false,
  });
  const { draftId } = useConfigurationRoute();
  return (
    <ImageProvider
      basePath={`/api/admin/stores/${encodeURIComponent(selection.selectedStore ?? "")}`}
      assets={mediaCatalog.data?.imageAssets}
    >
      <Shell
        {...props}
        selection={selection}
        draftId={draftId}
        onSignOut={
          props.onSignOut ??
          (() => {
            void authClient.signOut().then(() => window.location.assign("/login"));
          })
        }
        renderMenuNavigation={({ collapsed, onNavigate }) =>
          selection.selectedStore ? (
            <MenuNavigation
              storeId={selection.selectedStore}
              manager={selection.manager}
              draftId={draftId}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ) : undefined
        }
      />
    </ImageProvider>
  );
}
