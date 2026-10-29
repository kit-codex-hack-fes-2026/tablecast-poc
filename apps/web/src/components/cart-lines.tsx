import type { PricedLine, Product } from "@tablecast/api/schema";
import { NumberField } from "@base-ui/react/number-field";
import { useHydrated } from "@tanstack/react-router";
import { Minus, Pencil, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { AnimatePresence, useIsPresent, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { forwardRef, type ReactNode, useId, useState } from "react";
import { useI18n } from "../i18n/locale";
import { ConditionSummary } from "./condition-summary";
import { IllustrationNotice } from "./illustration-notice";
import { Money, PriceChange } from "./money";
import { ProductImage } from "./product-image";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { quantityControl } from "./ui/quantity-control-variants";

export type CartDisplayLine = Partial<
  Pick<PricedLine, "conditionIssues" | "missing" | "planCovered" | "total" | "unitPrice">
> &
  Pick<PricedLine, "id" | "name" | "quantity"> & {
    options: Pick<PricedLine["options"][number], "id" | "name" | "priceDelta" | "quantity">[];
    productId: null | string;
  };

/**
 * 注文かごの行。
 * 確定金額はAPIのlines、未確定行は金額を持たない表示値を使う。
 * onEdit/onRemove/onQuantityを渡す時だけ対応操作が出る。
 * disabledで更新中の操作を防ぐ。
 * 表示側で価格や必須条件を再計算せず、明示注文確定はfeatureの確認フローへ残す。
 */
export function CartLines<Line extends CartDisplayLine>({
  lines,
  onEdit,
  onRemove,
  onQuantity,
  products = [],
  disabled = false,
  variant = "cards",
}: {
  disabled?: boolean;
  lines: Line[];
  onEdit?: (line: Line) => void;
  onQuantity?: (line: Line, quantity: number) => void;
  onRemove?: (line: Line) => void;
  products?: Product[];
  variant?: "cards" | "receipt";
}) {
  const { locale, t } = useI18n();
  const productsById = new Map(products.map((product) => [product.id, product]));
  return (
    <m.ul
      layoutScroll
      data-ui="cart-lines"
      className={
        variant === "receipt"
          ? "relative divide-y divide-border"
          : "relative flex flex-col gap-6 p-4"
      }
    >
      <AnimatePresence initial={false} mode="popLayout">
        {lines.length === 0 && (
          <CartLineSurface key="empty">
            <div className="flex flex-col items-center gap-2.5 px-5 py-6 text-center text-muted-foreground">
              <ShoppingBag size={32} strokeWidth={1.2} aria-hidden="true" />
              <h3 className="text-base font-medium">{t("kiosk_cart_empty")}</h3>
            </div>
          </CartLineSurface>
        )}
        {lines.map((line) => {
          const product = line.productId ? productsById.get(line.productId) : undefined;
          const canEdit = Boolean(
            onEdit && (product?.modifiers.length || line.options.length || line.missing?.length),
          );
          const optionsById = new Map(
            product?.modifiers.flatMap((group) =>
              group.options.map((option) => [option.id, { group, option }] as const),
            ),
          );
          return (
            <CartLineSurface key={line.id} framed={variant === "cards"}>
              <div
                className={
                  product?.imageKey
                    ? "grid grid-cols-[5rem_minmax(0,1fr)] @sm/cart-line:grid-cols-[7rem_minmax(0,1fr)]"
                    : "min-w-0"
                }
              >
                {product?.imageKey && (
                  <div
                    data-ui="cart-product-image"
                    className="relative aspect-square self-start overflow-hidden rounded-lg bg-muted"
                  >
                    <ProductImage
                      width={112}
                      height={112}
                      sizes="112px"
                      className="size-full object-top-left"
                      src={`/media/${product.imageKey}`}
                      alt=""
                    />
                    {product.imageKind === "illustration" && <IllustrationNotice />}
                  </div>
                )}
                <div className="min-w-0 space-y-4 pl-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-base">
                    <h3 className="min-w-0 flex-1 basis-40 wrap-anywhere font-semibold">
                      {line.name[locale]}
                    </h3>
                    <span className="ml-auto whitespace-nowrap font-semibold">
                      {line.total === undefined ? (
                        <span role="status" className="text-sm font-normal text-muted-foreground">
                          {t("kiosk_cart_syncing")}
                        </span>
                      ) : (
                        <Money taxIncluded value={line.total} />
                      )}
                    </span>
                  </div>
                  <div
                    role={line.options.length > 0 || canEdit ? "region" : undefined}
                    data-ui={line.options.length > 0 || canEdit ? "line-customisations" : undefined}
                    aria-label={
                      line.options.length > 0 || canEdit ? t("kiosk_customisations") : undefined
                    }
                    className="grid gap-4"
                  >
                    {(!onQuantity || line.planCovered || line.options.length > 0) && (
                      <div className="min-w-0 space-y-3">
                        {(!onQuantity || line.planCovered) && (
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            {!onQuantity && (
                              <span>
                                {t("common_quantity")}: {line.quantity}
                              </span>
                            )}
                            {line.planCovered && (
                              <Badge variant="secondary">{t("kiosk_plan_included")}</Badge>
                            )}
                          </div>
                        )}
                        {line.options.length > 0 && (
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            {line.options.map((option) => {
                              const context = optionsById.get(option.id);
                              return (
                                <span
                                  key={option.id}
                                  className="inline-flex min-h-12.5 max-w-full flex-wrap items-center gap-2 rounded-2xl bg-muted p-2 text-sm"
                                >
                                  <span className="font-medium">
                                    {context?.group.text[locale].displayName ??
                                      t("kiosk_customisations")}
                                    :{" "}
                                  </span>
                                  {context?.option.imageKey && (
                                    <ProductImage
                                      src={`/media/${context.option.imageKey}`}
                                      width={32}
                                      height={32}
                                      sizes="32px"
                                      alt=""
                                      className="size-8 shrink-0 rounded-lg object-contain"
                                    />
                                  )}
                                  <span className="min-w-0 wrap-anywhere">
                                    {option.name[locale]}
                                    {option.quantity > 1 && ` × ${option.quantity}`}
                                  </span>
                                  {option.priceDelta !== 0 && (
                                    <span>
                                      (<PriceChange value={option.priceDelta} />)
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {(canEdit || onQuantity || onRemove) && (
                      <div
                        data-ui="line-actions"
                        className="flex w-full max-w-full flex-wrap items-center justify-end gap-3"
                      >
                        {canEdit && onEdit && (
                          <Button
                            className="h-13.5 min-h-13.5 shrink-0 rounded-xl"
                            size="sm"
                            variant="outline"
                            type="button"
                            disabled={disabled}
                            onClick={() => onEdit(line)}
                          >
                            <Pencil aria-hidden />
                            {t("kiosk_edit")}
                          </Button>
                        )}
                        {onQuantity && (
                          <LineQuantity line={line} disabled={disabled} onQuantity={onQuantity} />
                        )}
                        {onRemove && (
                          <Button
                            className="h-13.5 min-h-13.5 rounded-xl"
                            size="sm"
                            variant="destructive"
                            type="button"
                            disabled={disabled}
                            onClick={() => onRemove(line)}
                          >
                            <Trash2 aria-hidden />
                            {t("common_remove")}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  {line.conditionIssues?.map((issue) => {
                    const expression = product?.modifiers
                      .flatMap((group) => group.options)
                      .find((option) => option.id === issue.optionId)?.conditions?.[issue.relation];
                    return (
                      <p
                        key={`${issue.optionId}:${issue.relation}`}
                        className="mt-2 text-sm text-destructive"
                      >
                        {expression ? (
                          <>
                            {t(
                              issue.relation === "requires"
                                ? "condition_requires"
                                : "condition_excludes",
                            )}
                            ：<ConditionSummary expression={expression} product={product} />
                          </>
                        ) : (
                          t("kiosk_missing")
                        )}
                      </p>
                    );
                  })}
                  {(line.missing?.length ?? 0) > 0 && (
                    <span className="inline-flex text-sm text-destructive">
                      {t("kiosk_missing")}
                    </span>
                  )}
                </div>
              </div>
            </CartLineSurface>
          );
        })}
      </AnimatePresence>
    </m.ul>
  );
}

/** 取り除いた行は視覚的な退場だけを残し、操作と支援技術から直ちに外す。 */
const CartLineSurface = forwardRef<HTMLLIElement, { children: ReactNode; framed?: boolean }>(
  function CartLineSurface({ children, framed = false }, ref) {
    const present = useIsPresent();
    const reduced = useReducedMotion();
    return (
      <m.li
        ref={ref}
        layout={reduced ? false : "position"}
        inert={!present}
        aria-hidden={!present || undefined}
        initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, x: reduced ? 0 : -8 }}
        transition={{ duration: reduced ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
        className={`@container/cart-line relative overflow-hidden bg-card p-4 ${framed ? "rounded-3xl border border-border" : ""}`}
      >
        {children}
      </m.li>
    );
  },
);

/** 入力中の文字だけを保持し、確定した数量を既存APIへ渡す。応答後はAPIの数量へ同期する。 */
function LineQuantity<Line extends CartDisplayLine>({
  line,
  disabled,
  onQuantity,
}: {
  disabled: boolean;
  line: Line;
  onQuantity: (line: Line, quantity: number) => void;
}) {
  const { locale, t } = useI18n();
  const id = useId();
  const hydrated = useHydrated();
  const [draft, setDraft] = useState<{ disabled: boolean; source: number; value: null | number }>({
    source: line.quantity,
    disabled,
    value: line.quantity,
  });
  if (draft.source !== line.quantity || draft.disabled !== disabled) {
    setDraft({ source: line.quantity, disabled, value: line.quantity });
  }
  return (
    <NumberField.Root
      id={id}
      value={draft.value}
      min={1}
      max={20}
      step={1}
      smallStep={1}
      snapOnStep
      disabled={disabled || !hydrated}
      onValueChange={(value) => setDraft({ ...draft, value })}
      onValueCommitted={(quantity) => {
        if (quantity === null || !Number.isInteger(quantity)) {
          setDraft({ ...draft, value: line.quantity });
          return;
        }
        if (quantity !== line.quantity) onQuantity(line, quantity);
      }}
      className="inline-flex"
    >
      <NumberField.Group className={quantityControl().group()}>
        <label htmlFor={id} className="px-2 text-sm font-medium">
          {t("common_quantity")}
        </label>
        <NumberField.Decrement
          render={<Button size="icon-sm" variant="outline" />}
          aria-label={`${line.name[locale]}: ${t("common_decrease")}`}
        >
          <Minus aria-hidden />
        </NumberField.Decrement>
        <NumberField.Input
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-label={`${line.name[locale]}: ${t("common_quantity")}`}
          className={quantityControl().value()}
        />
        <NumberField.Increment
          render={<Button size="icon-sm" variant="outline" />}
          aria-label={`${line.name[locale]}: ${t("common_increase")}`}
        >
          <Plus aria-hidden />
        </NumberField.Increment>
      </NumberField.Group>
    </NumberField.Root>
  );
}
