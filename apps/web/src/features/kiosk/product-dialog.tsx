import type { CartLine, Product } from "@tablecast/api/schema";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ConditionSummary } from "../../components/condition-summary";
import { ErrorNotice } from "../../components/error-notice";
import { Money, PriceChange } from "../../components/money";
import { ProductImage } from "../../components/product-image";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { quantityControl } from "../../components/ui/quantity-control-variants";
import { RadioGroupItem } from "../../components/ui/radio-group";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages.js";
import { ProductAllergens } from "./product-allergens";
import { OptionContent } from "./product-option-content";
import { optionRow } from "./product-option-model";

export function ProductPage({
  product,
  initial,
  busy,
  error,
  onClose,
  onSave,
}: {
  busy: boolean;
  error?: unknown;
  initial?: CartLine;
  onClose: () => void;
  onSave: (line: CartLine, pointer: boolean, origin: DOMRect) => void;
  product: Product;
}) {
  const { locale, t } = useI18n();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [selections, setSelections] = useState<CartLine["selections"]>(initial?.selections ?? []);
  function select(optionId: string, amount: number, replaceIds: string[] = []) {
    const replaced = new Set(replaceIds);
    setSelections((current) => [
      ...current.filter((item) => item.optionId !== optionId && !replaced.has(item.optionId)),
      ...(amount > 0 ? [{ optionId, quantity: amount }] : []),
    ]);
  }
  return (
    <section
      data-ui="product-detail"
      className="@container/product-dialog flex h-full min-h-0 flex-col"
      aria-label={product.text[locale].displayName}
    >
      <div
        data-ui="product-detail-header"
        className={`grid shrink-0 items-start gap-5 bg-card p-4 ${product.imageKey ? "grid-cols-[8rem_minmax(0,1fr)] @min-[36rem]/product-dialog:grid-cols-[10rem_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}
      >
        {product.imageKey && (
          <ProductImage
            priority
            width={160}
            height={160}
            sizes="(min-width: 640px) 160px, 128px"
            className="col-start-1 row-span-2 row-start-1 size-32 rounded-lg object-top-left @min-[36rem]/product-dialog:row-span-1 @min-[36rem]/product-dialog:size-40"
            src={`/media/${product.imageKey}`}
            alt={product.text[locale].displayName}
          />
        )}
        <div
          className={`min-w-0 py-2 ${product.imageKey ? "col-start-2 row-start-2 @min-[36rem]/product-dialog:row-start-1" : "col-start-1 row-start-1"}`}
        >
          <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
            {product.text[locale].displayName}
          </h2>
          <div className="mt-3 text-lg font-semibold">
            <Money taxIncluded value={product.price} />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className={`row-start-1 justify-self-end ${product.imageKey ? "col-start-2 @min-[36rem]/product-dialog:col-start-3" : "col-start-2"}`}
          onClick={onClose}
          disabled={busy}
        >
          <X />
          {t("common_close")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 scrollbar-thin">
        <p className="mb-2 text-sm leading-relaxed">{product.text[locale].description}</p>
        {product.modifiers.length > 0 && (
          <p className="mb-6 text-sm text-muted-foreground">{t("kiosk_option_price_note")}</p>
        )}
        <div
          data-ui="customisation-groups"
          className="grid items-start gap-6 @min-[36rem]/product-dialog:grid-cols-2"
        >
          {product.modifiers.map((group, groupIndex) => (
            <fieldset className="min-w-0 space-y-2" key={group.id}>
              <legend className="flex items-center justify-between gap-3 w-full pb-1 text-sm font-semibold">
                {group.text[locale].displayName}
                <Badge
                  variant="secondary"
                  data-required={group.min > 0 || undefined}
                  className="h-7 shrink-0 whitespace-nowrap py-0 data-required:bg-accent-soft data-required:text-accent-foreground"
                >
                  {group.min > 0 ? t("kiosk_required") : t("kiosk_optional")} ·{" "}
                  {group.min === group.max
                    ? m.kiosk_select_exact({ count: group.min }, { locale })
                    : group.min === 0
                      ? m.kiosk_select_at_most({ count: group.max }, { locale })
                      : m.kiosk_select_range({ min: group.min, max: group.max }, { locale })}
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
                  className="grid gap-1"
                >
                  {group.min === 0 && (
                    <label className={optionRow()}>
                      <RadioGroupItem value="" disabled={busy}></RadioGroupItem>
                      <span>{t("kiosk_no_selection")}</span>
                    </label>
                  )}
                  {group.options.map((option, optionIndex) => (
                    <label
                      className={optionRow({
                        selected: selections.some((item) => item.optionId === option.id),
                      })}
                      key={option.id}
                    >
                      <RadioGroupItem
                        value={option.id}
                        disabled={!option.available || busy}
                        aria-labelledby={`${id}-${groupIndex}-${optionIndex}-name`}
                        aria-describedby={`${id}-${groupIndex}-${optionIndex}-price ${option.text[locale].description ? `${id}-${groupIndex}-${optionIndex}-description` : ""}`}
                      ></RadioGroupItem>
                      <OptionContent
                        option={option}
                        locale={locale}
                        id={`${id}-${groupIndex}-${optionIndex}`}
                      />
                      <small
                        id={`${id}-${groupIndex}-${optionIndex}-price`}
                        className="ml-auto text-sm whitespace-nowrap text-muted-foreground"
                      >
                        {!option.available ? (
                          t("kiosk_sold_out")
                        ) : option.priceDelta !== 0 ? (
                          <PriceChange value={option.priceDelta} />
                        ) : (
                          ""
                        )}
                      </small>
                    </label>
                  ))}
                </RadioGroup>
              ) : (
                group.options.map((option, optionIndex) => {
                  const amount =
                    selections.find((item) => item.optionId === option.id)?.quantity ?? 0;
                  return (
                    <div
                      className={optionRow({ selected: amount > 0, className: "mb-2 flex-wrap" })}
                      key={option.id}
                    >
                      {group.kind === "multiple" ? (
                        <label
                          htmlFor={`${id}-${groupIndex}-${optionIndex}-control`}
                          className="flex min-w-0 flex-1 items-center gap-2"
                        >
                          <Checkbox
                            id={`${id}-${groupIndex}-${optionIndex}-control`}
                            checked={amount > 0}
                            onCheckedChange={(checked) => select(option.id, checked ? 1 : 0)}
                            disabled={!option.available || busy}
                            aria-labelledby={`${id}-${groupIndex}-${optionIndex}-name`}
                            aria-describedby={`${id}-${groupIndex}-${optionIndex}-price ${option.text[locale].description ? `${id}-${groupIndex}-${optionIndex}-description` : ""}`}
                          ></Checkbox>
                          <OptionContent
                            option={option}
                            locale={locale}
                            id={`${id}-${groupIndex}-${optionIndex}`}
                          />
                        </label>
                      ) : (
                        <OptionContent
                          option={option}
                          locale={locale}
                          id={`${id}-${groupIndex}-${optionIndex}`}
                        />
                      )}
                      <small
                        id={`${id}-${groupIndex}-${optionIndex}-price`}
                        className="ml-auto text-sm whitespace-nowrap text-muted-foreground"
                      >
                        {!option.available ? (
                          t("kiosk_sold_out")
                        ) : option.priceDelta !== 0 ? (
                          <PriceChange value={option.priceDelta} />
                        ) : (
                          ""
                        )}
                      </small>
                      {group.kind === "quantity" && (
                        <div data-ui="quantity-control" className={quantityControl().group()}>
                          <Button
                            size="icon-sm"
                            variant="outline"
                            type="button"
                            aria-describedby={`${id}-${groupIndex}-${optionIndex}-price ${option.text[locale].description ? `${id}-${groupIndex}-${optionIndex}-description` : ""}`}
                            aria-label={`${option.text[locale].displayName}: ${t("common_decrease")}`}
                            disabled={amount === 0 || busy}
                            onClick={() => select(option.id, amount - 1)}
                          >
                            <Minus size={16} />
                          </Button>
                          <output
                            className={quantityControl().value({
                              className: "inline-flex items-center justify-center",
                            })}
                          >
                            {amount}
                          </output>
                          <Button
                            size="icon-sm"
                            variant="outline"
                            type="button"
                            aria-describedby={`${id}-${groupIndex}-${optionIndex}-price ${option.text[locale].description ? `${id}-${groupIndex}-${optionIndex}-description` : ""}`}
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
        </div>
        <ProductAllergens product={product} />
        {product.modifiers.flatMap((group) =>
          group.options.map((option) =>
            option.conditions &&
            selections.some((selection) => selection.optionId === option.id) ? (
              <div key={option.id} className="my-3 space-y-2 rounded-lg bg-muted p-3 text-sm">
                <p className="font-semibold">{option.text[locale].displayName}</p>
                {option.conditions?.requires && (
                  <p>
                    {t("condition_requires")}：
                    <ConditionSummary expression={option.conditions.requires} product={product} />
                  </p>
                )}
                {option.conditions?.excludes && (
                  <p>
                    {t("condition_excludes")}：
                    <ConditionSummary expression={option.conditions.excludes} product={product} />
                  </p>
                )}
              </div>
            ) : null,
          ),
        )}
        <ErrorNotice error={error} />
      </div>
      <div
        data-theme-part="checkout"
        className="flex shrink-0 items-center justify-between gap-3 bg-card p-3"
      >
        <div data-ui="quantity-control" className={quantityControl().group()}>
          <Button
            size="icon-sm"
            variant="outline"
            type="button"
            aria-label={t("common_decrease")}
            disabled={quantity <= 1 || busy}
            onClick={() => setQuantity(quantity - 1)}
          >
            <Minus size={18} />
          </Button>
          <output
            className={quantityControl().value({
              className: "inline-flex items-center justify-center",
            })}
            aria-label={t("common_quantity")}
          >
            {quantity}
          </output>
          <Button
            size="icon-sm"
            variant="outline"
            type="button"
            aria-label={t("common_increase")}
            disabled={quantity >= 20 || busy}
            onClick={() => setQuantity(quantity + 1)}
          >
            <Plus size={18} />
          </Button>
        </div>
        <Button
          data-theme-part="action-button"
          className="h-auto min-h-14 min-w-0 flex-1 shrink whitespace-normal px-3 py-2"
          variant="default"
          size="lg"
          type="button"

          disabled={busy || !product.available}
          onClick={(event) =>
            onSave(
              {
                id: initial?.id ?? crypto.randomUUID(),
                productId: product.id,
                quantity,
                selections,
              },
              event.detail > 0,
              event.currentTarget.getBoundingClientRect(),
            )
          }
        >
          {initial ? t("common_update") : t("kiosk_add")}
          <Plus size={19} aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}
