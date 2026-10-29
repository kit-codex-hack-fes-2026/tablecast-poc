import type { CartLine, Product } from "@tablecast/api/schema";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { FoodInformationView } from "../../components/food-information";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, type TableEndpoint } from "../../lib/api";

export function ProductAllergens({
  product,
  selections,
  endpoint,
  configVersion,
  tableSessionId,
}: {
  configVersion: number;
  endpoint: TableEndpoint;
  product: Product;
  selections: CartLine["selections"];
  tableSessionId: string;
}) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: [
      "tablecast-food-information",
      endpoint.key,
      tableSessionId,
      configVersion,
      product.id,
      selections,
    ],
    queryFn: ({ signal }) =>
      parseResponse(
        endpoint.client.catalog["food-information"].$post(
          { json: { productId: product.id, selections } },
          { init: { signal } },
        ),
      ),
    staleTime: Infinity,
    retry: false,
  });
  return (
    <section className="grid min-w-0 gap-1.5" aria-label={t("food_title")}>
      {(query.isPending || query.isFetching) && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("food_updating")}
        </p>
      )}
      {query.isError && (
        <>
          <p role="alert" className="text-xs text-destructive">
            {t("food_failed")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-fit"
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden="true" />
            {t("food_retry")}
          </Button>
        </>
      )}
      {query.data && !query.isFetching && !query.isError && (
        <>
          <p
            role="status"
            className={query.data.complete ? "sr-only" : "text-xs text-muted-foreground"}
          >
            {t(query.data.complete ? "food_selection_complete" : "food_selection_incomplete")}
          </p>
          <FoodInformationView value={query.data.foodInformation} />
        </>
      )}
    </section>
  );
}
