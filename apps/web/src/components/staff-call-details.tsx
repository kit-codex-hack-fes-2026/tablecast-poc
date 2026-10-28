import type { StaffCall } from "@tablecast/api/schema";
import { dateTime } from "../i18n/format";
import { useI18n } from "../i18n/locale";
import { LanguageLabel } from "./language-label";
import { Badge } from "./ui/badge";

export function StaffCallDetails({ call }: { call: StaffCall }) {
  const { t, locale } = useI18n();
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <time dateTime={new Date(call.createdAt).toISOString()}>
          {dateTime(call.createdAt, locale)}
        </time>
        <Badge variant={call.status === "pending" ? "warning" : "success"}>
          {t(call.status === "pending" ? "assistance_pending" : "assistance_resolved")}
        </Badge>
      </div>
      <div>
        <strong>{t("assistance_memo")}</strong>
        <p lang="ja" className="mt-1 whitespace-pre-wrap wrap-anywhere">
          {call.handoff.summaryJa}
        </p>
      </div>
      <div>
        <strong className="mb-1 block">{t("assistance_original")}</strong>
        <LanguageLabel locale={call.handoff.locale} />
        <p lang={call.handoff.locale} className="whitespace-pre-wrap wrap-anywhere">
          {call.handoff.originalText || t("assistance_no_original")}
        </p>
        {call.handoff.attempted.length > 0 && (
          <div className="mt-3">
            <strong>{t("assistance_attempted")}</strong>
            <ul className="list-disc pl-5">
              {[...new Set(call.handoff.attempted)].map((item) => (
                <li key={item} lang="ja">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {call.handoff.unresolved && (
          <div className="mt-3">
            <strong>{t("assistance_unresolved")}</strong>
            <p lang="ja" className="whitespace-pre-wrap wrap-anywhere">
              {call.handoff.unresolved}
            </p>
          </div>
        )}
      </div>
      {call.resolvedAt !== null && (
        <p className="text-muted-foreground">
          {t("assistance_resolved_at")}: {dateTime(call.resolvedAt, locale)}
        </p>
      )}
    </div>
  );
}
