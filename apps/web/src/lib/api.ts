import {
  createTablecastClient,
  createTableSessionClient,
  parseResponse,
} from "@tablecast/api/client";
import { apiFetch } from "./api-fetch";
export { parseResponse };
const origin = typeof window === "undefined" ? "" : window.location.origin;
const options = { fetch: apiFetch };
export const rpc = createTablecastClient(origin || "/", options);
export type TableClient = ReturnType<typeof createTableSessionClient>;
export type TableEndpoint = { key: string; client: TableClient };
export const tableEndpoint: TableEndpoint = {
  key: "table",
  client: createTableSessionClient(`${origin}/api/table`, options),
};
export const demoTableEndpoint = (storeId: string, demoId: string): TableEndpoint => ({
  key: demoId,
  client: createTableSessionClient(
    `${origin}/api/admin/stores/${encodeURIComponent(storeId)}/demo/${encodeURIComponent(demoId)}/table`,
    options,
  ),
});
