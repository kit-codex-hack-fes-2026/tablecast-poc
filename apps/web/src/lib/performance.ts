import type { PerformanceMetric } from "@tablecast/api/schema";
import { onCLS, onFCP, onINP, onLCP, onTTFB, type MetricType } from "web-vitals";

let started = false;
let visit: PerformanceMetric["visit"] = "unknown";
const pending = new Map<string, PerformanceMetric>();
let timer: ReturnType<typeof setTimeout> | undefined;

export function performancePage(path: string): PerformanceMetric["page"] {
  if (path === "/") return "kiosk";
  if (path === "/login") return "login";
  if (path === "/account") return "account";
  if (path === "/admin/live") return "admin-live";
  if (/^\/admin\/stores\/[^/]+\/floor\/?$/.test(path)) return "floor";
  if (/^\/admin\/stores\/[^/]+\/menu\/products\/?$/.test(path)) return "products";
  return path.startsWith("/admin/") ? "admin-other" : "other";
}

function navigationEntry() {
  const entry = performance.getEntriesByType("navigation")[0];
  return entry instanceof PerformanceNavigationTiming ? entry : undefined;
}

function flush() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (!pending.size) return;
  const body = JSON.stringify({ metrics: [...pending.values()] });
  pending.clear();
  try {
    if (
      document.visibilityState === "hidden" &&
      navigator.sendBeacon("/api/performance", new Blob([body], { type: "application/json" }))
    )
      return;
    void fetch("/api/performance", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // 観測の失敗を画面表示や注文操作へ伝播させない。
  }
}

export function reportPerformance(
  metric: Pick<PerformanceMetric, "name" | "value"> &
    Partial<Pick<PerformanceMetric, "id" | "page" | "navigation" | "apiRequestId" | "outcome">>,
) {
  if (typeof window === "undefined" || !Number.isFinite(metric.value) || metric.value < 0) return;
  const entry = navigationEntry();
  const timing = entry?.serverTiming ?? [];
  const traceId = timing.find((item) => item.name === "tablecast-trace")?.description;
  const release =
    timing.find((item) => item.name === "tablecast-release")?.description ?? "unknown";
  const navigation = entry?.type === "back_forward" ? "back-forward" : (entry?.type ?? "unknown");
  const device = matchMedia("(pointer: coarse)").matches
    ? Math.min(screen.width, screen.height) >= 600
      ? "tablet"
      : "phone"
    : "desktop";
  const sample: PerformanceMetric = {
    id: crypto.randomUUID(),
    page: performancePage(location.pathname),
    navigation,
    device,
    visit,
    release,
    outcome: "success",
    ...(traceId ? { documentTraceId: traceId } : {}),
    ...metric,
  };
  pending.set(sample.id, sample);
  if (pending.size >= 20 || document.visibilityState === "hidden") flush();
  else timer ??= setTimeout(flush, 5000);
}

export function afterPerformancePaint(callback: () => void) {
  let second = 0;
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(callback);
  });
  return () => {
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
  };
}

export function startPerformance(readyAt: number) {
  if (started) return;
  started = true;
  try {
    visit = localStorage.getItem("tablecast_performance_visited") ? "return" : "first";
    localStorage.setItem("tablecast_performance_visited", "1");
  } catch {
    visit = "unknown";
  }
  const page = performancePage(new URL(navigationEntry()?.name ?? location.href).pathname);
  const report = (metric: MetricType) => {
    reportPerformance({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      navigation: metric.navigationType,
      page:
        metric.navigationType === "back-forward-cache" ? performancePage(location.pathname) : page,
    });
  };
  onCLS(report);
  onFCP(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
  reportPerformance({ name: "page-ready", value: readyAt, page });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
