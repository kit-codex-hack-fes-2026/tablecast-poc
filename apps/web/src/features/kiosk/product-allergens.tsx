import type { CartLine, Product } from "@tablecast/api/schema";
import { useQuery } from "@tanstack/react-query";
import { ErrorNotice } from "../../components/error-notice";
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
    <section
      className="mt-6 grid gap-4 rounded-2xl bg-surface-subtle p-4"
      aria-label={t("food_title")}
    >
      <h3 className="text-sm font-semibold">{t("food_title")}</h3>
      {(query.isPending || query.isFetching) && <p role="status">{t("food_updating")}</p>}
      {query.isError && (
        <>
          <ErrorNotice error={query.error} />
          <Button type="button" variant="outline" onClick={() => void query.refetch()}>
            {t("food_retry")}
          </Button>
        </>
      )}
      {query.data && !query.isFetching && !query.isError && (
        <>
          <p role="status">
            {t(query.data.complete ? "food_selection_complete" : "food_selection_incomplete")}
          </p>
          <FoodInformationView value={query.data.foodInformation} />
        </>
      )}
    </section>
  );
}
