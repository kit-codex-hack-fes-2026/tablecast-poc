import { useI18n } from "../i18n/locale";
import { Brand } from "./brand";
import { Skeleton } from "./ui/skeleton";

/** 卓情報の取得中もヘッダー・会話・メニューの領域を確保する。 */
export function KioskPending() {
  const { t } = useI18n();
  return (
    <div
      role="status"
      aria-busy="true"
      className="@container flex h-full min-h-0 flex-col overflow-hidden bg-background"
    >
      <span className="sr-only">{t("common_loading")}</span>
      <div
        aria-hidden="true"
        className="flex h-16 max-[56rem]:h-28 max-sm:h-36 shrink-0 items-center gap-4 border-b border-border bg-card px-4"
      >
        <Brand />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="ml-auto h-12 w-48" />
      </div>
      <div
        aria-hidden="true"
        className="grid min-h-0 flex-1 grid-rows-[35fr_65fr] @[56rem]:grid-cols-[28fr_72fr] @[56rem]:grid-rows-1"
      >
        <div className="flex min-h-0 flex-col gap-4 overflow-hidden border-r border-border p-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-16 w-4/5" />
          <Skeleton className="mt-auto h-14 w-full" />
        </div>
        <div className="@container/tablecast-menu flex min-h-0 flex-col overflow-hidden bg-card">
          <div className="flex gap-3 p-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-28" />
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 @xs/tablecast-menu:grid-cols-2 @2xl/tablecast-menu:grid-cols-3 content-start gap-4 overflow-hidden p-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="mx-auto aspect-square w-full max-w-64 rounded-xl" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-1/3" />
              </div>
            ))}
          </div>
          <div className="flex h-24 shrink-0 items-center gap-4 border-t border-border p-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 flex-1" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
