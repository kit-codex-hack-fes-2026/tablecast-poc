import { BellRing, Camera, Gamepad2, Mic, Settings2, Users } from "lucide-react";
import { useI18n } from "../i18n/locale";
import { Brand } from "./brand";
import { ProductMenuPending } from "./product-menu-pending";
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
        className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card px-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden py-1">
          <div className="flex shrink-0 items-center gap-3 @max-[70rem]:gap-1.5">
            <Brand className="w-28" />
            <span className="h-8 shrink-0 border-l border-border" />
            <div className="flex shrink-0 items-center gap-2 @max-[70rem]:gap-1">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-8" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-muted-foreground/40">
            {[
              { id: "members", Icon: Users },
              { id: "games", Icon: Gamepad2 },
            ].map(({ id, Icon }) => (
              <div
                key={id}
                className="flex size-11 items-center justify-center rounded-xl border border-border"
              >
                <Icon className="size-4" />
              </div>
            ))}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Skeleton className="h-12 w-28 rounded-xl" />
            <Skeleton className="h-12 w-20 rounded-xl" />
          </div>
        </div>
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground/40">
          <BellRing className="size-4" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="grid min-h-128 flex-1 grid-rows-[min(22.5rem,70%)_0.5rem_minmax(0,1fr)] @[56rem]:grid-cols-[15rem_0.5rem_minmax(0,1fr)] @[56rem]:grid-rows-1">
          <div
            aria-hidden="true"
            className="@container-size/history relative flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3"
          >
            <div className="w-32 shrink-0 space-y-1.5">
              <div className="flex aspect-4/3 items-center justify-center rounded-2xl bg-muted text-muted-foreground/40">
                <Camera className="size-6" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-hidden py-2 text-center">
              <Skeleton className="h-32 w-48 shrink-0 rounded-2xl [@container_history_(max-height:480px)]:hidden" />
              <Skeleton className="h-6 w-4/5 max-w-56 shrink-0" />
              <div className="w-full max-w-72 space-y-2 [@container_history_(max-height:480px)]:hidden">
                <Skeleton className="mx-auto h-3 w-full" />
                <Skeleton className="mx-auto h-3 w-4/5" />
              </div>
              <Skeleton className="h-11 w-40 shrink-0 rounded-xl" />
            </div>
            <div className="flex shrink-0 gap-2 border-t border-border pt-2">
              <div className="flex min-h-15 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-muted-foreground/40">
                <Mic className="size-4 shrink-0" />
                <Skeleton className="h-4 w-20 max-w-1/2" />
              </div>
              <div className="flex size-12 shrink-0 self-center items-center justify-center rounded-xl border border-border text-muted-foreground/40">
                <Settings2 className="size-4" />
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="flex items-center justify-center">
            <span className="h-2 w-8 rounded-full bg-border @[56rem]:h-8 @[56rem]:w-2" />
          </div>
          <div aria-hidden="true" className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-card">
            <div className="min-h-0 flex-1 overflow-hidden">
              <ProductMenuPending />
            </div>
            <div
              aria-hidden="true"
              className="grid shrink-0 grid-cols-3 gap-1 border-t border-border px-2 pt-1 pb-3"
            >
              {[1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="flex h-14 min-w-0 flex-col items-center justify-center gap-2 rounded-xl first:bg-muted/50"
                >
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="size-4" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
