import { useI18n } from "../i18n/locale";
import { Skeleton } from "./ui/skeleton";

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
