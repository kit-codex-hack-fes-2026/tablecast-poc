import type { ComponentProps } from "react";
import { authClient } from "../../lib/auth-client";
import { useConfigurationRoute } from "../configuration/configuration-route";
import { MenuNavigation } from "../configuration/menu-navigation";
import { AdminShell as Shell } from "../shell/admin-shell";
import { useSidebarStore } from "./sidebar-selection";

export function StoreAdminShell(
  props: Omit<ComponentProps<typeof Shell>, "renderMenuNavigation" | "selection">,
) {
  const selection = useSidebarStore(props);
  const { draftId } = useConfigurationRoute();
  return (
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
  );
}
