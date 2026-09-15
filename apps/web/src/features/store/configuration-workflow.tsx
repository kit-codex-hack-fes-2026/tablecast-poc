import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FilePenLine, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScroll,
  DialogTitle,
} from "../../components/ui/dialog";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { ConfigurationStatus } from "../shell/configuration-status";
import { m } from "../../paraglide/messages";
import { menuLabels, type MenuSection } from "./menu-model";
import { draftOptions } from "./menu-query";
import { useStore } from "./store-shell";

export function StartConfigurationEditing({
  section,
  itemId,
  disabled,
  onSelect,
  label,
}: {
  label?: string;
  section: MenuSection;
  itemId?: string;
  disabled?: boolean;
  onSelect?: (draftId: string) => void;
}) {
  const store = useStore();
  const storeId = store.id;
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const interaction = useRef(0);
  useEffect(
    () => () => {
      interaction.current += 1;
    },
    [],
  );
  function changeOpen(next: boolean) {
    interaction.current += 1;
    setOpen(next);
  }
  const choices = useInfiniteQuery({
    queryKey: ["tablecast-draft-choices", storeId],
    initialPageParam: null,
    queryFn: ({
      signal,
      pageParam,
    }: {
      signal: AbortSignal;
      pageParam: { beforeUpdatedAt: number; beforeId: string } | null;
    }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].drafts.choices.$get(
          {
            param: { storeId },
            query: pageParam
              ? { beforeUpdatedAt: String(pageParam.beforeUpdatedAt), beforeId: pageParam.beforeId }
              : {},
          },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor,
    enabled: open,
  });
  function select(draftId: string) {
    changeOpen(false);
    if (onSelect) onSelect(draftId);
    else if (itemId)
      void navigate({
        to: "/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId",
        params: { storeId, draftId, section, itemId },
        search: true,
      });
    else
      void navigate({
        to: "/admin/stores/$storeId/menu/changes/$draftId/$section",
        params: { storeId, draftId, section },
        search: true,
      });
  }
  const create = useMutation({
    mutationFn: (source: { storeId: string; interaction: number }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].drafts.$post({ param: { storeId: source.storeId } }),
      ),
    onSuccess: (draft, source) => {
      client.setQueryData(draftOptions(source.storeId, draft.id).queryKey, draft);
      void client.invalidateQueries({ queryKey: ["tablecast-drafts", source.storeId] });
      void client.invalidateQueries({ queryKey: ["tablecast-draft-choices", source.storeId] });
      if (source.interaction === interaction.current) select(draft.id);
    },
  });
  if (store.role !== "owner" && store.role !== "admin") return null;
  return (
    <>
      <Button disabled={disabled} onClick={() => changeOpen(true)}>
        <FilePenLine />
        {label ?? t("menu_start_editing")}
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workflow_choose_title")}</DialogTitle>
            <DialogClose aria-label={t("common_close")}>
              <X />
            </DialogClose>
          </DialogHeader>
          <DialogDescription>{t("workflow_choose_note")}</DialogDescription>
          <DialogScroll className="space-y-4">
            <ErrorNotice
              error={choices.error || create.error}
              onRetry={() => {
                if (create.error) create.mutate({ storeId, interaction: interaction.current });
                else void choices.refetch();
              }}
              retrying={choices.isFetching || create.isPending}
            />
            {choices.isPending ? (
              <LoadingState />
            ) : (
              choices.data && (
                <>
                  {!choices.data.pages[0]?.drafts.length && (
                    <p className="text-sm text-muted-foreground">{t("workflow_no_drafts")}</p>
                  )}
                  {choices.data.pages.flatMap((page) =>
                    page.drafts.map((draft) => (
                      <article
                        key={draft.id}
                        className="space-y-3 rounded-lg border border-border p-4"
                      >
                        <ConfigurationStatus
                          storeName={store.name}
                          publishedVersion={page.publishedVersion}
                          draft={draft}
                        />
                        <p className="text-sm">
                          {draft.sections
                            .map((target) =>
                              t(
                                target === "storeName"
                                  ? "org_name"
                                  : target === "branding" ||
                                      target === "appearance" ||
                                      target === "banners"
                                    ? "theme_title"
                                    : menuLabels[target],
                              ),
                            )
                            .join(" · ")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {m.workflow_summary({ count: draft.changeCount }, { locale })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          <DateTime value={draft.updatedAt} />
                        </p>
                        <Button
                          variant="outline"
                          disabled={create.isPending}
                          onClick={() => select(draft.id)}
                        >
                          {t("workflow_resume")}
                        </Button>
                      </article>
                    )),
                  )}
                  {choices.hasNextPage && (
                    <Button
                      variant="outline"
                      disabled={choices.isFetchingNextPage}
                      onClick={() => void choices.fetchNextPage()}
                    >
                      {t("workflow_more_drafts")}
                    </Button>
                  )}
                </>
              )
            )}
            <Button
              disabled={create.isPending}
              onClick={() => create.mutate({ storeId, interaction: interaction.current })}
            >
              <Plus />
              {t(create.isPending ? "workflow_saving" : "editor_create_draft")}
            </Button>
          </DialogScroll>
        </DialogContent>
      </Dialog>
    </>
  );
}
