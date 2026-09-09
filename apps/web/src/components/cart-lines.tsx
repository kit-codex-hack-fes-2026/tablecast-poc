import type { PricedLine, Product } from "@tablecast/api/schema";
import { ChevronRight, Minus, Plus, ShoppingBag } from "lucide-react";
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
      <div className="text-muted-foreground flex items-center flex-col text-center py-10 px-5 gap-2.5 [&_p]:text-xs [&_p]:leading-loose">
        <ShoppingBag size={32} strokeWidth={1.2} aria-hidden="true" />
        <h3 className="text-sm font-medium">{t("kiosk_cart_empty")}</h3>
      </div>
    );
  const productsById = new Map(products.map((product) => [product.id, product]));
  return (
    <ul data-ui="cart-lines" className="list-none py-0 px-4 [&_>_li:last-child]:border-0">
      {lines.map((line) => (
        <li className="py-4 px-0 border-b border-b-border" key={line.id}>
          <div className="flex gap-3 justify-between text-sm">
            {productsById.get(line.productId)?.imageKey && (
              <ProductImage
                width={64}
                height={64}
                sizes="64px"
                className="size-16 shrink-0 rounded-lg object-cover"
                src={`/media/${productsById.get(line.productId)?.imageKey}`}
                alt=""
              />
            )}
            <strong className="flex-1 font-medium">{line.name[locale]}</strong>
            <span className="whitespace-nowrap text-xs">{money(line.total, locale)}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {line.options.map((option) => (
              <span
                className="text-xs text-muted-foreground bg-background py-0.5 px-1.5 rounded-sm"
                key={option.id}
              >
                {option.name[locale]}
                {option.quantity > 1 && ` × ${option.quantity}`}
                {option.priceDelta !== 0 && ` (${money(option.priceDelta, locale)})`}
              </span>
            ))}
          </div>
          <div className="flex items-center flex-wrap gap-y-1.5 gap-x-3 mt-1 [&_[data-slot=button][data-size=text]]:text-xs [&_[data-slot=button][data-size=text]]:min-h-8">
            <span className="text-muted-foreground text-xs">
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
          {line.missing.length > 0 && (
            <span className="text-xs text-destructive inline-flex mt-1.5">
              {t("kiosk_missing")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
