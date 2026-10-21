import { useParams, useSearch } from "@tanstack/react-router";
import { NavigationLink as Link } from "./navigation-link";
import { FileClock, History, LayoutList, Mic, Tags, UtensilsCrossed, Palette } from "lucide-react";
import { navigationItemClass } from "./navigation-group";
import { useI18n } from "../../i18n/locale";

import { menuLabels, menuReviewSearchSchema } from "../store/menu-model";
const items = [
  { section: "products", Icon: UtensilsCrossed },
  { section: "categories", Icon: Tags },
  { section: "plans", Icon: LayoutList },
  { section: "cast", Icon: Mic },
] as const;
export function MenuNavigation({
  storeId,
  draftId,
  manager,
  collapsed = false,
  onNavigate,
}: {
  storeId: string;
  draftId?: string;
  manager: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const { section: activeSection } = useParams({ strict: false });
  const { returnSection, ...listSearch } = menuReviewSearchSchema.parse(
    useSearch({ strict: false }),
  );
  const currentSection = activeSection ?? returnSection ?? "products";
  const className = navigationItemClass;
  return (
    <nav className="space-y-1" aria-label={t("admin_config")}>
      {items.map(({ section, Icon }) =>
        draftId ? (
          <Link
            collapsed={collapsed}
            key={section}
            to="/admin/stores/$storeId/menu/changes/$draftId/$section"
            params={{ storeId, draftId, section }}
            search={section === currentSection ? listSearch : {}}
            title={t(menuLabels[section])}
            className={className}
            onClick={onNavigate}
          >
            <Icon className="size-4" />
            {!collapsed && t(menuLabels[section])}
          </Link>
        ) : (
          <Link
            collapsed={collapsed}
            key={section}
            to="/admin/stores/$storeId/menu/$section"
            params={{ storeId, section }}
            search={section === currentSection ? listSearch : {}}
            title={t(menuLabels[section])}
            className={className}
            onClick={onNavigate}
          >
            <Icon className="size-4" />
            {!collapsed && t(menuLabels[section])}
          </Link>
        ),
      )}
      <Link
        collapsed={collapsed}
        title={t("theme_title")}
        to="/admin/stores/$storeId/design"
        params={{ storeId }}
        search={{ ...listSearch, returnSection: currentSection, draftId }}
        className={className}
        onClick={onNavigate}
      >
        <Palette className="size-4" />
        {!collapsed && t("theme_title")}
      </Link>
      <Link
        collapsed={collapsed}
        title={t("admin_drafts")}
        to={
          draftId
            ? "/admin/stores/$storeId/menu/changes/$draftId"
            : "/admin/stores/$storeId/menu/changes"
        }
        params={{ storeId, draftId: draftId ?? "" }}
        search={draftId ? { ...listSearch, returnSection: currentSection } : {}}
        activeOptions={{ exact: true }}
        className={className}
        onClick={onNavigate}
      >
        <FileClock className="size-4" />
        {!collapsed && t("admin_drafts")}
      </Link>
      {manager && (
        <Link
          collapsed={collapsed}
          title={t("configuration_history_title")}
          to="/admin/stores/$storeId/menu/history"
          params={{ storeId }}
          className={className}
          onClick={onNavigate}
        >
          <History className="size-4" />
          {!collapsed && t("configuration_history_title")}
        </Link>
      )}
    </nav>
  );
}
