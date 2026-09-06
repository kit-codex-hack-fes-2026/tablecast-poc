import { Button } from "../../components/ui/button";
import { Dialog } from "@base-ui/react/dialog";
import { Checkbox } from "@base-ui/react/checkbox";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { CartLine, Catalog, PricedLine, Product } from "@tablecast/api/schema";
import { Check, ChevronRight, ImageOff, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { money, useI18n } from "../../i18n/locale";

export function ProductMenu({
  catalog,
  onChoose,
}: {
  catalog: Catalog;
  onChoose: (product: Product) => void;
}) {
  const { locale, t } = useI18n();
  const [category, setCategory] = useState("all");
  const products = catalog.configuration.products.filter(
    (product) => category === "all" || product.categoryId === category,
  );
  return (
    <>
      <fieldset className="category-list" aria-label={t("kiosk_menu")}>
        <Button
          variant="ghost"
          type="button"
          aria-pressed={category === "all"}
          onClick={() => setCategory("all")}
        >
          {t("kiosk_all")}
        </Button>
        {catalog.configuration.categories.map((item) => (
          <Button
            variant="ghost"
            type="button"
            key={item.id}
            aria-pressed={category === item.id}
            onClick={() => setCategory(item.id)}
          >
            {item.text[locale].displayName}
          </Button>
        ))}
      </fieldset>
      <div className="product-grid">
        {products.map((product) => (
          <Button
            variant="ghost"
            type="button"
            className="product-card h-auto flex-col items-stretch justify-start whitespace-normal p-0 text-left"
            key={product.id}
            onClick={() => onChoose(product)}
            disabled={!product.available}
          >
            <span className={`product-image category-${product.categoryId}`}>
              {product.imageKey ? (
                <img src={`/media/${product.imageKey}`} alt="" loading="lazy" />
              ) : (
                <span className="no-image">
                  <ImageOff size={26} strokeWidth={1} aria-hidden="true" />
                  <small>{t("kiosk_no_image")}</small>
                </span>
              )}
              {!product.available && <span className="sold-out">{t("kiosk_sold_out")}</span>}
              {product.imageKey && product.imageKind === "illustration" && (
                <span className="illustration-label">{t("kiosk_illustration")}</span>
              )}
            </span>
            <span className="product-copy">
              <strong>{product.text[locale].displayName}</strong>
              <span>
                {money(product.price, locale)}
                <span className="product-add" aria-hidden="true">
                  <Plus size={16} />
                </span>
              </span>
            </span>
          </Button>
        ))}
      </div>
    </>
  );
}

export function CartLines({
  lines,
  onEdit,
  onRemove,
  disabled = false,
}: {
  lines: PricedLine[];
  onEdit?: (line: PricedLine) => void;
  onRemove?: (line: PricedLine) => void;
  disabled?: boolean;
}) {
  const { locale, t } = useI18n();
  if (lines.length === 0)
    return (
      <div className="cart-empty">
        <ShoppingBag size={32} strokeWidth={1.2} aria-hidden="true" />
        <h3>{t("kiosk_cart_empty")}</h3>
      </div>
    );
  return (
    <ul className="cart-lines">
      {lines.map((line) => (
        <li key={line.id}>
          <div className="cart-line-heading">
            <strong>{line.name[locale]}</strong>
            <span>{money(line.total, locale)}</span>
          </div>
          <div className="line-options">
            {line.options.map((option) => (
              <span key={option.id}>
                {option.name[locale]}
                {option.quantity > 1 && ` × ${option.quantity}`}
                {option.priceDelta !== 0 && ` (${money(option.priceDelta, locale)})`}
              </span>
            ))}
          </div>
          <div className="cart-line-footer">
            <span>
              {t("common_quantity")} {line.quantity} · {money(line.unitPrice, locale)}
            </span>
            {line.planCovered && <span className="chip">{t("kiosk_plan_included")}</span>}
            {onEdit && (
              <Button
                variant="ghost"
                type="button"
                className="text-button"
                disabled={disabled}
                onClick={() => onEdit(line)}
              >
                {t("kiosk_edit")}
                <ChevronRight size={14} aria-hidden="true" />
              </Button>
            )}
            {onRemove && (
              <Button
                variant="ghost"
                type="button"
                className="text-button muted"
                disabled={disabled}
                onClick={() => onRemove(line)}
              >
                {t("common_remove")}
              </Button>
            )}
          </div>
          {line.missing.length > 0 && (
            <span className="missing-selection">{t("kiosk_missing")}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

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
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Viewport className="dialog-viewport">
          <Dialog.Popup className="dialog product-dialog">
            <div className="dialog-heading">
              <Dialog.Close
                className="icon-button ml-auto"
                aria-label={t("common_close")}
                disabled={busy}
              >
                <X size={22} />
              </Dialog.Close>
            </div>
            <div className="dialog-scroll mt-0">
              <Dialog.Title>{product.text[locale].displayName}</Dialog.Title>
              <Dialog.Description className="text-xs leading-[1.9] text-muted-foreground">
                {product.text[locale].description}
              </Dialog.Description>
              <div className="product-base-price mb-4">
                {money(product.price, locale)} <small>{t("common_price_note")}</small>
              </div>
              {product.modifiers.map((group) => (
                <fieldset className="modifier-group" key={group.id}>
                  <legend>
                    {group.text[locale].displayName}
                    <span className={group.min > 0 ? "chip required" : "chip"}>
                      {group.min > 0 ? t("kiosk_required") : t("kiosk_optional")} · {group.min}–
                      {group.max}
                    </span>
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
                        <label className="option-row">
                          <Radio.Root className="radio-control" value="" disabled={busy}>
                            <Radio.Indicator className="radio-dot" />
                          </Radio.Root>
                          <span>{t("kiosk_no_selection")}</span>
                        </label>
                      )}
                      {group.options.map((option) => (
                        <label className="option-row" key={option.id}>
                          <Radio.Root
                            className="radio-control"
                            value={option.id}
                            disabled={!option.available || busy}
                          >
                            <Radio.Indicator className="radio-dot" />
                          </Radio.Root>
                          <span>{option.text[locale].displayName}</span>
                          <small>
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
                        <div className="option-row" key={option.id}>
                          {group.kind === "multiple" ? (
                            <label className="checkbox-label">
                              <Checkbox.Root
                                className="checkbox-control"
                                checked={amount > 0}
                                onCheckedChange={(checked) => select(option.id, checked ? 1 : 0)}
                                disabled={!option.available || busy}
                              >
                                <Checkbox.Indicator>
                                  <Check size={16} />
                                </Checkbox.Indicator>
                              </Checkbox.Root>
                              <span>{option.text[locale].displayName}</span>
                            </label>
                          ) : (
                            <span>{option.text[locale].displayName}</span>
                          )}
                          <small>
                            {!option.available
                              ? t("kiosk_sold_out")
                              : option.priceDelta !== 0
                                ? money(option.priceDelta, locale)
                                : ""}
                          </small>
                          {group.kind === "quantity" && (
                            <div className="quantity-control">
                              <Button
                                variant="ghost"
                                type="button"
                                aria-label={`${option.text[locale].displayName}: ${t("common_decrease")}`}
                                disabled={amount === 0 || busy}
                                onClick={() => select(option.id, amount - 1)}
                              >
                                <Minus size={16} />
                              </Button>
                              <output>{amount}</output>
                              <Button
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
              <div className="allergen-notice">
                <h3>{t("kiosk_allergens")}</h3>
                <p>{product.allergens.note[locale] || t("kiosk_unknown")}</p>
                {product.allergens.vegan === "yes" && <p>{t("kiosk_vegan")}</p>}
                {product.allergens.crossContact !== "controlled" && (
                  <p>{t("kiosk_cross_contact")}</p>
                )}
                <small>{t("kiosk_allergen_note")}</small>
              </div>
            </div>
            <ErrorNotice error={error} />
            <div className="dialog-actions">
              <div className="quantity-control">
                <Button
                  variant="ghost"
                  type="button"
                  aria-label={t("common_decrease")}
                  disabled={quantity <= 1 || busy}
                  onClick={() => setQuantity(quantity - 1)}
                >
                  <Minus size={18} />
                </Button>
                <output aria-label={t("common_quantity")}>{quantity}</output>
                <Button
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
                className="primary-button"
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
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
