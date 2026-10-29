import { unknownFoodProfile } from "@tablecast/api/schema";
import { LoaderCircle, RefreshCw } from "lucide-react";
import type { ProductFoodQuery } from "./product-food-query";
import { FoodInformationView } from "../../components/food-information";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

export function ProductAllergens({ query }: { query: ProductFoodQuery }) {
  const { t } = useI18n();
  const updating = query.isFetching;
  return (
    <section className="grid min-w-0 gap-1.5" aria-label={t("food_title")} aria-busy={updating}>
      <FoodInformationView
        value={query.data?.foodInformation ?? unknownFoodProfile()}
        caption={
          <>
            <span>{t("food_current_selection")}</span>
            {query.data && !query.data.complete && (
              <span className="shrink-0">{t("food_selection_incomplete")}</span>
            )}
            <span className="inline-flex size-4 shrink-0 items-center justify-center">
              {updating && (
                <LoaderCircle
                  role="status"
                  aria-label={t("food_updating")}
                  className="size-3.5 motion-safe:animate-spin"
                />
              )}
            </span>
          </>
        }
      />
      {query.isPlaceholderData && <p className="sr-only">{t("food_previous_selection")}</p>}
      <p role="status" className="sr-only">
        {!updating && query.data
          ? t(query.data.complete ? "food_selection_complete" : "food_selection_incomplete")
          : ""}
      </p>
      {query.isError && (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-xs text-destructive">
            {t("food_failed")}
          </p>
          <Button type="button" size="sm" variant="ghost" onClick={() => void query.refetch()}>
            <RefreshCw aria-hidden="true" />
            {t("food_retry")}
          </Button>
        </div>
      )}
    </section>
  );
}
