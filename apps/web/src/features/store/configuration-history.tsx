import { History, RotateCcw, X } from "lucide-react";
import { UserIdentity } from "../../components/user-identity";
import type { ConfigurationRelease } from "@tablecast/api/schema";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PageHeader } from "../../components/page-header";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { DateTime } from "../../components/date-time";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogScroll,
  DialogFooter,
} from "../../components/ui/dialog";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { m } from "../../paraglide/messages";
import { useStore } from "./store-shell";
import { ConfigurationChanges } from "./configuration-changes";
import { ConfigurationTimeline } from "./configuration-timeline";
import {
  configurationHistoryOptions,
  configurationReleaseOptions,
} from "./configuration-history-query";
import { draftOptions } from "./menu-query";

export function ConfigurationHistory({
  version,
  onSelect,
}: {
  version?: number;
  onSelect: (version?: number) => void;
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
  storeId: string;
  version?: number;
  onSelect: (version?: number) => void;
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
            {m.configuration_history_count({ count: entries.length }, { locale })}
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
                ? m.configuration_history_release({ version }, { locale })
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
function ReleaseContent({ storeId, version }: { storeId: string; version: number }) {
  const { t, locale } = useI18n();
  const query = useQuery(configurationReleaseOptions(storeId, version));
  const client = useQueryClient();
  const navigate = useNavigate();
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [confirm, setConfirm] = useState(false);
  const title = useRef<HTMLHeadingElement | null>(null);
  const restore = useMutation({
    mutationFn: (baseVersion: number) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].configuration.releases[":version"].restore.$post({
          param: { storeId, version: String(version) },
          json: { draftId, baseVersion },
        }),
      ),
    onSuccess: (draft) => {
      client.setQueryData(draftOptions(storeId, draft.id).queryKey, draft);
      void client.invalidateQueries({ queryKey: ["tablecast-configuration-history", storeId] });
      void client.invalidateQueries({ queryKey: ["tablecast-drafts", storeId] });
      void client.invalidateQueries({ queryKey: ["tablecast-draft-choices", storeId] });
    },
  });
  const release = query.data;
  return (
    <>
      <DialogScroll className="space-y-5 pb-4">
        <ErrorNotice
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
        {query.isPending && <LoadingState />}
        {release && (
          <>
            <ReleaseSummary release={release} storeId={storeId} />
            {confirm && (
              <section
                className="space-y-3 rounded-xl border border-border bg-secondary p-4"
                aria-labelledby="tablecast-restore-heading"
              >
                <h2
                  id="tablecast-restore-heading"
                  ref={title}
                  tabIndex={-1}
                  className="font-semibold outline-none"
                >
                  {t("configuration_history_confirm")}
                </h2>
                <p>
                  {m.configuration_history_restore_scope(
                    { source: version, current: release.publishedVersion },
                    { locale },
                  )}
                </p>
                <p>{t("configuration_history_restore_note")}</p>
                <ErrorNotice error={restore.error} />
                {apiError(restore.error)?.status === 409 && (
                  <Button
                    variant="outline"
                    disabled={query.isFetching}
                    onClick={() => {
                      void query.refetch();
                      setConfirm(false);
                      setDraftId(crypto.randomUUID());
                      restore.reset();
                    }}
                  >
                    {t("configuration_history_refresh")}
                  </Button>
                )}
              </section>
            )}
          </>
        )}
      </DialogScroll>
      {release?.configuration && version !== release.publishedVersion && (
        <DialogFooter>
          {confirm ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirm(false);
                  restore.reset();
                }}
                disabled={restore.isPending}
              >
                {t("common_cancel")}
              </Button>
              <Button
                onClick={() =>
                  restore.mutate(release.publishedVersion, {
                    onSuccess: (draft) =>
                      void navigate({
                        to: "/admin/stores/$storeId/menu/changes/$draftId",
                        params: { storeId, draftId: draft.id },
                      }),
                  })
                }
                disabled={
                  restore.isPending ||
                  query.isFetching ||
                  query.isError ||
                  apiError(restore.error)?.status === 409
                }
                aria-busy={restore.isPending}
              >
                {t(restore.isPending ? "common_loading" : "configuration_history_create")}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => {
                setConfirm(true);
                requestAnimationFrame(() => title.current?.focus());
              }}
              disabled={query.isFetching || query.isError}
            >
              <RotateCcw aria-hidden="true" />
              {t("configuration_history_use")}
            </Button>
          )}
        </DialogFooter>
      )}
    </>
  );
}

function ReleaseSummary({ release, storeId }: { release: ConfigurationRelease; storeId: string }) {
  const { t, locale } = useI18n();
  const version = release.version;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={version === release.publishedVersion ? "success" : "inactive"}>
          {t(
            version === release.publishedVersion
              ? "configuration_history_current"
              : "configuration_history_previous",
          )}
        </Badge>
        <DateTime value={release.publishedAt} />
      </div>
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">{t("configuration_history_publisher")}</p>
        <UserIdentity
          compact
          user={{
            name: release.publisherName,
            email: release.publisherEmail,
            image: release.publisherImage,
          }}
        />
      </div>
      {release.sourceDraftId && (
        <Link
          className="underline underline-offset-4"
          to="/admin/stores/$storeId/menu/changes/$draftId"
          params={{ storeId, draftId: release.sourceDraftId }}
        >
          {t("configuration_history_source")}
        </Link>
      )}
      {!release.configuration ? (
        <p role="alert">{t("configuration_history_unavailable")}</p>
      ) : (
        <>
          <p>
            {m.configuration_history_contents(
              {
                products: release.configuration.products.length,
                categories: release.configuration.categories.length,
                plans: release.configuration.plans.length,
              },
              { locale },
            )}
          </p>
          <h2 className="text-lg font-semibold">
            {m.configuration_history_compare({ version: release.publishedVersion }, { locale })}
          </h2>
          {release.changes.length ? (
            <ConfigurationChanges changes={release.changes} configuration={release.configuration} />
          ) : (
            <p>{t("configuration_history_identical")}</p>
          )}
        </>
      )}
    </>
  );
}
