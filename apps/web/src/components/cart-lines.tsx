import type { PricedLine, Product } from "@tablecast/api/schema";
import { ChevronRight, Minus, Plus, ShoppingBag } from "lucide-react";
import { AnimatePresence, useIsPresent, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { forwardRef, type ReactNode } from "react";
import { useI18n } from "../i18n/locale";
import { ConditionSummary } from "./condition-summary";
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
    <m.ul layoutScroll data-ui="cart-lines" className="relative divide-y divide-border px-4">
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
          return (
            <CartLineSurface key={line.id}>
              <div className="flex justify-between gap-3 text-base">
                {product?.imageKey && (
                  <ProductImage
                    width={64}
                    height={64}
                    sizes="64px"
                    className="size-16 shrink-0 rounded-lg object-cover"
                    src={`/media/${product?.imageKey}`}
                    alt=""
                  />
                )}
                <strong className="min-w-0 flex-1 wrap-anywhere font-medium">
                  {line.name[locale]}
                </strong>
                <span className="whitespace-nowrap">
                  <Money value={line.total} />
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {line.options.map((option) => (
                  <span
                    className="rounded-sm bg-background px-1.5 py-0.5 text-sm text-muted-foreground"
                    key={option.id}
                  >
                    {option.name[locale]}
                    {option.quantity > 1 && ` × ${option.quantity}`}
                    {option.priceDelta !== 0 && (
                      <>
                        {" "}
                        (<Money value={option.priceDelta} />)
                      </>
                    )}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-sm text-muted-foreground">
                  {t("common_quantity")} {line.quantity} · <Money value={line.unitPrice} />
                </span>
                {onQuantity && (
                  <div className="flex items-center rounded-lg border border-border">
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={disabled || line.quantity <= 1}
                      aria-label={`${line.name[locale]}: ${t("common_decrease")}`}
                      onClick={() => onQuantity(line, line.quantity - 1)}
                    >
                      <Minus />
                    </Button>
                    <output className="min-w-6 text-center text-sm tabular-nums">
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
                {line.planCovered && <Badge variant="secondary">{t("kiosk_plan_included")}</Badge>}
                {onEdit && (
                  <Button
                    size="text"
                    variant="link"
                    type="button"
                    disabled={disabled}
                    onClick={() => onEdit(line)}
                  >
                    {t("kiosk_edit")}
                    <ChevronRight size={14} aria-hidden="true" />
                  </Button>
                )}
                {onRemove && (
                  <Button
                    size="text"
                    variant="link"
                    type="button"
                    className="text-muted-foreground"
                    disabled={disabled}
                    onClick={() => onRemove(line)}
                  >
                    {t("common_remove")}
                  </Button>
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
              {line.missing.length > 0 && (
                <span className="inline-flex text-sm text-destructive">{t("kiosk_missing")}</span>
              )}
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
      className="space-y-2 py-4"
    >
      {children}
    </m.li>
  );
});
