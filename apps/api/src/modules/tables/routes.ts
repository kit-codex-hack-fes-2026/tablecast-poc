import { apiFactory } from "../../platform/http";
import { requireDevice } from "../auth/middleware";
import { tableOperations } from "./operations-routes";
export const table = apiFactory.createApp().use("*", requireDevice).route("/", tableOperations);
