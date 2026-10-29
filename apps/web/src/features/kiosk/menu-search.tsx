import type { Catalog, CoreState, Product, UiSectionInput } from "@tablecast/api/schema";
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, Search, X } from "lucide-react";
import * as motion from "motion/react-m";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { ProductMenu } from "../../components/product-menu";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";

export function KioskMenu({
  catalog,
  imageSizes,
  category,
  onCategoryChange,
  onChoose,
  search,
  result,
  active,
  pending,
  error,
  onChange,
}: {
  active: boolean;
  catalog: Catalog;
  category: string;
  error: unknown;
  imageSizes?: string;
  onCategoryChange: (category: string) => void;
  onChange: (input: UiSectionInput) => void;
  onChoose: (product: Product) => void;
  pending: boolean;
  result: CoreState["menuSearch"];
  search: UiSectionInput["search"];
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(search?.query ?? "");
  const [locallyOpened, setLocallyOpened] = useState(false);
  const opened = locallyOpened || Boolean(search) || Boolean(error);
  const [composing, setComposing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusInput = useRef(false);
  const focusTrigger = useRef(false);
  // 外部同期によるdraft変更と区別し、未送信の実入力だけをdebounceする。
  const editedQuery = useRef<string | undefined>(undefined);
  const submitted = useRef<UiSectionInput["search"]>(undefined);
  const previous = useRef({ search, active, version: catalog.version });
  const send = useCallback(
    (query: string, offset = 0) => {
      editedQuery.current = undefined;
      const value = query.trim();
      const clearing = !value && (search || submitted.current);
      submitted.current = value ? { query: value, offset } : null;
      if (value) onChange({ section: "menu", search: { query: value, offset } });
      else if (clearing) onChange({ section: "menu", search: null });
    },
    [onChange, search],
  );

  useEffect(() => {
    if (
      previous.current.search?.query !== search?.query ||
      previous.current.search?.offset !== search?.offset ||
      previous.current.active !== active ||
      previous.current.version !== catalog.version
    ) {
      // 自分の検索操作後の入力は保ち、外部の検索・ページ・版変更では取り消す。
      const ownUpdate =
        submitted.current === null
          ? !search
          : Boolean(
              submitted.current &&
              search?.query === submitted.current.query &&
              (search?.offset ?? 0) === (submitted.current.offset ?? 0),
            );
      if (
        !ownUpdate ||
        previous.current.active !== active ||
        previous.current.version !== catalog.version
      ) {
        editedQuery.current = undefined;
        setDraft(search?.query ?? "");
      }
      if (
        !ownUpdate &&
        (previous.current.search?.query !== search?.query ||
          previous.current.search?.offset !== search?.offset ||
          previous.current.version !== catalog.version)
      )
        setLocallyOpened(Boolean(search));
      previous.current = { search, active, version: catalog.version };
      submitted.current = undefined;
    }
    if (!opened && focusTrigger.current) {
      focusTrigger.current = false;
      // WebKitのクリック後のfocus解除より後に、戻り先のDOMへ復帰する。
      const frame = requestAnimationFrame(() => trigger.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [search, active, catalog.version, opened]);
  const runSearch = useEffectEvent(
    (
      query: string,
      previousQuery: string | undefined,
      previousOffset: number,
      previousVersion: number,
    ) => {
      if (
        !opened ||
        !active ||
        composing ||
        editedQuery.current?.trim() !== query ||
        draft.trim() !== query ||
        !query ||
        search?.query !== previousQuery ||
        (search?.offset ?? 0) !== previousOffset ||
        catalog.version !== previousVersion ||
        query === search?.query
      )
        return;
      send(query);
    },
  );
  useEffect(() => {
    const query = draft.trim();
    if (
      !opened ||
      !active ||
      composing ||
      !query ||
      editedQuery.current?.trim() !== query ||
      query === search?.query
    )
      return undefined;
    const timeout = setTimeout(
      () => runSearch(query, search?.query, search?.offset ?? 0, catalog.version),
      250,
    );
    return () => clearTimeout(timeout);
  }, [draft, search, active, composing, opened, catalog.version]);

  const hasQuery = Boolean(draft.trim());
  const updating = pending || (hasQuery && (composing || draft.trim() !== search?.query));
  const products = result && (search || pending || error) ? result.productIds : undefined;
  const closeSearch = () => {
    focusTrigger.current = true;
    setLocallyOpened(false);
    setDraft("");
    send("");
  };
  return (
    <ProductMenu
      catalog={catalog}
      imageSizes={imageSizes}
      category={category}
      onCategoryChange={(next) => {
        onCategoryChange(next);
        if (search) {
          setDraft("");
          send("");
        }
      }}
      onChoose={onChoose}
      productIds={products}
      searchResults={Boolean(products)}
      searchOpen={opened}
      searchControl={
        <>
          <Button
            ref={trigger}
            className="shrink-0"
            aria-hidden={opened}
            inert={opened}
            variant="outline"
            size="lg"
            type="button"
            onClick={() => {
              editedQuery.current = undefined;
              focusInput.current = true;
              setLocallyOpened(true);
              setDraft("");
            }}
          >
            <Search aria-hidden />
            {t("kiosk_menu_search")}
          </Button>
          {opened && (
            <motion.div
              data-ui="menu-search-control"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-x-4 top-4 z-10 flex h-14 items-center gap-2 bg-card"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  closeSearch();
                }
              }}
            >
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label={t("common_back")}
                onClick={closeSearch}
              >
                <ArrowLeft aria-hidden />
              </Button>
              <Input
                aria-label={t("kiosk_menu_search_label")}
                className="h-14 min-w-0 flex-1"
                id="tablecast-menu-search"
                type="search"
                maxLength={100}
                value={draft}
                placeholder={t("kiosk_menu_search_placeholder")}
                ref={(element) => {
                  input.current = element;
                  if (element && focusInput.current) {
                    element.focus();
                    focusInput.current = false;
                  }
                }}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={(event) => {
                  editedQuery.current = event.currentTarget.value;
                  setLocallyOpened(true);
                  setDraft(event.currentTarget.value);
                  setComposing(false);
                  if (!event.currentTarget.value.trim()) send("");
                }}
                onChange={(event) => {
                  editedQuery.current = event.target.value;
                  setLocallyOpened(true);
                  setDraft(event.target.value);
                  if (!event.target.value.trim() && !composing) send("");
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.nativeEvent.isComposing &&
                    !composing &&
                    event.keyCode !== 229
                  ) {
                    event.preventDefault();
                    send(draft);
                  }
                }}
              />

              <span
                role="status"
                aria-label={updating ? t("kiosk_menu_search_updating") : undefined}
                className="inline-flex size-5 shrink-0 items-center justify-center"
              >
                {updating && (
                  <LoaderCircle aria-hidden className="size-5 motion-safe:animate-spin" />
                )}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label={t("kiosk_menu_search_clear")}
                disabled={!draft}
                onClick={() => {
                  setLocallyOpened(true);
                  setDraft("");
                  send("");
                  input.current?.focus();
                }}
              >
                <X aria-hidden />
              </Button>
            </motion.div>
          )}
        </>
      }
      searchStatus={
        <MenuSearchStatus
          result={result}
          updating={updating}
          pending={pending}
          error={error}
          onPage={(offset) => send(draft, offset)}
          onRetry={() =>
            hasQuery
              ? send(draft, search?.offset ?? 0)
              : onChange({ section: "menu", search: null })
          }
        />
      }
    />
  );
}

function MenuSearchStatus({
  result,
  updating,
  pending,
  error,
  onPage,
  onRetry,
}: {
  error: unknown;
  onPage: (offset: number) => void;
  onRetry: () => void;
  pending: boolean;
  result: CoreState["menuSearch"];
  updating: boolean;
}) {
  const { t } = useI18n();
  if (!result && !error) return null;
  return (
    <section aria-label={t("kiosk_menu_search_results")} aria-busy={updating} className="px-4 pb-4">
      {result && <SearchPageActions result={result} updating={updating} onPage={onPage} />}
      <ErrorNotice error={error} retrying={pending} onRetry={onRetry} />
    </section>
  );
}

function SearchPageActions({
  result,
  updating,
  onPage,
}: {
  onPage: (offset: number) => void;
  result: CoreState["menuSearch"];
  updating: boolean;
}) {
  const { t } = useI18n();
  const offset = result?.offset ?? 0;
  return (
    <>
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2">
        <p role="status" className="flex items-center gap-2 text-sm">
          {result && (
            <>
              {t("kiosk_menu_search_results")}
              {result.query && ` · ${result.query}`} ·{" "}
              {result.productIds.length
                ? `${offset + 1}–${offset + result.productIds.length} / ${result.total}`
                : `0 / ${result.total}`}
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            aria-label={t("common_previous_page")}
            disabled={updating || offset === 0 || !result}
            onClick={() => onPage(Math.max(0, offset - 8))}
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label={t("common_next_page")}
            disabled={updating || !result?.more}
            onClick={() => onPage(offset + 8)}
          >
            <ChevronRight aria-hidden="true" size={20} />
          </Button>
        </div>
      </div>
      {!updating && result?.total === 0 && <p role="status">{t("kiosk_menu_search_empty")}</p>}
    </>
  );
}
