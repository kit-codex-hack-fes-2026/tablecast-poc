import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { loadInitial } from "../../lib/session-query";
import { apiFetch } from "../../lib/api-fetch";
import { floorOptions } from "../floor/floor-query";
import { homeOptions } from "./home-query";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
const storeId = "tablecast-home-query";
const floor: NonNullable<Awaited<ReturnType<typeof loadInitial>>["floor"]> = {
  store: { id: storeId, name: "ホーム確認店", role: "owner" },
  tables: [],
  vacantTables: [],
  events: [],
  cursor: 10,
};
const home = { storeId, hasProducts: true, hasDevices: false };
const clients: QueryClient[] = [];
afterEach(() => {
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.clearAllMocks();
});

it.each([undefined, 20])(
  "ホームの一括取得からフロアを再利用し、通知後のcursorを巻き戻さない: %s",
  async (cursor) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    clients.push(client);
    if (cursor !== undefined)
      client.setQueryData(floorOptions(storeId).queryKey, { ...floor, cursor });
    vi.mocked(apiFetch).mockResolvedValue(
      Response.json({ home, floor, session: null, stores: [], catalog: null }),
    );
    expect(await client.fetchQuery(homeOptions(storeId))).toEqual(home);
    expect(await client.ensureQueryData(floorOptions(storeId))).toMatchObject({
      cursor: cursor ?? 10,
    });
    expect(apiFetch).toHaveBeenCalledOnce();
  },
);
