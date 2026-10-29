import type { Catalog, CoreState, Product, UiSectionInput } from "@tablecast/api/schema";
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, Search, X } from "lucide-react";
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
  const updating = hasQuery && (pending || composing || draft.trim() !== search?.query);
  const searching = hasQuery && Boolean(search);
  const products = searching ? (result?.productIds ?? []) : undefined;
  return (
    <div>
      {opened && (
        <section
          aria-label={t("kiosk_menu_search_results")}
          aria-busy={updating}
          className="space-y-4 p-4"
        >
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                focusTrigger.current = true;
                setLocallyOpened(false);
                setDraft("");
                send("");
              }}
            >
              <ArrowLeft aria-hidden="true" size={20} />
              {t("common_back")}
            </Button>
            <label className="font-semibold" htmlFor="tablecast-menu-search">
              {t("kiosk_menu_search_label")}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Search aria-hidden="true" size={20} className="shrink-0" />
            <Input
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
            <Button
              type="button"
              variant="outline"
              aria-label={t("kiosk_menu_search_clear")}
              disabled={!draft}
              onClick={() => {
                setLocallyOpened(true);
                setDraft("");
                send("");
                input.current?.focus();
              }}
            >
              <X aria-hidden="true" size={20} />
            </Button>
          </div>
          {hasQuery && (
            <SearchPageActions
              result={searching && !error ? result : null}
              updating={updating}
              onPage={(offset) => send(draft, offset)}
            />
          )}
          <ErrorNotice
            error={error}
            retrying={pending}
            onRetry={() =>
              hasQuery
                ? send(draft, search?.offset ?? 0)
                : onChange({ section: "menu", search: null })
            }
          />
        </section>
      )}
      <ProductMenu
        catalog={catalog}
        imageSizes={imageSizes}
        category={category}
        onCategoryChange={onCategoryChange}
        onChoose={onChoose}
        productIds={products}
        searchResults={searching}
        searchButtonRef={trigger}
        onSearch={
          opened
            ? undefined
            : () => {
                editedQuery.current = undefined;
                focusInput.current = true;
                setLocallyOpened(true);
                setDraft("");
              }
        }
      />
    </div>
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
          {updating && (
            <>
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
                size={18}
              />
              {t("kiosk_menu_search_updating")}
            </>
          )}
          {!updating && result && (
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
