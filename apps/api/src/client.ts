/// <reference types="@cloudflare/workers-types" />
import { hc } from "hono/client";
import type { AppType } from "./app";
export const createTablecastClient = (baseUrl: string, options?: Parameters<typeof hc>[1]) =>
  hc<AppType>(baseUrl, options);
export { parseResponse } from "hono/client";
