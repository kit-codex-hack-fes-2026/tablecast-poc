import { expect, it } from "vitest";
import { initialStorePath } from "./initial-store-path";

it.each<[string, ReturnType<typeof initialStorePath>]>([
  ["/admin/stores/tablecast-store", { storeId: "tablecast-store", home: true }],
  ["/admin/stores/tablecast-store/", { storeId: "tablecast-store", home: true }],
  ["/admin/stores/tablecast-store/floor", { storeId: "tablecast-store", home: false }],
  ["/admin/stores/tablecast-store/floor/", { storeId: "tablecast-store", home: false }],
  ["/admin/stores/tablecast%20store", { storeId: "tablecast store", home: true }],
  ["/admin/stores/tablecast-store/menu/products", undefined],
  ["/admin/stores/tablecast-store/profile", undefined],
  ["/admin/stores/tablecast-store/floor/other", undefined],
  ["/admin/stores/", undefined],
  ["/admin/live", undefined],
])("初期取得する店舗とホーム表示をURLから選ぶ: %s", (pathname, expected) => {
  expect(initialStorePath(pathname)).toEqual(expected);
});
