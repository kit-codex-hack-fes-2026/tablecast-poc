import { Menu } from "@base-ui/react/menu";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { Check, ChevronDown, FilePenLine, History } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { ErrorNotice } from "../../components/error-notice";
import { DateTime } from "../../components/date-time";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { catalogOptions, draftChoicesOptions, draftOptions } from "../store/menu-query";
import { configurationHistoryOptions } from "../store/configuration-history-query";
import { menuSectionSchema } from "../store/menu-model";
import { DraftStatus } from "./configuration-status";
import { useConfigurationRoute } from "./configuration-route";
import { ConfigurationToolbarHost } from "./configuration-toolbar";

function useConfigurationHeader({ storeId, role }: { storeId: string; role: string }) {
  const { t, locale } = useI18n();
  const { draftId } = useConfigurationRoute();
  const params = useParams({ strict: false });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const section = menuSectionSchema.safeParse(params.section).data ?? "products";
  const client = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const manager = role === "owner" || role === "admin";
  const historyPage = pathname.endsWith("/history");
  const history = useInfiniteQuery({
    ...configurationHistoryOptions(storeId),
    enabled: manager && historyPage,
  });
  const catalog = useQuery({ ...catalogOptions(storeId), enabled: !historyPage });
  const publishedVersion = historyPage
    ? history.data?.pages[0]?.publishedVersion
    : catalog.data?.version;
  const draft = useQuery({
    ...draftOptions(storeId, draftId ?? ""),
    enabled: manager && !!draftId,
  });
  const choices = useInfiniteQuery({ ...draftChoicesOptions(storeId), enabled: open && manager });
  async function select(next?: string) {
    setBusy(true);
    setError(undefined);
    try {
      const data = next ? await client.ensureQueryData(draftOptions(storeId, next)) : undefined;
      if (!alive.current) return;
      const configuration = data?.configuration ?? catalog.data?.configuration;
      const itemId = params.itemId;
      const exists =
        itemId &&
        itemId !== "new" &&
        (section === "cast" || configuration?.[section].some((item) => item.id === itemId));
      if (pathname.endsWith("/design"))
        await navigate({
          to: "/admin/stores/$storeId/design",
          params: { storeId },
          search: next ? { draftId: next } : {},
        });
      else if (next && exists)
        await navigate({
          to: "/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId",
          params: { storeId, draftId: next, section, itemId },
          search: true,
        });
      else if (next)
        await navigate({
          to: "/admin/stores/$storeId/menu/changes/$draftId/$section",
          params: { storeId, draftId: next, section },
          search: true,
        });
      else if (exists)
        await navigate({
          to: "/admin/stores/$storeId/menu/$section/$itemId",
          params: { storeId, section, itemId },
          search: true,
        });
      else
        await navigate({
          to: "/admin/stores/$storeId/menu/$section",
          params: { storeId, section },
          search: true,
        });
    } catch (cause) {
      if (alive.current) setError(cause);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return {
    t,
    locale,
    draftId,
    pathname,
    storeId,
    manager,
    historyPage,
    catalog,
    publishedVersion,
    draft,
    choices,
    open,
    setOpen,
    busy,
    error,
    select,
  };
}
export function ConfigurationHeader(props: { storeId: string; role: string }) {
  const model = useConfigurationHeader(props);
  const { t, locale, draftId, pathname, historyPage, catalog, publishedVersion, draft, error } =
    model;
  return (
    <section className="min-w-0 space-y-3" aria-label={t("workflow_context")}>
      <div className="flex min-h-12 min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <ConfigurationSwitcher model={model} />
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          {publishedVersion !== undefined && (
            <span className="whitespace-nowrap text-sm">
              {m.workflow_current_short({ version: publishedVersion }, { locale })}
            </span>
          )}
          {draft.data && (
            <>
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {m.workflow_source_short({ version: draft.data.baseVersion }, { locale })}
              </span>
              <DraftStatus status={draft.data.status} />
              <Badge variant="secondary" className="whitespace-nowrap">
                {m.workflow_changes_short({ count: draft.data.changes.length }, { locale })}
              </Badge>
            </>
          )}
        </div>
      </div>
      <ErrorNotice error={error || (!historyPage && catalog.error) || draft.error} />
      <ConfigurationToolbarHost
        reserve={
          Boolean(draftId) &&
          (/\/changes\/[^/]+$/.test(pathname) ||
            pathname.endsWith("/design") ||
            pathname.endsWith("/cast") ||
            /\/changes\/[^/]+\/[^/]+\/[^/]+$/.test(pathname))
        }
      />
    </section>
  );
}

function ConfigurationSwitcher({ model }: { model: ReturnType<typeof useConfigurationHeader> }) {
  const {
    t,
    locale,
    draftId,
    pathname,
    storeId,
    manager,
    historyPage,
    choices,
    open,
    setOpen,
    busy,
    select,
  } = model;
  return (
    <>
      {manager ? (
        <Menu.Root open={open} onOpenChange={setOpen}>
          <Menu.Trigger render={<Button variant="outline" className="shrink-0" disabled={busy} />}>
            <FilePenLine />
            {t(
              pathname.endsWith("/history")
                ? "configuration_history_title"
                : draftId
                  ? "workflow_draft_identity"
                  : "demo_published",
            )}
            <ChevronDown />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={8} className="z-50">
              <Menu.Popup className="max-h-[min(28rem,var(--available-height))] w-80 max-w-[var(--available-width)] overflow-auto rounded-2xl border border-border bg-card p-2 shadow-surface">
                <Menu.Item
                  aria-current={!draftId && !historyPage ? "true" : undefined}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-control-hover"
                  onClick={() => void select()}
                >
                  <Check
                    aria-hidden="true"
                    className={`size-4 shrink-0 ${!draftId && !historyPage ? "" : "invisible"}`}
                  />
                  {t("workflow_view_published")}
                </Menu.Item>
                {choices.isPending && <p className="p-3 text-sm">{t("common_loading")}</p>}
                <ErrorNotice error={choices.error} onRetry={() => void choices.refetch()} />
                {choices.data?.pages
                  .flatMap((page) => page.drafts)
                  .map((choice) => (
                    <Menu.Item
                      key={choice.id}
                      aria-current={draftId === choice.id ? "true" : undefined}
                      className="flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-control-hover"
                      onClick={() => void select(choice.id)}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <Check
                          aria-hidden="true"
                          className={`size-4 shrink-0 ${draftId === choice.id ? "" : "invisible"}`}
                        />
                        {m.workflow_summary({ count: choice.changeCount }, { locale })}
                        <DraftStatus status={choice.status} />
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <DateTime value={choice.updatedAt} />
                      </span>
                    </Menu.Item>
                  ))}
                {choices.hasNextPage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={choices.isFetchingNextPage}
                    onClick={() => void choices.fetchNextPage()}
                  >
                    {t("workflow_more_drafts")}
                  </Button>
                )}
                <Menu.Item
                  render={<Link to="/admin/stores/$storeId/menu/history" params={{ storeId }} />}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-control-hover"
                >
                  <History className="size-4" />
                  {t("configuration_history_title")}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : (
        <span>{t("demo_published")}</span>
      )}
    </>
  );
}
