import type { PricedLine, Product } from "@tablecast/api/schema";
import { Minus, Pencil, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { AnimatePresence, useIsPresent, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { forwardRef, type ReactNode } from "react";
import { useI18n } from "../i18n/locale";
import { ConditionSummary } from "./condition-summary";
import { IllustrationNotice } from "./illustration-notice";
import { Money } from "./money";
import { ProductImage } from "./product-image";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

/**
 * 注文かごの行。
 * API計算済みlinesを必須とし、productsで写真・条件名を補う。
 * onEdit/onRemove/onQuantityを渡す時だけ対応操作が出る。
 * disabledで更新中の操作を防ぐ。
 * 表示側で価格や必須条件を再計算せず、明示注文確定はfeatureの確認フローへ残す。
 */
export function CartLines({
  lines,
  onEdit,
  onRemove,
  onQuantity,
  products = [],
  disabled = false,
}: {
  disabled?: boolean;
  lines: PricedLine[];
  onEdit?: (line: PricedLine) => void;
  onQuantity?: (line: PricedLine, quantity: number) => void;
  onRemove?: (line: PricedLine) => void;
  products?: Product[];
}) {
  const { locale, t } = useI18n();
  const productsById = new Map(products.map((product) => [product.id, product]));
  return (
    <m.ul layoutScroll data-ui="cart-lines" className="relative flex flex-col gap-3 p-3">
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
          const product = productsById.get(line.productId);
          const optionsById = new Map(
            product?.modifiers.flatMap((group) =>
              group.options.map((option) => [option.id, { group, option }] as const),
            ),
          );
          return (
            <CartLineSurface key={line.id}>
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
                    className="relative min-h-32 self-stretch overflow-hidden bg-muted"
                  >
                    <ProductImage
                      width={112}
                      height={112}
                      sizes="112px"
                      fit="cover"
                      className="absolute inset-0 size-full"
                      src={`/media/${product.imageKey}`}
                      alt=""
                    />
                    {product.imageKind === "illustration" && <IllustrationNotice />}
                  </div>
                )}
                <div className="min-w-0 space-y-3 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-base">
                    <h3 className="min-w-0 flex-1 basis-40 wrap-anywhere font-semibold">
                      {line.name[locale]}
                    </h3>
                    <span className="ml-auto whitespace-nowrap font-semibold">
                      <Money value={line.total} />
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      {t("common_quantity")} {line.quantity} · <Money value={line.unitPrice} />
                    </span>
                    {line.planCovered && (
                      <Badge variant="secondary">{t("kiosk_plan_included")}</Badge>
                    )}
                  </div>
                  {(line.options.length > 0 || onEdit) && (
                    <section
                      data-ui="line-customisations"
                      aria-label={t("kiosk_customisations")}
                      className="flex flex-wrap items-center justify-end gap-2 rounded-lg bg-card p-2"
                    >
                      <div className="flex min-w-0 flex-1 basis-64 flex-wrap gap-1.5">
                        {line.options.map((option) => {
                          const context = optionsById.get(option.id);
                          return (
                            <span
                              key={option.id}
                              className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md bg-muted px-2 py-1.5 text-sm"
                            >
                              {context?.option.imageKey && (
                                <ProductImage
                                  src={`/media/${context.option.imageKey}`}
                                  width={40}
                                  height={40}
                                  sizes="40px"
                                  alt=""
                                  className="size-10 shrink-0 rounded-md object-contain"
                                />
                              )}
                              <span className="min-w-0 wrap-anywhere">
                                <span className="font-medium">
                                  {context?.group.text[locale].displayName ??
                                    t("kiosk_customisations")}
                                  :{" "}
                                </span>
                                {option.name[locale]}
                                {option.quantity > 1 && ` × ${option.quantity}`}
                              </span>
                              {option.priceDelta !== 0 && (
                                <span>
                                  (<Money value={option.priceDelta} />)
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                      {onEdit && (
                        <Button
                          className="ml-auto shrink-0"
                          size="sm"
                          variant="ghost"
                          type="button"
                          disabled={disabled}
                          onClick={() => onEdit(line)}
                        >
                          <Pencil aria-hidden />
                          {t("kiosk_edit")}
                        </Button>
                      )}
                    </section>
                  )}
                  {(onQuantity || onRemove) && (
                    <div
                      data-ui="line-actions"
                      className="flex flex-wrap items-center justify-end gap-2"
                    >
                      {onQuantity && (
                        <div className="flex items-center rounded-lg bg-card">
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={disabled || line.quantity <= 1}
                            aria-label={`${line.name[locale]}: ${t("common_decrease")}`}
                            onClick={() => onQuantity(line, line.quantity - 1)}
                          >
                            <Minus />
                          </Button>
                          <output className="min-w-8 text-center text-base tabular-nums">
                            <span
                              key={line.quantity}
                              className="inline-block motion-safe:animate-tablecast-state"
                            >
                              {line.quantity}
                            </span>
                          </output>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={disabled || line.quantity >= 20}
                            aria-label={`${line.name[locale]}: ${t("common_increase")}`}
                            onClick={() => onQuantity(line, line.quantity + 1)}
                          >
                            <Plus />
                          </Button>
                        </div>
                      )}
                      {onRemove && (
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          className="text-muted-foreground"
                          disabled={disabled}
                          onClick={() => onRemove(line)}
                        >
                          <Trash2 aria-hidden />
                          {t("common_remove")}
                        </Button>
                      )}
                    </div>
                  )}
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
                  {line.missing.length > 0 && (
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
const CartLineSurface = forwardRef<HTMLLIElement, { children: ReactNode }>(function CartLineSurface(
  { children },
  ref,
) {
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
      className="@container/cart-line relative overflow-hidden rounded-xl bg-surface-subtle"
    >
      {children}
    </m.li>
  );
});
