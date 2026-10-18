import type { PricedLine, Product } from "@tablecast/api/schema";
import { ChevronRight, Minus, Plus, ShoppingBag } from "lucide-react";
import { ConditionSummary } from "./condition-summary";
import { ProductImage } from "./product-image";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { money } from "../i18n/format";
import { useI18n } from "../i18n/locale";

export function CartLines({
  lines,
  onEdit,
  onRemove,
  onQuantity,
  products = [],
  disabled = false,
}: {
  lines: PricedLine[];
  onEdit?: (line: PricedLine) => void;
  onRemove?: (line: PricedLine) => void;
  disabled?: boolean;
  products?: Product[];
  onQuantity?: (line: PricedLine, quantity: number) => void;
}) {
  const { locale, t } = useI18n();
  if (lines.length === 0)
    return (
      <div className="flex flex-col items-center gap-2.5 px-5 py-10 text-center text-muted-foreground">
        <ShoppingBag size={32} strokeWidth={1.2} aria-hidden="true" />
        <h3 className="text-base font-medium">{t("kiosk_cart_empty")}</h3>
      </div>
    );
  const productsById = new Map(products.map((product) => [product.id, product]));
  return (
    <ul data-ui="cart-lines" className="divide-y divide-border px-4">
      {lines.map((line) => {
        const product = productsById.get(line.productId);
        return (
          <li className="space-y-2 py-4" key={line.id}>
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
              <span className="whitespace-nowrap">{money(line.total, locale)}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {line.options.map((option) => (
                <span
                  className="rounded-sm bg-background px-1.5 py-0.5 text-sm text-muted-foreground"
                  key={option.id}
                >
                  {option.name[locale]}
                  {option.quantity > 1 && ` × ${option.quantity}`}
                  {option.priceDelta !== 0 && ` (${money(option.priceDelta, locale)})`}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-sm text-muted-foreground">
                {t("common_quantity")} {line.quantity} · {money(line.unitPrice, locale)}
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
                  <output className="min-w-6 text-center text-sm">{line.quantity}</output>
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
                        issue.relation === "requires" ? "condition_requires" : "condition_excludes",
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
          </li>
        );
      })}
    </ul>
  );
}
