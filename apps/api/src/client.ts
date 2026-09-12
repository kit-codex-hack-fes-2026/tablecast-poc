/// <reference types="@cloudflare/workers-types" />
import { hc, type ApplyGlobalResponse } from "hono/client";
import type { ApiError } from "./schema";
import type { ClientErrorStatusCode, ServerErrorStatusCode } from "hono/utils/http-status";
type RpcErrors = { [Status in ClientErrorStatusCode | ServerErrorStatusCode]: { json: ApiError } };
import type { tableOperations } from "./modules/tables/operations-routes";
import type { AppType } from "./app";
export const createTablecastClient = (baseUrl: string, options?: Parameters<typeof hc>[1]) =>
  hc<ApplyGlobalResponse<AppType, RpcErrors>>(baseUrl, options);
export { parseResponse, DetailedError } from "hono/client";

export const createTableSessionClient = (baseUrl: string, options?: Parameters<typeof hc>[1]) =>
  hc<ApplyGlobalResponse<typeof tableOperations, RpcErrors>>(baseUrl, options);
