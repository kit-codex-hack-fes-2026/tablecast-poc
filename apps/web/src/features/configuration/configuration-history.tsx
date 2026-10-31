import { uiLocale } from "@tablecast/api/localization";
import { useInfiniteQuery } from "@tanstack/react-query";
import { History, X } from "lucide-react";
import { useRef } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { useStore } from "../store/store-context";
import { configurationHistoryOptions } from "./configuration-history-query";
import { ReleaseContent } from "./configuration-release";
import { ConfigurationTimeline } from "./configuration-timeline";

export function ConfigurationHistory({
  version,
  onSelect,
}: {
  onSelect: (version?: number) => void;
  version?: number;
}) {
  const { t } = useI18n();
  const store = useStore();
  return (
    <>
      <PageHeader
        title={t("configuration_history_title")}
        icon={<History />}
        description={t("configuration_history_description")}
      />
      {["owner", "admin"].includes(store.role) ? (
        <HistoryContent key={store.id} storeId={store.id} version={version} onSelect={onSelect} />
      ) : (
        <p>{t("common_forbidden")}</p>
      )}
    </>
  );
}

function HistoryContent({
  storeId,
  version,
  onSelect,
}: {
  onSelect: (version?: number) => void;
  storeId: string;
  version?: number;
}) {
  const { t, locale } = useI18n();
  const query = useInfiniteQuery(configurationHistoryOptions(storeId));
  const trigger = useRef<HTMLButtonElement | null>(null);
  const entries = query.data?.pages.flatMap((page) => page.entries) ?? [];
  return (
    <>
      <ErrorNotice
        error={query.error}
        onRetry={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}
        retrying={query.isFetching}
      />
      {query.isPending && <LoadingState />}
      {query.data && (
        <>
          <p className="text-sm text-muted-foreground">
            {m.configuration_history_count({ count: entries.length }, { locale: uiLocale(locale) })}
            <span className="mt-1 block text-xs">{t("configuration_history_retention")}</span>
          </p>
          {entries.length ? (
            <ConfigurationTimeline
              entries={entries}
              publishedVersion={query.data.pages[0]?.publishedVersion ?? 0}
              storeId={storeId}
              onSelect={(next, button) => {
                trigger.current = button;
                onSelect(next);
              }}
            />
          ) : (
            <p>{t("configuration_history_empty")}</p>
          )}
          {query.hasNextPage && (
            <Button
              variant="outline"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetching}
            >
              {t(query.isFetchingNextPage ? "common_loading" : "configuration_history_more")}
            </Button>
          )}
        </>
      )}
      <Dialog
        open={version !== undefined}
        onOpenChange={(open) => {
          if (!open) onSelect();
        }}
      >
        <DialogContent side="right" finalFocus={trigger}>
          <DialogHeader>
            <DialogTitle>
              {version !== undefined
                ? m.configuration_history_release({ version }, { locale: uiLocale(locale) })
                : t("configuration_history_title")}
            </DialogTitle>
            <DialogClose aria-label={t("common_close")}>
              <X />
            </DialogClose>
          </DialogHeader>
          <DialogDescription>{t("configuration_history_detail_description")}</DialogDescription>
          {version !== undefined && (
            <ReleaseContent key={`${storeId}/${version}`} storeId={storeId} version={version} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
