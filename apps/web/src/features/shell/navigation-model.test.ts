import { expect, it } from "vitest";
import { navigationTarget, searchNavigation } from "./navigation-model";
const label = (key: string) => (key === "editor_products" ? "商品" : key);

it("ページ名とrouteを正規化して検索し、選択中の店舗と組織へ向ける", () => {
  const context = { selectedStore: "tablecast/二号店", selectedOrganization: "tablecast-org" };
  expect(searchNavigation(" 商品 ", label, context)[0]?.url).toBe(
    "/admin/stores/tablecast%2F%E4%BA%8C%E5%8F%B7%E5%BA%97/menu/products",
  );
  expect(searchNavigation("ＰＲＯＤＵＣＴＳ", label, context)[0]?.id).toBe("products");
  expect(navigationTarget("billing", context)).toBe("/billing/tablecast-org");
  expect(searchNavigation(" ", label, context)).toEqual([]);
});
it("公開検索は店舗IDを仮定せず認証後の解決へ向け、既知の非管理者には管理専用ページを出さない", () => {
  expect(searchNavigation("商品", label, {})[0]?.url).toBe("/admin/go/products");
  expect(searchNavigation("statistics", label, { manager: false })).toEqual([]);
  expect(
    searchNavigation("statistics", label, { manager: true, selectedStore: "tablecast-store" })[0]
      ?.url,
  ).toBe("/admin/stores/tablecast-store/statistics");
});
