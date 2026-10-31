import { apiFactory } from "../../platform/http";
import { gamesTableRoutes } from "../games/routes";
import { voiceRoutes } from "../voice/routes";
import { orderingOperations } from "./ordering-routes";

export const tableOperations = apiFactory
  .createApp()
  .route("/", orderingOperations)
  .route("/voice", voiceRoutes)
  .route("/games", gamesTableRoutes);
