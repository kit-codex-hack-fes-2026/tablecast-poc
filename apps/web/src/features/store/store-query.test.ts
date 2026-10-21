import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api-fetch";
import { findStore, isStoreManager, type Store, storesOptions } from "./store-query";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
const stores: Store[] = ["owner", "admin", "member"].map((role) => ({
  id: `tablecast-${role}`,
  name: "店舗",
  role,
  organizationId: "tablecast-organisation",
  logo: null,
}));
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
afterEach(() => {
  client.clear();
  vi.clearAllMocks();
});

it("親loaderのlookupは既存の一覧cacheを再利用し、管理者権限と欠落を区別する", async () => {
  client.setQueryData(storesOptions.queryKey, { stores, locale: null });
  expect(isStoreManager(await findStore(client, "tablecast-owner"))).toBe(true);
  expect(isStoreManager(await findStore(client, "tablecast-admin"))).toBe(true);
  expect(isStoreManager(await findStore(client, "tablecast-member"))).toBe(false);
  expect(await findStore(client, "tablecast-missing")).toBeUndefined();
  expect(isStoreManager(undefined)).toBe(false);
  expect(apiFetch).not.toHaveBeenCalled();
});

it("一覧未取得時は同じqueryで取得し、認可エラーを店舗欠落へ置き換えない", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ stores }));
  expect(await findStore(client, "tablecast-member")).toMatchObject({
    id: "tablecast-member",
    role: "member",
  });
  expect(apiFetch).toHaveBeenCalledOnce();
  client.clear();
  vi.mocked(apiFetch).mockResolvedValueOnce(
    Response.json({ error: { code: "FORBIDDEN", message: "権限がありません" } }, { status: 403 }),
  );
  await expect(findStore(client, "tablecast-owner")).rejects.toMatchObject({ statusCode: 403 });
});
