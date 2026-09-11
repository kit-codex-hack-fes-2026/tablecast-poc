/// <reference types="@cloudflare/workers-types" />
import { hc } from "hono/client";
import type { tableOperations } from "./modules/tables/operations-routes";
import type { AppType } from "./app";
export const createTablecastClient = (baseUrl: string, options?: Parameters<typeof hc>[1]) =>
  hc<AppType>(baseUrl, options);
export { parseResponse } from "hono/client";

export const createTableSessionClient = (baseUrl: string, options?: Parameters<typeof hc>[1]) =>
  hc<typeof tableOperations>(baseUrl, options);
