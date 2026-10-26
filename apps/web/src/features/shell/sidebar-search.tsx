import type { SortedResult } from "fumadocs-core/search";
import { Popover } from "@base-ui/react/popover";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { fetchClient } from "fumadocs-core/search/client/fetch";
import { ArrowUpRight, LoaderCircle, Search, X } from "lucide-react";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { cn } from "tailwind-variants";
import { Input } from "../../components/ui/input";
import { controlMotion, surfaceMotion } from "../../components/ui/motion-variants";
import { useI18n } from "../../i18n/locale";
import {
  helpNavigationItem,
  type NavigationContext,
  type navigationGroups,
  navigationGroupStyle,
  searchNavigation,
} from "./navigation-model";

function helpResults(results: SortedResult[]) {
  let title = "";
  return results
    .map((item) => {
      if (item.type === "page") title = item.content;
      return { ...item, title: item.type === "page" ? item.content : title };
    })
    .filter(
      (item, index, all) =>
        item.type !== "page" || all[index + 1]?.type === "page" || !all[index + 1],
    )
    .slice(0, 8);
}

export function SidebarSearch({
  collapsed = false,
  onNavigate,
  ...context
}: NavigationContext & {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { t, locale } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const term = query.trim();
  const visible = open && (collapsed || !!term);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 150);
    return () => clearTimeout(timer);
  }, [term]);
  const help = useQuery({
    queryKey: ["tablecast-help-search", locale, debounced],
    queryFn: async () => fetchClient({ api: "/help/search", locale }).search(debounced),
    enabled: open && !!debounced,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const pages = searchNavigation(term, t, context);
  const loading = !!term && (term !== debounced || help.isPending);
  const docs = !loading && term === debounced ? helpResults(help.data ?? []) : [];
  const error = !loading && help.isError;
  const finish = () => {
    setOpen(false);
    setQuery("");
    onNavigate?.();
  };
  useHotkey(
    "Mod+K",
    () => {
      if (!anchor.current?.getClientRects().length) return;
      setOpen(true);
      input.current?.focus();
      input.current?.select();
    },
    { ignoreInputs: false },
  );

  const searchInput = (
    <SidebarSearchInput
      id={id}
      inputRef={input}
      resultsRef={popup}
      query={query}
      visible={visible}
      onQuery={(next) => {
        setQuery(next);
        setOpen(true);
      }}
      onFocus={() => setOpen(true)}
      onDismiss={() => setOpen(false)}
    />
  );

  return (
    <Popover.Root open={visible} onOpenChange={setOpen} modal={false}>
      <div ref={anchor} className="shrink-0 pb-3">
        {collapsed ? (
          <Popover.Trigger
            aria-label={t("navigation_search")}
            className={cn(
              controlMotion,
              "flex min-h-11 w-full items-center justify-center rounded-lg text-muted-foreground hover:bg-control-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <Search className="size-5" />
          </Popover.Trigger>
        ) : (
          searchInput
        )}
      </div>
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="z-50 max-w-[calc(100vw-1.5rem)]"
        >
          <Popover.Popup
            ref={popup}
            initialFocus={collapsed ? input : false}
            finalFocus={false}
            aria-label={t("navigation_search_results")}
            className={surfaceMotion({
              className:
                "w-[min(30rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl",
            })}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (!collapsed) input.current?.focus();
                setOpen(false);
              }
            }}
          >
            {collapsed && <div className="border-b border-border p-2">{searchInput}</div>}
            <div
              id={`${id}-results`}
              className="max-h-[min(32rem,50dvh)] overflow-y-auto overscroll-contain p-2"
            >
              {!term ? (
                <p className="px-3 py-6 text-sm text-muted-foreground">
                  {t("navigation_search_hint")}
                </p>
              ) : (
                <>
                  <SearchResults
                    pages={pages}
                    docs={docs}
                    loading={loading}
                    error={error}
                    onRetry={() => void help.refetch()}
                    onNavigate={finish}
                  />
                </>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SidebarSearchInput({
  id,
  inputRef,
  resultsRef,
  query,
  visible,
  onQuery,
  onFocus,
  onDismiss,
}: {
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onDismiss: () => void;
  onFocus: () => void;
  onQuery: (query: string) => void;
  query: string;
  resultsRef: RefObject<HTMLDivElement | null>;
  visible: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
      />
      <Input
        id={id}
        ref={inputRef}
        type="search"
        value={query}
        maxLength={200}
        autoComplete="off"
        aria-label={t("navigation_search")}
        aria-controls={visible ? `${id}-results` : undefined}
        placeholder={t("navigation_search_placeholder")}
        className="h-11 rounded-lg bg-muted/50 pr-14 pl-9 text-sm [&::-webkit-search-cancel-button]:appearance-none"
        onFocus={onFocus}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onDismiss();
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            resultsRef.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus();
          }
        }}
      />
      {query ? (
        <button
          type="button"
          aria-label={t("navigation_search_clear")}
          className={cn(
            controlMotion,
            "absolute right-1 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-control-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onClick={() => {
            onQuery("");
            inputRef.current?.focus();
          }}
        >
          <X className="size-4" />
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-3 text-xs text-muted-foreground max-md:hidden"
        >
          ⌘ K
        </kbd>
      )}
    </div>
  );
}

function SearchResults({
  pages,
  docs,
  loading,
  error,
  onRetry,
  onNavigate,
}: {
  docs: ReturnType<typeof helpResults>;
  error: boolean;
  loading: boolean;
  onNavigate: () => void;
  onRetry: () => void;
  pages: ReturnType<typeof searchNavigation>;
}) {
  const { t } = useI18n();
  return (
    <>
      <section aria-label={t("navigation_search_pages")}>
        <h3 className="px-3 py-2 text-xs font-semibold text-muted-foreground">
          {t("navigation_search_pages")}
        </h3>
        {pages.map(({ id: pageId, title, description, Icon, group, url }) => (
          <SearchResult
            key={pageId}
            to={url}
            title={title}
            description={description}
            Icon={Icon}
            group={group}
            onNavigate={onNavigate}
          />
        ))}
        {!pages.length && (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {t("navigation_search_no_pages")}
          </p>
        )}
      </section>
      <section aria-label={t("help_title")} className="mt-2 border-t border-border pt-1">
        <h3 className="px-3 py-2 text-xs font-semibold text-muted-foreground">{t("help_title")}</h3>
        {loading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground p-3">
            <LoaderCircle className="size-4 motion-safe:animate-spin" />
            {t("navigation_search_loading")}
          </p>
        ) : error ? (
          <div role="alert" className="space-y-2 text-sm p-3">
            <p>{t("navigation_search_error")}</p>
            <button
              type="button"
              className="rounded-sm text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onRetry}
            >
              {t("navigation_search_retry")}
            </button>
          </div>
        ) : docs.length ? (
          docs.map((item) => (
            <SearchResult
              key={item.id}
              to={item.url}
              title={item.title}
              description={item.type === "page" ? t("help_title") : item.content}
              Icon={helpNavigationItem(item.url).Icon}
              group="help"
              onNavigate={onNavigate}
            />
          ))
        ) : (
          <p role="status" className="text-sm text-muted-foreground p-3">
            {t("navigation_search_no_help")}
          </p>
        )}
      </section>
    </>
  );
}

function SearchResult({
  to,
  title,
  description,
  Icon,
  group,
  onNavigate,
}: {
  description: string;
  group: keyof typeof navigationGroups;
  Icon: typeof Search;
  onNavigate: () => void;
  title: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      preload={false}
      onClick={onNavigate}
      className={navigationGroupStyle({
        tone: group,
        className: cn(
          controlMotion,
          "group flex min-h-14 items-start gap-3 rounded-lg p-3 hover:bg-[var(--nav-surface)] focus-visible:bg-[var(--nav-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        ),
      })}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--nav-surface)] text-[var(--nav-color)]">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium group-hover:text-[var(--nav-color)]">
          {title}
        </span>
        <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <ArrowUpRight aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
