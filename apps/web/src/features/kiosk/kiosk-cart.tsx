import type { TableState } from "@tablecast/api/schema";
import { Check } from "lucide-react";
import type { useTableSession } from "./kiosk-session";
import { CartLines } from "../../components/cart-lines";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { ProductMenu } from "../../components/product-menu";
import { Button } from "../../components/ui/button";
import * as Tabs from "../../components/ui/tabs";
import { money } from "../../i18n/format";
import { ProductPage } from "./product-dialog";

export function KioskCart({
  data,
  model,
}: {
  data: TableState;
  model: ReturnType<typeof useTableSession>;
}) {
  const {
    t,
    locale,
    ordered,
    setOrdered,
    snapshot,
    confirmationHeading,
    catalog,
    updateCart,
    currentLines,
    edit,
  } = model;
  return (
    <Tabs.Panel value="cart">
      {ordered && (
        <output className="m-3 flex items-center gap-3 rounded-xl border border-success-border bg-success-soft p-3 text-success motion-safe:animate-tablecast-state">
          <Check />
          <strong className="flex-1">{t("kiosk_ordered")}</strong>
          <Button variant="ghost" onClick={() => setOrdered(false)}>
            {t("common_close")}
          </Button>
        </output>
      )}
      {snapshot ? (
        <section
          className="p-4 motion-safe:animate-tablecast-state"
          aria-label={t("kiosk_review_title")}
        >
          <h2
            ref={confirmationHeading}
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            {t("kiosk_review_title")}
          </h2>
          <p className="mt-2 text-sm">{t("kiosk_review_note")}</p>
          <CartLines lines={snapshot.lines} products={catalog.data?.configuration.products} />
          {snapshot.plan && (
            <p>
              {t("kiosk_plan")}: {snapshot.plan.name[locale]}
            </p>
          )}
          <div className="my-3 flex justify-between text-lg font-semibold">
            <span>{t("common_total")}</span>
            <strong>{money(snapshot.total, locale)}</strong>
          </div>
        </section>
      ) : (
        <>
          <CartLines
            lines={data.cart.lines}
            products={
              catalog.data?.version === data.configVersion
                ? catalog.data.configuration.products
                : undefined
            }
            onQuantity={(line, quantity) =>
              updateCart.mutate({
                lines: currentLines().map((item) =>
                  item.id === line.id ? { ...item, quantity } : item,
                ),
                expectedVersion: data.cart.version,
              })
            }
            onEdit={edit}
            onRemove={(line) =>
              updateCart.mutate({
                lines: currentLines().filter((item) => item.id !== line.id),
                expectedVersion: data.cart.version,
              })
            }
            disabled={updateCart.isPending}
          />
        </>
      )}
    </Tabs.Panel>
  );
}

export function KioskMenu({ model }: { model: ReturnType<typeof useTableSession> }) {
  const { selection, updateCart, currentLines, catalog, choose, setSection } = model;
  return (
    <Tabs.Panel value="menu">
      {selection ? (
        <ProductPage
          key={selection.line?.id ?? selection.product.id}
          product={selection.product}
          initial={selection.line}
          busy={updateCart.isPending}
          error={updateCart.error}
          onClose={() => setSection("menu")}
          onSave={(line) =>
            updateCart.mutate({
              lines: [...currentLines().filter((item) => item.id !== line.id), line],
              expectedVersion: selection.cartVersion,
            })
          }
        />
      ) : catalog.data ? (
        <ProductMenu catalog={catalog.data} onChoose={choose} />
      ) : catalog.isPending ? (
        <div className="p-4">
          <LoadingState cards />
        </div>
      ) : null}
      <ErrorNotice
        error={catalog.error}
        onRetry={() => {
          void catalog.refetch();
        }}
      />
    </Tabs.Panel>
  );
}
