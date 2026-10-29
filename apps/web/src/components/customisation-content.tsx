import { cn } from "tailwind-variants";
import { useI18n } from "../i18n/locale";
import { MenuOptionImage } from "./menu-option-image";
import { Money, PriceChange } from "./money";

/** 選択・確定注文・設定一覧で共用する選択肢の表示。入力と業務判断は呼出し元が所有する。 */
export function CustomisationContent({
  name,
  description,
  imageKey = null,
  imageKind = "illustration",
  id,
  group,
  quantity,
  compact = true,
  showIllustration = true,
  className,
}: {
  className?: string;
  compact?: boolean;
  description?: string;
  group?: string;
  id?: string;
  imageKey?: null | string;
  imageKind?: "illustration" | "photograph";
  name: string;
  quantity?: number;
  showIllustration?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 max-w-full items-center gap-2", className)}>
      {group && <span className="font-medium">{group}: </span>}
      <MenuOptionImage
        imageKey={imageKey}
        imageKind={imageKind}
        compact={compact}
        showIllustration={showIllustration}
      />
      <span className="min-w-0">
        <span id={id ? `${id}-name` : undefined} className="block font-medium wrap-anywhere">
          {name}
          {quantity !== undefined && quantity > 1 && ` × ${quantity}`}
        </span>
        {description && (
          <span
            id={id ? `${id}-description` : undefined}
            className="mt-1 block text-sm leading-relaxed text-muted-foreground wrap-anywhere"
          >
            {description}
          </span>
        )}
      </span>
    </span>
  );
}

/** 同じ追加料金と売切表示を、選択操作の位置を変えずに共有する。 */
export function CustomisationPrice({
  value,
  available = true,
  showZero = false,
  id,
  className,
}: {
  available?: boolean;
  className?: string;
  id?: string;
  showZero?: boolean;
  value: number;
}) {
  const { t } = useI18n();
  return (
    <small
      id={id}
      className={cn("shrink-0 text-sm whitespace-nowrap text-muted-foreground", className)}
    >
      {!available ? (
        t("kiosk_sold_out")
      ) : value !== 0 ? (
        <PriceChange value={value} />
      ) : showZero ? (
        <Money value={0} />
      ) : null}
    </small>
  );
}
