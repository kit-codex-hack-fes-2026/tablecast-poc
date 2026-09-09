import { ApiFailure } from "./api-error";
export { ApiFailure } from "./api-error";
import { createTablecastClient, parseResponse } from "@tablecast/api/client";
import { apiFetch } from "./api-fetch";
export { parseResponse };
export const rpc = createTablecastClient(
  typeof window === "undefined" ? "/" : window.location.origin,
  {
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
        throw new ApiFailure(response.status, code);
      }
      return response;
    },
  },
);
