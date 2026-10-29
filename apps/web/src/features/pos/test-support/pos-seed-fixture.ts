import type { Locale, PosCatalog, PosCheckoutView, PosSettings } from "@tablecast/api/schema";
import { catalog, table } from "../../../../.storybook/tablecast-fixtures";
import { posCheckoutFixture, posSettingsFixture } from "./pos-fixture";

const invoice = posCheckoutFixture.invoice;
if (!invoice) throw new Error("会計fixtureがありません");
const products = catalog.configuration.products.filter((product) => product.imageKey).slice(0, 3);
export const posSeedSettings: PosSettings = {
  ...posSettingsFixture,
  products: products.map((product) => ({
    id: product.id,
    name: { ja: product.text.ja.displayName, en: product.text.en.displayName },
    price: product.price,
    available: product.available,
    imageKey: product.imageKey,
    imageKind: product.imageKind,
    options: product.modifiers.flatMap((group) =>
      group.options.map((option) => ({
        id: option.id,
        name: { ja: option.text.ja.displayName, en: option.text.en.displayName },
        price: option.priceDelta,
        imageKey: option.imageKey,
        imageKind: option.imageKind,
      })),
    ),
  })),
  mappings: products.flatMap((product) => [
    { kind: "product" as const, localId: product.id, externalId: `square-${product.id}` },
    ...product.modifiers.flatMap((group) =>
      group.options.map((option) => ({
        kind: "option" as const,
        localId: option.id,
        externalId: `square-${option.id}`,
      })),
    ),
  ]),
};
export const posSeedCatalog: PosCatalog = {
  locations: [{ id: "tablecast-location", name: catalog.storeName }],
  items: products.map((product) => ({
    id: `square-${product.id}`,
    name: product.text.ja.displayName,
    price: product.price,
    available: product.available,
    options: product.modifiers.flatMap((group) =>
      group.options.map((option) => ({
        id: `square-${option.id}`,
        name: option.text.ja.displayName,
        price: option.priceDelta,
        available: option.available,
      })),
    ),
  })),
  issues: [],
};
export const posSeedCheckout = (locale: Locale): PosCheckoutView => ({
  ...posCheckoutFixture,
  invoice: {
    ...invoice,
    total: table.cart.total,
    lines: table.cart.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      externalId: `square-${line.productId}`,
      name: line.name[locale],
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      referencePrice: line.unitPrice,
      total: line.total,
      options: line.options.map((option) => ({
        id: option.id,
        externalId: `square-${option.id}`,
        name: option.name[locale],
        quantity: option.quantity,
        price: option.priceDelta,
        referencePrice: option.priceDelta,
      })),
    })),
  },
});
