import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { requireDevice } from "../auth/middleware";
import { tableOperations } from "./operations-routes";
export const table = new Hono<ApiEnv>().use("*", requireDevice).route("/", tableOperations);
