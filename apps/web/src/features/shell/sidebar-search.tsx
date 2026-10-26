import type { SortedResult } from "fumadocs-core/search";
import { Popover } from "@base-ui/react/popover";
import { detectPlatform } from "@tanstack/react-hotkeys";
import { Link, useHydrated } from "@tanstack/react-router";
import { useFetchSearch } from "fumadocs-core/search/client/fetch";
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
import { useSearchKeyboard } from "./search-keyboard";
import { SearchSnippet } from "./search-snippet";

export function SidebarSearch({
  collapsed = false,
  onNavigate,
  ...context
}: NavigationContext & {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const term = query.trim();
  const visible = open && (collapsed || !!term);
  const pages = searchNavigation(term, t, context);
  const keyboard = useSearchKeyboard({
    anchor,
    input,
    popup,
    query: term,
    open: visible,
    onOpen: () => setOpen(true),
  });
  const finish = () => {
    setOpen(false);
    setQuery("");
    onNavigate?.();
  };

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
      <div {...keyboard} ref={anchor} className="shrink-0 pb-3">
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
            {...keyboard}
            ref={popup}
            initialFocus={collapsed ? input : false}
            finalFocus={false}
            aria-label={t("navigation_search_results")}
            className={surfaceMotion({
              className:
                "w-[min(30rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl",
            })}
            onKeyDown={(event) => {
              keyboard.onKeyDown(event);
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
                  <SearchResults pages={pages} query={term} onNavigate={finish} />
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
  query,
  onNavigate,
}: {
  onNavigate: () => void;
  pages: ReturnType<typeof searchNavigation>;
  query: string;
}) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [cache] = useState(() => new Map<string, SortedResult[]>());
  return (
    <>
      <section aria-label={t("navigation_search_pages")}>
        <h3 className="px-3 py-2 text-xs font-semibold text-muted-foreground">
          {t("navigation_search_pages")}
        </h3>
        {pages.map(({ id, title, description, Icon, group, url }, index) => (
          <SearchResult
            key={id}
            title={title}
            description={description}
            Icon={Icon}
            group={group}
            to={url}
            position={index + 1}
            query={query}
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
        <HelpSearchResults
          key={attempt}
          query={query}
          offset={pages.length}
          cache={cache}
          onNavigate={onNavigate}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      </section>
    </>
  );
}

function helpResults(items: NonNullable<ReturnType<typeof useFetchSearch>["data"]>["items"]) {
  let title = "";
  const records = items.flatMap((item) => (item.type === "table" ? item.rows : [item]));
  let titleTree: (typeof records)[number]["hastContent"] | undefined;
  return records
    .map((record) => {
      if (record.type === "page") {
        title = record.content;
        titleTree = record.hastContent;
      }
      return { ...record, title, titleTree };
    })
    .filter(
      (record, index) =>
        record.type !== "page" || !records[index + 1] || records[index + 1]?.type === "page",
    )
    .slice(0, 8);
}

function HelpSearchResults({
  query,
  offset,
  cache,
  onNavigate,
  onRetry,
}: {
  cache: Map<string, SortedResult[]>;
  offset: number;
  onNavigate: () => void;
  onRetry: () => void;
  query: string;
}) {
  const { t, locale } = useI18n();
  const { onSearchChange, ...search } = useFetchSearch({
    api: "/help/search",
    locale,
    cache,
    delayMs: 150,
  });
  useEffect(() => {
    onSearchChange(query);
  }, [query, onSearchChange]);
  if (search.search !== query || search.isLoading)
    return (
      <p role="status" className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 motion-safe:animate-spin" />
        {t("navigation_search_loading")}
      </p>
    );
  if (search.error)
    return (
      <div role="alert" className="space-y-2 p-3 text-sm">
        <p>{t("navigation_search_error")}</p>
        <button
          type="button"
          className="rounded-sm text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onRetry}
        >
          {t("navigation_search_retry")}
        </button>
      </div>
    );
  const docs = helpResults(search.data?.query === query ? search.data.items : []);
  return docs.length ? (
    docs.map((item, index) => (
      <SearchResult
        key={item.id}
        title={item.title}
        titleTree={item.titleTree}
        description={item.type === "page" ? t("help_title") : item.content}
        tree={item.type === "page" ? undefined : item.hastContent}
        Icon={helpNavigationItem(item.url).Icon}
        group="help"
        to={item.url}
        position={offset + index + 1}
        query={query}
        onNavigate={onNavigate}
      />
    ))
  ) : (
    <p role="status" className="p-3 text-sm text-muted-foreground">
      {t("navigation_search_no_help")}
    </p>
  );
}

function SearchResult({
  to,
  title,
  description,
  Icon,
  group,
  onNavigate,
  position,
  query,
  tree,
  titleTree,
}: {
  description: string;
  group: keyof typeof navigationGroups;
  Icon: typeof Search;
  onNavigate: () => void;
  position: number;
  query: string;
  title: string;
  titleTree?: Parameters<typeof SearchSnippet>[0]["tree"];
  to: string;
  tree?: Parameters<typeof SearchSnippet>[0]["tree"];
}) {
  const { locale } = useI18n();
  const hydrated = useHydrated();
  const modifier = hydrated && detectPlatform() === "mac" ? "⌘" : "Ctrl";
  return (
    <Link
      to={to}
      data-search-result=""
      data-search-query={query}
      aria-keyshortcuts={position <= 4 ? `Meta+${position} Control+${position}` : undefined}
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
          <SearchSnippet text={title} tree={titleTree} query={query} locale={locale} />
        </span>
        <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          <SearchSnippet text={description} tree={tree} query={query} locale={locale} />
        </span>
      </span>
      {position <= 4 ? (
        <kbd
          aria-hidden="true"
          className="mt-1 shrink-0 rounded-sm border border-border px-1 text-[0.65rem] text-muted-foreground"
        >
          {modifier} {position}
        </kbd>
      ) : (
        <ArrowUpRight aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
      )}
    </Link>
  );
}
