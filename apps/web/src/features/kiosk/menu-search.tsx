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
  onCategoryChange: (category: string) => void;
  onChange: (input: UiSectionInput) => void;
  onChoose: (product: Product) => void;
  pending: boolean;
  result: CoreState["menuSearch"];
  search: UiSectionInput["search"];
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(search?.query ?? "");
  const [composing, setComposing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusInput = useRef(false);
  const focusTrigger = useRef(false);
  const submitted = useRef<undefined | { offset: number; query: string }>(undefined);
  const previous = useRef({ search, active, version: catalog.version });
  const send = useCallback(
    (query: string, offset = 0) => {
      submitted.current = { query, offset };
      onChange({ section: "menu", search: { query, offset } });
    },
    [onChange],
  );

  useEffect(() => {
    if (
      previous.current.search?.query !== search?.query ||
      previous.current.search?.offset !== search?.offset ||
      previous.current.active !== active ||
      previous.current.version !== catalog.version
    ) {
      // 自分の検索操作後の入力は保ち、外部の検索・ページ・版変更では取り消す。
      if (
        previous.current.active !== active ||
        previous.current.version !== catalog.version ||
        search?.query !== submitted.current?.query ||
        (search?.offset ?? 0) !== submitted.current?.offset
      )
        setDraft(search?.query ?? "");
      previous.current = { search, active, version: catalog.version };
      submitted.current = undefined;
    }
    if (!search && focusTrigger.current) {
      focusTrigger.current = false;
      // WebKitのクリック後のfocus解除より後に、戻り先のDOMへ復帰する。
      const frame = requestAnimationFrame(() => trigger.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [search, active, catalog.version]);
  const runSearch = useEffectEvent(() => send(draft));
  useEffect(() => {
    if (!search || !active || composing || draft === search.query) return undefined;
    const timeout = setTimeout(runSearch, 250);
    return () => clearTimeout(timeout);
  }, [draft, search, active, composing]);

  const updating = pending || composing || Boolean(search && draft !== search.query);
  const products = search ? (result?.productIds ?? []) : undefined;
  return (
    <div>
      {search && (
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
                onChange({ section: "menu", search: null });
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
                setDraft(event.currentTarget.value);
                setComposing(false);
              }}
              onChange={(event) => setDraft(event.target.value)}
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
                setDraft("");
                input.current?.focus();
              }}
            >
              <X aria-hidden="true" size={20} />
            </Button>
          </div>
          <SearchPageActions
            result={result}
            updating={updating}
            onPage={(offset) => send(search.query, offset)}
          />
          <ErrorNotice
            error={error}
            retrying={pending}
            onRetry={() => send(draft, search.offset ?? 0)}
          />
          {!updating && result?.total === 0 && !error && (
            <p role="status">{t("kiosk_menu_search_empty")}</p>
          )}
        </section>
      )}
      <ProductMenu
        catalog={catalog}
        category={category}
        onCategoryChange={onCategoryChange}
        onChoose={onChoose}
        productIds={products}
        searchResults={Boolean(search)}
        searchButtonRef={trigger}
        onSearch={() => {
          focusInput.current = true;
          setDraft("");
          send("");
        }}
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
  );
}
