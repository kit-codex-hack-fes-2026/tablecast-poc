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
export function MenuNavigation({
  storeId,
  draftId,
  onNavigate,
}: {
  storeId: string;
  draftId?: string;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const className =
    "flex min-h-11 items-center gap-2 rounded-md px-2 text-base text-foreground hover:bg-secondary data-[status=active]:bg-secondary data-[status=active]:font-semibold";
  return (
    <nav className="ml-4 space-y-1 border-l border-border pl-3" aria-label={t("admin_config")}>
      {items.map(({ section, Icon }) =>
        draftId ? (
          <Link
            key={section}
            to="/admin/stores/$storeId/menu/changes/$draftId/$section"
            params={{ storeId, draftId, section }}
            className={className}
            onClick={onNavigate}
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
            onClick={onNavigate}
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
        onClick={onNavigate}
      >
        <FileClock className="size-4" />
        {t("admin_drafts")}
      </Link>
    </nav>
  );
}
