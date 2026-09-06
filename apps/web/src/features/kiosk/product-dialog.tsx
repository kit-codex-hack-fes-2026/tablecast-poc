import { RadioGroup } from "@base-ui/react/radio-group";
import type { CartLine, Product } from "@tablecast/api/schema";
import { Minus, Plus, X } from "lucide-react";
import { useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScroll,
  DialogTitle,
} from "../../components/ui/dialog";
import { RadioGroupItem } from "../../components/ui/radio-group";
import { money, useI18n } from "../../i18n/locale";

export function ProductDialog({
  product,
  initial,
  busy,
  error,
  onClose,
  onSave,
}: {
  product: Product;
  initial?: CartLine;
  busy: boolean;
  error?: unknown;
  onClose: () => void;
  onSave: (line: CartLine) => void;
}) {
  const { locale, t } = useI18n();
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [selections, setSelections] = useState<CartLine["selections"]>(initial?.selections ?? []);
  function select(optionId: string, amount: number, replaceIds: string[] = []) {
    setSelections((current) => [
      ...current.filter(
        (item) => item.optionId !== optionId && !replaceIds.includes(item.optionId),
      ),
      ...(amount > 0 ? [{ optionId, quantity: amount }] : []),
    ]);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="product-dialog">
        <DialogHeader>
          <DialogClose className="ml-auto" aria-label={t("common_close")} disabled={busy}>
            <X size={22} />
          </DialogClose>
        </DialogHeader>
        <DialogScroll className="mt-0">
          <DialogTitle>{product.text[locale].displayName}</DialogTitle>
          <DialogDescription className="text-xs leading-loose text-muted-foreground">
            {product.text[locale].description}
          </DialogDescription>
          <div className="product-base-price text-xl font-medium pt-3 mb-4">
            {money(product.price, locale)}{" "}
            <small className="text-muted-foreground text-xs font-normal ml-1.5">
              {t("common_price_note")}
            </small>
          </div>
          {product.modifiers.map((group) => (
            <fieldset className="border-t border-t-border pt-5 px-0 pb-0.5 mb-4" key={group.id}>
              <legend className="flex items-center justify-between gap-3 w-full text-sm font-semibold pt-3.5">
                {group.text[locale].displayName}
                <Badge
                  variant="secondary"
                  data-required={group.min > 0 || undefined}
                  className="data-required:bg-accent-soft data-required:text-accent-foreground"
                >
                  {group.min > 0 ? t("kiosk_required") : t("kiosk_optional")} · {group.min}–
                  {group.max}
                </Badge>
              </legend>
              {group.kind === "single" ? (
                <RadioGroup
                  value={
                    selections.find((item) =>
                      group.options.some((option) => option.id === item.optionId),
                    )?.optionId ?? ""
                  }
                  onValueChange={(value) => {
                    if (typeof value === "string")
                      select(
                        value,
                        value === "" ? 0 : 1,
                        group.options.map((option) => option.id),
                      );
                  }}
                  aria-label={group.text[locale].displayName}
                >
                  {group.min === 0 && (
                    <label className="min-h-14 flex items-center gap-3 py-2 px-0 text-sm [&_>_small]:ml-auto [&_>_small]:text-muted-foreground [&_>_small]:text-xs [&_>_small]:whitespace-nowrap [&_.quantity-control_button]:w-9 [&_.quantity-control_button]:min-h-11 max-sm:flex-wrap">
                      <RadioGroupItem value="" disabled={busy}></RadioGroupItem>
                      <span>{t("kiosk_no_selection")}</span>
                    </label>
                  )}
                  {group.options.map((option) => (
                    <label
                      className="min-h-14 flex items-center gap-3 py-2 px-0 text-sm [&_.quantity-control_button]:w-9 [&_.quantity-control_button]:min-h-11 max-sm:flex-wrap"
                      key={option.id}
                    >
                      <RadioGroupItem
                        value={option.id}
                        disabled={!option.available || busy}
                      ></RadioGroupItem>
                      <span>{option.text[locale].displayName}</span>
                      <small className="ml-auto text-muted-foreground text-xs whitespace-nowrap">
                        {!option.available
                          ? t("kiosk_sold_out")
                          : option.priceDelta !== 0
                            ? money(option.priceDelta, locale)
                            : ""}
                      </small>
                    </label>
                  ))}
                </RadioGroup>
              ) : (
                group.options.map((option) => {
                  const amount =
                    selections.find((item) => item.optionId === option.id)?.quantity ?? 0;
                  return (
                    <div
                      className="min-h-14 flex items-center gap-3 py-2 px-0 text-sm [&_.quantity-control_button]:w-9 [&_.quantity-control_button]:min-h-11 max-sm:flex-wrap"
                      key={option.id}
                    >
                      {group.kind === "multiple" ? (
                        <label className="flex items-center gap-3">
                          <Checkbox
                            checked={amount > 0}
                            onCheckedChange={(checked) => select(option.id, checked ? 1 : 0)}
                            disabled={!option.available || busy}
                          ></Checkbox>
                          <span>{option.text[locale].displayName}</span>
                        </label>
                      ) : (
                        <span>{option.text[locale].displayName}</span>
                      )}
                      <small className="ml-auto text-muted-foreground text-xs whitespace-nowrap">
                        {!option.available
                          ? t("kiosk_sold_out")
                          : option.priceDelta !== 0
                            ? money(option.priceDelta, locale)
                            : ""}
                      </small>
                      {group.kind === "quantity" && (
                        <div className="quantity-control inline-flex items-center border border-border rounded-md shrink-0">
                          <Button
                            className="flex items-center justify-center w-11 min-h-14 max-sm:w-9"
                            variant="ghost"
                            type="button"
                            aria-label={`${option.text[locale].displayName}: ${t("common_decrease")}`}
                            disabled={amount === 0 || busy}
                            onClick={() => select(option.id, amount - 1)}
                          >
                            <Minus size={16} />
                          </Button>
                          <output className="text-center text-base min-w-7">{amount}</output>
                          <Button
                            className="flex items-center justify-center w-11 min-h-14 max-sm:w-9"
                            variant="ghost"
                            type="button"
                            aria-label={`${option.text[locale].displayName}: ${t("common_increase")}`}
                            disabled={amount >= option.maxQuantity || !option.available || busy}
                            onClick={() => select(option.id, amount + 1)}
                          >
                            <Plus size={16} />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </fieldset>
          ))}
          <div className="bg-surface-subtle rounded-md p-4 mt-1">
            <h3 className="text-xs mb-2">{t("kiosk_allergens")}</h3>
            <p className="block text-xs leading-loose text-muted-foreground">
              {product.allergens.note[locale] || t("kiosk_unknown")}
            </p>
            {product.allergens.vegan === "yes" && (
              <p className="block text-xs leading-loose text-muted-foreground">
                {t("kiosk_vegan")}
              </p>
            )}
            {product.allergens.crossContact !== "controlled" && (
              <p className="block text-xs leading-loose text-muted-foreground">
                {t("kiosk_cross_contact")}
              </p>
            )}
            <small className="block text-xs leading-loose text-muted-foreground mt-2">
              {t("kiosk_allergen_note")}
            </small>
          </div>
        </DialogScroll>
        <ErrorNotice error={error} />
        <DialogFooter>
          <div className="quantity-control inline-flex items-center border border-border rounded-md shrink-0">
            <Button
              className="flex items-center justify-center w-11 min-h-14 max-sm:w-9"
              variant="ghost"
              type="button"
              aria-label={t("common_decrease")}
              disabled={quantity <= 1 || busy}
              onClick={() => setQuantity(quantity - 1)}
            >
              <Minus size={18} />
            </Button>
            <output className="text-center text-base min-w-7" aria-label={t("common_quantity")}>
              {quantity}
            </output>
            <Button
              className="flex items-center justify-center w-11 min-h-14 max-sm:w-9"
              variant="ghost"
              type="button"
              aria-label={t("common_increase")}
              disabled={quantity >= 20 || busy}
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus size={18} />
            </Button>
          </div>
          <Button
            variant="default"
            size="lg"
            type="button"

            disabled={busy || !product.available}
            onClick={() =>
              onSave({
                id: initial?.id ?? crypto.randomUUID(),
                productId: product.id,
                quantity,
                selections,
              })
            }
          >
            {initial ? t("common_update") : t("kiosk_add")}
            <Plus size={19} aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
