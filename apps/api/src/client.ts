/// <reference types="@cloudflare/workers-types" />

import type { ClientErrorStatusCode, ServerErrorStatusCode } from "hono/utils/http-status";
import { type ApplyGlobalResponse, hc } from "hono/client";
import type { AppType } from "./app";
import type { tableOperations } from "./modules/tables/operations-routes";
import type { ApiError } from "./schema";
type RpcErrors = { [Status in ClientErrorStatusCode | ServerErrorStatusCode]: { json: ApiError } };
export const createTablecastClient = (baseUrl: string, options?: Parameters<typeof hc>[1]) =>
  hc<ApplyGlobalResponse<AppType, RpcErrors>>(baseUrl, options);
export { DetailedError, parseResponse } from "hono/client";

export const createTableSessionClient = (baseUrl: string, options?: Parameters<typeof hc>[1]) =>
  hc<ApplyGlobalResponse<typeof tableOperations, RpcErrors>>(baseUrl, options);

export type { InferRequestType, InferResponseType } from "hono/client";
