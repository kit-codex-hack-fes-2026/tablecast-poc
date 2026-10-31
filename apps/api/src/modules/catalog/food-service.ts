import type { z } from "zod";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { foodPreviewSchema } from "../configuration/model";
import type { foodQuerySchema } from "./model";
import { DomainError, ensure } from "../../platform/errors";
import { productFoodErrors, productFoodInformation, productOptionAllergens } from "./food";
import { priceCart } from "./pricing";
import { getCatalog } from "./queries";

export function previewProductFoodInformation(input: z.infer<typeof foodPreviewSchema>) {
  ensure(productFoodErrors(input.product).length === 0, "FOOD_CONFIGURATION_INVALID", 422);
  let complete = false;
  let selectionError: null | string = null;
  let foodInformation = productFoodInformation(input.product, input.selections);
  try {
    const cart = priceCart(
      { products: [input.product] },
      [
        {
          id: "tablecast-food-preview",
          productId: input.product.id,
          quantity: 1,
          selections: input.selections,
        },
      ],
      0,
    );
    complete = cart.complete;
    if (!complete) selectionError = "CART_INCOMPLETE";
    foodInformation = cart.lines[0]?.foodInformation ?? foodInformation;
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    selectionError = error.code;
  }
  return { productId: input.product.id, foodInformation, complete, selectionError };
}

export async function getProductFoodInformation(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof foodQuerySchema>,
) {
  const catalog = await getCatalog(services, actor.storeId, actor.demoId);
  const product = catalog.configuration.products.find((item) => item.id === input.productId);
  ensure(product, "PRODUCT_NOT_FOUND", 404);
  return {
    configVersion: catalog.version,
    optionAllergens: productOptionAllergens(product),
    ...previewProductFoodInformation({ product, selections: input.selections }),
  };
}
