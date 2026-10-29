import type { CartLine, CoreState, Product } from "@tablecast/api/schema";
import type { ReactNode, RefObject } from "react";
import { Popover } from "@base-ui/react/popover";
import { useHydrated } from "@tanstack/react-router";
import { LoaderCircle, ReceiptText, ShoppingBag, Utensils, X } from "lucide-react";
import { Money } from "../../components/money";
import { ProductImage } from "../../components/product-image";
import { Button } from "../../components/ui/button";
import { surfaceMotion } from "../../components/ui/motion-variants";
import * as Tabs from "../../components/ui/tabs";
import { useI18n } from "../../i18n/locale";

export function KioskMenuTabs({
  data,
  cartLines,
  cartPending,
  products = [],
  cartActions,
  checkoutOpen,
  onCheckoutOpenChange,
  reviewing,
  confirmationHeading,
  orderPane,
}: {
  cartActions: ReactNode;
  cartLines: CartLine[];
  cartPending: boolean;
  checkoutOpen: boolean;
  confirmationHeading: RefObject<HTMLHeadingElement | null>;
  data: CoreState;
  onCheckoutOpenChange: (open: boolean) => void;
  orderPane: RefObject<HTMLElement | null>;
  products?: Product[];
  reviewing: boolean;
}) {
  const hydrated = useHydrated();
  const { t } = useI18n();
  function imagesFor(lines: { productId: string }[]) {
    return [
      ...new Set(
        lines
          .map((line) => products.find((product) => product.id === line.productId)?.imageKey)
          .filter((key): key is string => Boolean(key)),
      ),
    ].slice(0, 3);
  }
  const images = imagesFor(cartLines);
  const orderedImages = imagesFor(data.orderSummary.productIds.map((productId) => ({ productId })));
  const quantity = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const orderedQuantity = data.orderSummary.quantity;
  const priceClass = "block whitespace-nowrap text-sm tabular-nums";
  const tabClass =
    "h-14 min-h-14 min-w-0 flex-col gap-0 px-1 py-0 text-sm leading-tight whitespace-nowrap text-center [&_svg]:size-4";
  return (
    <div className="relative">
      <Tabs.List
        data-ui="menu-tabs"
        className="grid w-full grid-cols-3 gap-1 rounded-none border-t border-border px-2 pt-1 pb-3 overflow-x-auto @max-[32rem]/tablecast-order:grid-cols-[max-content_minmax(max-content,1fr)_minmax(max-content,1fr)] @max-[32rem]/tablecast-order:px-1"
      >
        <Tabs.Tab
          className={tabClass}
          size="guest"
          data-theme-part="menu-tab"
          disabled={!hydrated}
          value="menu"
        >
          <span className="flex h-full flex-col items-center justify-center gap-0.5">
            <Utensils aria-hidden />
            <span>{t("kiosk_menu")}</span>
          </span>
        </Tabs.Tab>
        <Popover.Root open={checkoutOpen} onOpenChange={onCheckoutOpenChange}>
          <Popover.Trigger
            render={<Tabs.Tab value="cart" className={tabClass} size="guest" />}
            data-theme-part="menu-tab"
            data-ui="cart-tab"
            disabled={!hydrated}
          >
            <span className="flex h-8 max-w-full items-center justify-center gap-1">
              <ShoppingBag aria-hidden data-ui="cart-icon" className="shrink-0" />
              <span className="min-w-0 whitespace-nowrap leading-none">{t("kiosk_cart")}</span>
              <span
                data-ui="cart-count"
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-control px-1 text-foreground tabular-nums"
              >
                {quantity}
              </span>
              <TabProductImages images={images} kind="cart" />
            </span>
            <span data-ui="tab-price" className={priceClass}>
              <Money taxIncluded value={data.cart.total} />
              {cartPending && (
                <LoaderCircle
                  role="status"
                  aria-label={t("kiosk_cart_syncing")}
                  className="ml-1 inline-block size-3.5 motion-safe:animate-spin"
                />
              )}
            </span>
          </Popover.Trigger>
          <Popover.Portal container={orderPane}>
            <Popover.Positioner
              side="top"
              sideOffset={12}
              collisionPadding={12}
              collisionBoundary={orderPane.current ?? undefined}
              className="z-40"
            >
              <Popover.Popup
                data-ui="order-actions"
                data-theme-part="checkout"
                render={(popupProps, state) => (
                  <div {...popupProps} inert={!state.open} aria-hidden={!state.open || undefined} />
                )}
                className={surfaceMotion({
                  kind: "popup",
                  className:
                    "w-80 max-w-[var(--available-width)] max-h-[var(--available-height)] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl scrollbar-thin",
                })}
              >
                <div className="flex items-center justify-between gap-3">
                  <Popover.Title
                    ref={confirmationHeading}
                    tabIndex={-1}
                    className="text-base font-semibold outline-none"
                  >
                    {reviewing ? t("kiosk_review_title") : t("kiosk_cart")}
                  </Popover.Title>
                  <Popover.Close
                    render={<Button variant="ghost" size="icon-sm" />}
                    aria-label={t("common_close")}
                  >
                    <X aria-hidden />
                  </Popover.Close>
                </div>
                <div className="my-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{t("kiosk_cart_total")}</span>
                  <strong>
                    <Money taxIncluded value={data.cart.total} />
                  </strong>
                </div>
                {reviewing && (
                  <Popover.Description className="mb-4 text-sm text-muted-foreground">
                    {t("kiosk_review_note")}
                  </Popover.Description>
                )}
                <div role="group" aria-label={t("kiosk_cart")}>
                  {cartActions}
                </div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        <Tabs.Tab
          className={tabClass}
          size="guest"
          data-theme-part="menu-tab"
          disabled={!hydrated}
          value="orders"
        >
          <span className="flex h-8 max-w-full items-center justify-center gap-1">
            <ReceiptText aria-hidden data-ui="orders-icon" className="shrink-0" />
            <span className="min-w-0 whitespace-nowrap leading-none">{t("kiosk_orders_bill")}</span>
            <span
              data-ui="orders-count"
              className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-control px-1 text-foreground tabular-nums"
            >
              {orderedQuantity}
            </span>
            <TabProductImages images={orderedImages} kind="orders" />
          </span>
          <span data-ui="tab-price" className={priceClass}>
            <Money taxIncluded value={data.bill.orderedTotal} />
          </span>
        </Tabs.Tab>
      </Tabs.List>
    </div>
  );
}

function TabProductImages({ images, kind }: { images: string[]; kind: "cart" | "orders" }) {
  if (!images.length) return null;
  return (
    <span
      aria-hidden
      data-ui={`${kind}-preview`}
      className="ml-2 flex shrink-0 -space-x-3 @max-[32rem]/tablecast-order:-space-x-4.5"
    >
      {images.map((imageKey) => (
        <span
          key={imageKey}
          data-image-key={imageKey}
          className="inline-flex size-8 shrink-0 overflow-hidden rounded-lg border border-card bg-card shadow-sm"
        >
          <ProductImage
            src={`/media/${imageKey}`}
            width={32}
            height={32}
            sizes="32px"
            alt=""
            className="size-full object-contain"
          />
        </span>
      ))}
    </span>
  );
}
