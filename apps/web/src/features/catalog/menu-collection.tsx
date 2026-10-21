import { createMenuSearch } from "@tablecast/api/catalog-search";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { CastOverviewPage } from "../configuration/cast-overview-page";
import { StartConfigurationEditing } from "../configuration/configuration-workflow";
import {
  emptyMenuListSearch,
  menuLabels,
  type MenuListSearch,
  type MenuSection,
} from "../configuration/menu-model";
import { draftOptions } from "../configuration/menu-query";
import { useStore } from "../store/store-context";
import { catalogOptions } from "./catalog-query";
import { menuCollectionColumns } from "./menu-collection-columns";
import { matchesMenuFilters, menuCollectionRows } from "./menu-collection-model";
import { MenuResults, ProductFilters } from "./menu-collection-results";

export function MenuCollection({
  section,
  draftId,
  search = emptyMenuListSearch,
}: {
  draftId?: string;
  search?: MenuListSearch;
  section: MenuSection;
}) {
  return section === "cast" ? (
    <CastOverviewPage draftId={draftId} />
  ) : (
    <MenuListCollection section={section} draftId={draftId} search={search} />
  );
}

function MenuListCollection({
  section,
  draftId,
  search,
}: {
  draftId?: string;
  search: MenuListSearch;
  section: Exclude<MenuSection, "cast">;
}) {
  const store = useStore();
  const storeId = store.id;
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const catalog = useQuery({ ...catalogOptions(storeId), enabled: !draftId });
  const draft = useQuery({
    ...draftOptions(storeId, draftId ?? ""),
    queryFn: draftId ? draftOptions(storeId, draftId).queryFn : skipToken,
  });
  const error = catalog.error || draft.error;
  const configuration = draftId ? draft.data?.configuration : catalog.data?.configuration;
  const editable = !draftId || ["draft", "ready"].includes(draft.data?.status ?? "");
  const manager = ["owner", "admin"].includes(store.role);
  const columns = useMemo(
    () => menuCollectionColumns(t, locale, section, draftId, storeId, search),
    [t, locale, section, draftId, storeId, search],
  );
  function updateSearch(next: MenuListSearch) {
    const options = { search: { ...search, ...next }, replace: "q" in next, resetScroll: false };
    void (draftId
      ? navigate({
          ...options,
          to: "/admin/stores/$storeId/menu/changes/$draftId/$section",
          params: { storeId, draftId, section },
        })
      : navigate({
          ...options,
          to: "/admin/stores/$storeId/menu/$section",
          params: { storeId, section },
        }));
  }
  const searchMenu = useMemo(
    () => configuration && createMenuSearch(configuration, section),
    [configuration, section],
  );
  const rows = useMemo(
    () => new Map(menuCollectionRows(configuration, section, locale).map((row) => [row.id, row])),
    [configuration, section, locale],
  );
  const data = (searchMenu?.(search.q).ids ?? []).flatMap((id) => {
    const row = rows.get(id);
    return row && matchesMenuFilters(row, section, search) ? [row] : [];
  });

  return (
    <>
      <PageHeader
        title={t(menuLabels[section])}
        actions={
          manager &&
          editable &&
          (draftId ? (
            <Button
              nativeButton={false}
              role="link"
              render={
                <Link
                  to="/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId"
                  params={{ storeId, draftId, section, itemId: "new" }}
                  search={search}
                />
              }
            >
              <Plus />
              {t("common_add")}
            </Button>
          ) : (
            <StartConfigurationEditing
              key={storeId}
              section={section}
              disabled={!configuration}
              onSelect={(nextDraftId) =>
                void navigate({
                  to: "/admin/stores/$storeId/menu/changes/$draftId/$section",
                  params: { storeId, draftId: nextDraftId, section },
                  search,
                })
              }
            />
          ))
        }
      />

      <ErrorNotice
        error={error}
        onRetry={() => void (draftId ? draft.refetch() : catalog.refetch())}
      />
      {(configuration || !error) && (
        <MenuResults
          filters={
            section === "products" ? (
              <ProductFilters
                categories={configuration?.categories ?? []}
                search={search}
                onChange={updateSearch}
              />
            ) : undefined
          }
          data={data}
          columns={columns}
          search={search}
          pending={!configuration}
          onChange={updateSearch}
        />
      )}
    </>
  );
}
