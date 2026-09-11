import { ApiFailure } from "./api-error";
export { ApiFailure } from "./api-error";
import {
  createTablecastClient,
  createTableSessionClient,
  parseResponse,
} from "@tablecast/api/client";
import { apiFetch } from "./api-fetch";
export { parseResponse };
const origin = typeof window === "undefined" ? "" : window.location.origin;
const options = {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await apiFetch(input, init);
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const error =
        typeof body === "object" && body !== null && "error" in body ? body.error : null;
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "request_failed";
      const details =
        typeof error === "object" && error !== null && "details" in error
          ? error.details
          : undefined;
      throw new ApiFailure(response.status, code, details);
    }
    return response;
  },
};
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
