import type { CartLine, Product } from "@tablecast/api/schema";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { FoodInformationView } from "../../components/food-information";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { NumericField } from "../configuration/configuration-fields";

export function FoodPreview({ product, storeId }: { product: Product; storeId: string }) {
  const { t, locale } = useI18n();
  const [selections, setSelections] = useState<CartLine["selections"]>([]);
  const signature = JSON.stringify({ product, selections });
  const preview = useMutation({
    mutationFn: async (input: {
      product: Product;
      selections: CartLine["selections"];
      signature: string;
    }) => ({
      signature: input.signature,
      result: await parseResponse(
        rpc.api.admin.stores[":storeId"]["food-information"].preview.$post({
          param: { storeId },
          json: { product: input.product, selections: input.selections },
        }),
      ),
    }),
  });
  const result = preview.data?.signature === signature ? preview.data.result : undefined;
  return (
    <section aria-label={t("food_preview")}>
      <h3 className="pb-3 text-sm font-semibold">{t("food_preview")}</h3>
      <div className="grid gap-4">
        {product.modifiers.map((group) => (
          <fieldset key={group.id}>
            <legend className="mb-2 font-medium">{group.text[locale].displayName}</legend>
            {group.options.map((option) =>
              group.kind === "quantity" ? (
                <NumericField
                  key={option.id}
                  label={option.text[locale].displayName}
                  min={0}
                  max={option.maxQuantity}
                  value={
                    selections.find((selection) => selection.optionId === option.id)?.quantity ?? 0
                  }
                  onChange={(quantity) => {
                    if (!Number.isInteger(quantity) || quantity < 0) return;
                    setSelections((current) => [
                      ...current.filter((selection) => selection.optionId !== option.id),
                      ...(quantity > 0 ? [{ optionId: option.id, quantity }] : []),
                    ]);
                  }}
                />
              ) : (
                <label key={option.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <Checkbox
                    checked={selections.some((selection) => selection.optionId === option.id)}
                    onCheckedChange={(checked) =>
                      setSelections((current) =>
                        checked
                          ? [
                              ...(group.kind === "single"
                                ? current.filter(
                                    (selection) =>
                                      !group.options.some((item) => item.id === selection.optionId),
                                  )
                                : current),
                              { optionId: option.id, quantity: 1 },
                            ]
                          : current.filter((selection) => selection.optionId !== option.id),
                      )
                    }
                  />
                  {option.text[locale].displayName}
                </label>
              ),
            )}
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={preview.isPending}
          onClick={() => preview.mutate({ signature, product, selections })}
        >
          {t("food_preview_run")}
        </Button>
        <ErrorNotice error={preview.variables?.signature === signature ? preview.error : null} />
        {result && (
          <>
            <p role="status">
              {t(result.complete ? "food_selection_complete" : "food_selection_incomplete")}
            </p>
            <FoodInformationView value={result.foodInformation} />
          </>
        )}
      </div>
    </section>
  );
}
