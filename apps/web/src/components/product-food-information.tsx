import type { Product } from "@tablecast/api/schema";
import { useI18n } from "../i18n/locale";
import { FoodInformationView } from "./food-information";

// 単独の部品カタログでは合算せず、登録された各構成要素を表示する。
export function ProductFoodInformationSources({ product }: { product: Product }) {
  const { t, locale } = useI18n();
  const defaults = new Set(product.foodInfo.defaultComponentIds);
  return (
    <div className="grid gap-4">
      <h3 className="font-medium">{t("food_base")}</h3>
      <FoodInformationView value={product.foodInfo.base} />
      {product.foodInfo.components.map((component) => (
        <details key={component.id}>
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            {component.name[locale]}
            {defaults.has(component.id) ? ` · ${t("food_default_component")}` : ""}
          </summary>
          <FoodInformationView value={component.profile} />
        </details>
      ))}
    </div>
  );
}
