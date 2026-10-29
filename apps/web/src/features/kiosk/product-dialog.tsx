import { RadioGroup } from "@base-ui/react/radio-group";
import { resolveText, uiLocale } from "@tablecast/api/localization";
import { type CartLine, maxCartLines, type Product } from "@tablecast/api/schema";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { useId, useState } from "react";
import { ConditionSummary } from "../../components/condition-summary";
import { ErrorNotice } from "../../components/error-notice";
import { PriceChange } from "../../components/money";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { quantityControl } from "../../components/ui/quantity-control-variants";
import { RadioGroupItem } from "../../components/ui/radio-group";
import { useI18n } from "../../i18n/locale";
import { type TableEndpoint } from "../../lib/api";
import { m } from "../../paraglide/messages.js";
import { ProductDetailHeader } from "./product-detail-header";
import { useProductFoodInformation } from "./product-food-query";
import { OptionContent } from "./product-option-content";
import { optionRow } from "./product-option-model";

export function ProductPage({
  product,
  endpoint,
  configVersion = 0,
  tableSessionId = "",
  imageSize = 160,
  initial,
  editing = Boolean(initial),
  busy,
  cartLimitReached = false,
  error,
  onClose,
  onSave,
}: {
  busy: boolean;
  cartLimitReached?: boolean;
  configVersion?: number;
  editing?: boolean;
  endpoint?: TableEndpoint;
  error?: unknown;
  imageSize?: number;
  initial?: CartLine;
  onClose: () => void;
  onSave: (line: CartLine, pointer: boolean, origin: DOMRect) => void;
  product: Product;
  tableSessionId?: string;
}) {
  const { locale, t } = useI18n();
  const id = useId();
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [selections, setSelections] = useState<CartLine["selections"]>(initial?.selections ?? []);
  const food = useProductFoodInformation({
    productId: product.id,
    selections,
    endpoint,
    configVersion,
    tableSessionId,
  });
  const saveAction = editing
    ? { label: t("common_update"), Icon: Check }
    : { label: t("kiosk_add"), Icon: ShoppingBag };
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
      className="@container/product-dialog flex max-h-full min-h-0 flex-col rounded-[inherit] bg-card"
      aria-label={resolveText(product.text, locale).displayName}
    >
      <ProductDetailHeader
        product={product}
        imageSize={imageSize}
        busy={busy}
        onClose={onClose}
        food={endpoint ? food : undefined}
      />
      <div
        data-ui="product-detail-body"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pt-2 scrollbar-thin"
      >
        <div
          data-ui="customisation-groups"
          className="grid items-start gap-6 @min-[36rem]/product-dialog:grid-cols-2"
        >
          {product.modifiers.map((group, groupIndex) => (
            <fieldset className="min-w-0 space-y-2" key={group.id}>
              <legend className="flex items-center justify-between gap-3 w-full pb-1 text-sm font-semibold">
                {resolveText(group.text, locale).displayName}
                <Badge
                  variant="secondary"
                  data-required={group.min > 0 || undefined}
                  className="h-7 shrink-0 whitespace-nowrap py-0 data-required:bg-accent-soft data-required:text-accent-foreground"
                >
                  {group.min > 0 ? t("kiosk_required") : t("kiosk_optional")} ·{" "}
                  {group.min === group.max
                    ? m.kiosk_select_exact({ count: group.min }, { locale: uiLocale(locale) })
                    : group.min === 0
                      ? m.kiosk_select_at_most({ count: group.max }, { locale: uiLocale(locale) })
                      : m.kiosk_select_range(
                          { min: group.min, max: group.max },
                          { locale: uiLocale(locale) },
                        )}
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
                  aria-label={resolveText(group.text, locale).displayName}
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
                        aria-describedby={`${id}-${groupIndex}-${optionIndex}-price ${endpoint ? `${id}-${groupIndex}-${optionIndex}-allergens` : ""} ${resolveText(option.text, locale).description ? `${id}-${groupIndex}-${optionIndex}-description` : ""}`}
                      ></RadioGroupItem>
                      <OptionContent
                        option={option}
                        showAllergens={Boolean(endpoint)}
                        allergens={food.data?.optionAllergens[option.id]}
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
                      className={optionRow({
                        selected: amount > 0,
                        className: "mb-2 flex-wrap",
                      })}
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
                            aria-describedby={`${id}-${groupIndex}-${optionIndex}-price ${endpoint ? `${id}-${groupIndex}-${optionIndex}-allergens` : ""} ${resolveText(option.text, locale).description ? `${id}-${groupIndex}-${optionIndex}-description` : ""}`}
                          ></Checkbox>
                          <OptionContent
                            option={option}
                            showAllergens={Boolean(endpoint)}
                            allergens={food.data?.optionAllergens[option.id]}
                            locale={locale}
                            id={`${id}-${groupIndex}-${optionIndex}`}
                          />
                        </label>
                      ) : (
                        <OptionContent
                          option={option}
                          showAllergens={Boolean(endpoint)}
                          allergens={food.data?.optionAllergens[option.id]}
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
                            aria-describedby={`${id}-${groupIndex}-${optionIndex}-price ${endpoint ? `${id}-${groupIndex}-${optionIndex}-allergens` : ""} ${resolveText(option.text, locale).description ? `${id}-${groupIndex}-${optionIndex}-description` : ""}`}
                            aria-label={`${resolveText(option.text, locale).displayName}: ${t("common_decrease")}`}
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
                            aria-describedby={`${id}-${groupIndex}-${optionIndex}-price ${endpoint ? `${id}-${groupIndex}-${optionIndex}-allergens` : ""} ${resolveText(option.text, locale).description ? `${id}-${groupIndex}-${optionIndex}-description` : ""}`}
                            aria-label={`${resolveText(option.text, locale).displayName}: ${t("common_increase")}`}
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

        <p className="mt-4 text-sm leading-relaxed">
          {resolveText(product.text, locale).description}
        </p>
        {product.modifiers.flatMap((group) =>
          group.options.map((option) =>
            option.conditions &&
            selections.some((selection) => selection.optionId === option.id) ? (
              <div key={option.id} className="my-3 space-y-2 rounded-lg bg-muted p-3 text-sm">
                <p className="font-semibold">{resolveText(option.text, locale).displayName}</p>
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
      {cartLimitReached && (
        <p role="status" className="bg-card px-4 py-2 text-sm text-muted-foreground">
          {m.kiosk_cart_limit({ count: maxCartLines }, { locale: uiLocale(locale) })}
        </p>
      )}
      <div
        data-theme-part="checkout"
        className="flex shrink-0 items-center justify-between gap-3 rounded-b-3xl bg-card p-3"
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
          className="h-auto min-h-14 min-w-0 shrink whitespace-normal px-4 py-2"
          variant="default"
          size="lg"
          type="button"
          disabled={busy || !product.available || cartLimitReached}
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
          {saveAction.label}
          <saveAction.Icon aria-hidden />
        </Button>
      </div>
    </section>
  );
}
