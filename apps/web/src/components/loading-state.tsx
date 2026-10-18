import { useI18n } from "../i18n/locale";
import { Skeleton } from "./ui/skeleton";

/**
 * 初回読込の領域を確保し、翻訳済みのstatusを伝える。
 * cards=trueでカード型、falseで一覧型。
 * 再取得では既存結果を消さず、既存画面のaria-busyや進行表示を使う。
 * Skeletonはこの部品の形状を作る低水準部品。
 */
export function LoadingState({ cards = false }: { cards?: boolean }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-busy="true" className="min-h-80 w-full space-y-4">
      <span className="sr-only">{t("common_loading")}</span>
      <Skeleton className="h-11 w-64 max-w-full" />
      <div
        className={
          cards
            ? "grid grid-cols-2 gap-4 lg:grid-cols-3"
            : "space-y-3 rounded-xl border border-border p-4"
        }
      >
        {["one", "two", "three", "four", "five", "six"].map((id) => (
          <Skeleton key={id} className={cards ? "aspect-3/2" : "h-10 w-full"} />
        ))}
      </div>
    </div>
  );
}
