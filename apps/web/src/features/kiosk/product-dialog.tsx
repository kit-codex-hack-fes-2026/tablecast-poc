import type { CartLine, Product } from "@tablecast/api/schema";
import { RadioGroup } from "@base-ui/react/radio-group";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ConditionSummary } from "../../components/condition-summary";
import { ErrorNotice } from "../../components/error-notice";
import { ProductImage } from "../../components/product-image";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { RadioGroupItem } from "../../components/ui/radio-group";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
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
  onSave: (line: CartLine) => void;
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
    <section className="flex min-h-0 flex-col" aria-label={product.text[locale].displayName}>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          <ArrowLeft />
          {t("kiosk_menu")}
        </Button>
      </div>
      <div className="p-4">
        {product.imageKey && (
          <ProductImage
            priority
            width={640}
            height={640}
            sizes="(min-width: 640px) 80vw, 100vw"
            className="mb-3 aspect-square w-full rounded-xl object-contain"
            src={`/media/${product.imageKey}`}
            alt={product.text[locale].displayName}
          />
        )}
        <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
          {product.text[locale].displayName}
        </h2>
        <p className="mt-2 text-sm leading-relaxed">{product.text[locale].description}</p>
        <div className="my-3 text-lg font-semibold">{money(product.price, locale)}</div>
        {product.modifiers.map((group, groupIndex) => (
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
                className="grid gap-2"
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
                        className="flex min-w-0 flex-1 items-center gap-3"
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
                      {!option.available
                        ? t("kiosk_sold_out")
                        : option.priceDelta !== 0
                          ? money(option.priceDelta, locale)
                          : ""}
                    </small>
                    {group.kind === "quantity" && (
                      <div
                        data-ui="quantity-control"
                        className="inline-flex items-center border border-border rounded-md shrink-0"
                      >
                        <Button
                          className="flex items-center justify-center w-11 min-h-14"
                          variant="ghost"
                          type="button"
                          aria-describedby={`${id}-${groupIndex}-${optionIndex}-price ${option.text[locale].description ? `${id}-${groupIndex}-${optionIndex}-description` : ""}`}
                          aria-label={`${option.text[locale].displayName}: ${t("common_decrease")}`}
                          disabled={amount === 0 || busy}
                          onClick={() => select(option.id, amount - 1)}
                        >
                          <Minus size={16} />
                        </Button>
                        <output className="text-center text-base min-w-7">{amount}</output>
                        <Button
                          className="flex items-center justify-center w-11 min-h-14"
                          variant="ghost"
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
        <ProductAllergens product={product} />
      </div>
      {product.modifiers.flatMap((group) =>
        group.options.map((option) =>
          option.conditions && selections.some((selection) => selection.optionId === option.id) ? (
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
      <div
        data-theme-part="checkout"
        className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-card p-3"
      >
        <div
          data-ui="quantity-control"
          className="inline-flex items-center border border-border rounded-md shrink-0"
        >
          <Button
            className="flex items-center justify-center w-11 min-h-14"
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
            className="flex items-center justify-center w-11 min-h-14"
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
          data-theme-part="action-button"
          className="h-auto min-h-14 min-w-0 flex-1 shrink whitespace-normal px-3 py-2"
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
      </div>
    </section>
  );
}
