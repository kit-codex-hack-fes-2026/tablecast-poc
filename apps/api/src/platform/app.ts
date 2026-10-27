import { requestServices } from "./context";
import {
  apiFactory,
  handleError,
  requestBodyLimit,
  requestSecurity,
  requestTelemetry,
} from "./http";

// 通常の注文入口と全APIで、認証前の制限・計測・エラー契約を共有する。
export function createHttpApp() {
  return apiFactory
    .createApp()
    .use("*", requestTelemetry)
    .use("*", requestServices)
    .use("*", requestSecurity)
    .use("*", requestBodyLimit)
    .onError(handleError);
}
