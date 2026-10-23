import { skipToken, useQuery } from "@tanstack/react-query";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import {
  emptyMenuListSearch,
  type MenuListSearch,
  type MenuSection,
} from "../configuration/menu-model";
import { draftOptions } from "../configuration/menu-query";
import { useStore } from "../store/store-context";
import { catalogOptions } from "./catalog-query";
import { ItemForm } from "./menu-item-form";
import { MenuOverview } from "./menu-overview";

export function MenuItem({
  section,
  itemId,
  draftId,
  search = emptyMenuListSearch,
}: {
  draftId?: string;
  itemId: string;
  search?: MenuListSearch;
  section: MenuSection;
}) {
  const store = useStore();
  const catalog = useQuery({ ...catalogOptions(store.id), enabled: !draftId });
  const draft = useQuery({
    ...draftOptions(store.id, draftId ?? ""),
    queryFn: draftId ? draftOptions(store.id, draftId).queryFn : skipToken,
  });
  const configuration = draftId ? draft.data?.configuration : catalog.data?.configuration;
  return (
    <>
      <ErrorNotice error={catalog.error || draft.error} />
      {configuration ? (
        draftId && draft.data ? (
          <ItemForm
            key={`${store.id}:${draftId}:${section}:${itemId}`}
            search={search}
            section={section}
            itemId={itemId}
            initialConfiguration={configuration}
            draft={draft.data}
          />
        ) : (
          <MenuOverview
            search={search}
            configuration={configuration}
            section={section}
            itemId={itemId}
          />
        )
      ) : (
        !(catalog.error || draft.error) && <LoadingState />
      )}
    </>
  );
}
