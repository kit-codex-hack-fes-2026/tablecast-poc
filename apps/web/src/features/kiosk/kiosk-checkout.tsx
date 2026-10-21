import type { TableState } from "@tablecast/api/schema";
import { Check, ChevronRight, ShoppingBag } from "lucide-react";
import type { useTableSession } from "./kiosk-session";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { money } from "../../i18n/format";

export function KioskCheckout({
  data,
  model,
}: {
  data: TableState;
  model: ReturnType<typeof useTableSession>;
}) {
  const { t, locale, snapshot, section, setSection, setSnapshot, prepare, updateCart, submit } =
    model;
  const reviewing = snapshot && section === "cart";
  return (
    <footer data-theme-part="checkout" className="shrink-0 border-t border-border bg-card p-3">
      <ErrorNotice error={submit.error} />
      {reviewing ? (
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="h-auto min-h-14 min-w-0 whitespace-normal px-3 py-2"
            disabled={submit.isPending}
            onClick={() => setSnapshot(undefined)}
          >
            {t("kiosk_edit")}
          </Button>
          <Button
            className="col-span-2 h-auto min-h-14 min-w-0 whitespace-normal px-3 py-2"
            disabled={submit.isPending}
            onClick={() => submit.mutate(snapshot)}
          >
            {t("kiosk_confirm")}
            <Check />
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            type="button"
            data-ui="basket-total"
            className="h-auto min-h-14 min-w-0 flex-1 justify-start gap-2 whitespace-normal px-1 py-2 text-left"
            onClick={() => setSection("cart")}
          >
            <ShoppingBag size={20} aria-hidden="true" />
            <span className="min-w-0 text-sm leading-normal text-muted-foreground">
              {t("kiosk_cart")}
              <strong className="block wrap-break-word text-lg font-semibold tracking-tight text-foreground">
                {money(data.cart.total, locale)}
              </strong>
            </span>
          </Button>
          <Button
            type="button"
            className="h-auto min-h-14 min-w-0 flex-1 justify-between whitespace-normal px-3 py-2"
            disabled={
              !snapshot &&
              (!data.cart.complete ||
                data.cart.lines.length === 0 ||
                prepare.isPending ||
                updateCart.isPending)
            }
            onClick={() => (snapshot ? setSection("cart") : prepare.mutate())}
          >
            {t("kiosk_review")}
            <ChevronRight size={20} aria-hidden="true" />
          </Button>
        </div>
      )}
    </footer>
  );
}
