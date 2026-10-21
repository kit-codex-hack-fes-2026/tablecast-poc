import type { TableState } from "@tablecast/api/schema";
import { Hourglass, Infinity as InfinityIcon } from "lucide-react";
import { tv } from "tailwind-variants";
import { time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { tableTimeLimit, timeLimitText } from "./floor-model";

const limitStyle = tv({
  base: "inline-flex items-center gap-1 whitespace-nowrap tabular-nums",
  variants: {
    urgent: { true: "text-warning", false: "text-muted-foreground" },
  },
});

export function TableTimeLimit({
  plan,
  now,
  detail = false,
  compact = false,
}: {
  plan: TableState["plan"] | undefined;
  now: number;
  detail?: boolean;
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const limit = tableTimeLimit(plan, now);
  if (limit.kind === "unknown")
    return detail ? (
      <p className="text-xs text-muted-foreground">{t("floor_limit_unknown")}</p>
    ) : null;
  if (limit.kind === "unlimited")
    return (
      <span
        className={limitStyle({ urgent: false })}
        title={compact ? t("floor_limit_unlimited") : undefined}
      >
        <InfinityIcon aria-hidden className="size-3.5 shrink-0" />
        {!compact && <span>{t("floor_limit_unlimited")}</span>}
      </span>
    );
  const remaining = timeLimitText(limit, locale);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {detail && plan && <span className="font-medium">{plan.rules.text[locale].displayName}</span>}
      <span
        className={limitStyle({ urgent: limit.remainingMinutes <= 15 })}
        title={compact ? remaining : undefined}
      >
        <Hourglass aria-hidden className="size-3.5 shrink-0" />
        {!compact && <span>{remaining}</span>}
      </span>
      {detail && (
        <span className="inline-flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {plan && (
            <span>
              {t("floor_limit_start")} {time(plan.startedAt, locale)}
            </span>
          )}
          <span>
            {t("floor_limit_end")} {time(limit.endsAt, locale)}
          </span>
          <span>
            {t("kiosk_last_order")} {time(limit.lastOrderAt, locale)}
          </span>
        </span>
      )}
    </span>
  );
}
