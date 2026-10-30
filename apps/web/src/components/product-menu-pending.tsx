import { Plus, Search } from "lucide-react";
import { useI18n } from "../i18n/locale";
import { Skeleton } from "./ui/skeleton";

/** 商品の取得中もカテゴリと商品カードの寸法・列数を実メニューに揃える。 */
export function ProductMenuPending() {
  const { t } = useI18n();
  return (
    <div role="status" aria-busy="true" className="@container/tablecast-menu min-w-0">
      <span className="sr-only">{t("common_loading")}</span>
      <div aria-hidden="true" className="flex items-start gap-2 overflow-hidden px-4 pt-4 pb-6">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground/40">
          <Search className="size-4" />
        </div>
        {["w-24", "w-32", "w-28"].map((width) => (
          <div
            key={width}
            className={`flex h-14 shrink-0 items-center rounded-xl border border-border px-5 ${width}`}
          >
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-6 px-4 pb-4 @lg/tablecast-menu:grid-cols-2 @3xl/tablecast-menu:grid-cols-3"
      >
        {[1, 2, 3, 4, 5, 6].map((index) => (
          <div key={index} className="min-w-0 rounded-3xl border border-border bg-card p-3">
            <div className="relative">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <span className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-full bg-card/90 text-muted-foreground/40">
                <Plus className="size-4" />
              </span>
            </div>
            <div className="px-1 pt-4 pb-1">
              <div className="min-h-12 space-y-2">
                <Skeleton className={index % 2 === 0 ? "h-4 w-4/5" : "h-4 w-11/12"} />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <div className="mt-3 flex h-6 items-center gap-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-9" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
