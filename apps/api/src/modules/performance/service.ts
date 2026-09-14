import { telemetryLog, type TelemetryEnv } from "../../platform/telemetry";
import type { PerformanceMetric } from "./model";

export function recordPerformance(metrics: PerformanceMetric[], env: TelemetryEnv) {
  for (const metric of metrics) {
    telemetryLog(
      "tablecast.browser_metric",
      {
        "tablecast.rum.id": metric.id,
        "tablecast.rum.metric": metric.name,
        "tablecast.rum.value": metric.value,
        "tablecast.rum.page": metric.page,
        "tablecast.rum.device": metric.device,
        "tablecast.rum.visit": metric.visit,
        "tablecast.rum.navigation": metric.navigation,
        "tablecast.rum.release": metric.release,
        ...(metric.documentTraceId
          ? { "tablecast.rum.document_trace_id": metric.documentTraceId }
          : {}),
        ...(metric.apiRequestId ? { "tablecast.rum.api_request_id": metric.apiRequestId } : {}),
        "tablecast.outcome": metric.outcome,
      },
      false,
      env,
    );
  }
}
