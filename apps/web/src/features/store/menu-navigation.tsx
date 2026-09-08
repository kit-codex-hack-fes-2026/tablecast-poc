import { Link } from "@tanstack/react-router";
import { FileClock, LayoutList, Mic, Tags, UtensilsCrossed } from "lucide-react";
import { useI18n } from "../../i18n/locale";

import { menuLabels } from "./menu-model";
const items = [
  { section: "products", Icon: UtensilsCrossed },
  { section: "categories", Icon: Tags },
  { section: "plans", Icon: LayoutList },
  { section: "cast", Icon: Mic },
] as const;
export function MenuNavigation({ storeId, draftId }: { storeId: string; draftId?: string }) {
  const { t } = useI18n();
  const className =
    "inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-base text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:font-semibold data-[status=active]:text-foreground";
  return (
    <nav className="flex overflow-x-auto border-b border-border" aria-label={t("admin_config")}>
      {items.map(({ section, Icon }) =>
        draftId ? (
          <Link
            key={section}
            to="/admin/stores/$storeId/menu/changes/$draftId/$section"
            params={{ storeId, draftId, section }}
            className={className}
          >
            <Icon className="size-4" />
            {t(menuLabels[section])}
          </Link>
        ) : (
          <Link
            key={section}
            to="/admin/stores/$storeId/menu/$section"
            params={{ storeId, section }}
            className={className}
          >
            <Icon className="size-4" />
            {t(menuLabels[section])}
          </Link>
        ),
      )}
      <Link
        to={
          draftId
            ? "/admin/stores/$storeId/menu/changes/$draftId"
            : "/admin/stores/$storeId/menu/changes"
        }
        params={{ storeId, draftId: draftId ?? "" }}
        activeOptions={{ exact: true }}
        className={className}
      >
        <FileClock className="size-4" />
        {t("admin_drafts")}
      </Link>
    </nav>
  );
}
