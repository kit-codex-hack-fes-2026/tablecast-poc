import type { StaffCall } from "@tablecast/api/schema";
import { useI18n } from "../i18n/locale";
import { LanguageLabel } from "./language-label";
import { RelativeTime } from "./relative-time";
import { Badge } from "./ui/badge";

export function StaffCallDetails({ call }: { call: StaffCall }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RelativeTime value={call.createdAt} />
        <Badge variant={call.status === "pending" ? "warning" : "success"}>
          {t(call.status === "pending" ? "assistance_pending" : "assistance_resolved")}
        </Badge>
      </div>
      <StaffCallMemo call={call} />
      {call.resolvedAt !== null && (
        <p className="text-muted-foreground">
          {t("assistance_resolved_at")}: <RelativeTime value={call.resolvedAt} />
        </p>
      )}
    </div>
  );
}

/** 客側の履歴と店員の対応画面で、保存された全文を省略せず共有する。 */
export function StaffCallMemo({ call }: { call: StaffCall }) {
  const { t } = useI18n();
  return (
    <div className="@container">
      <div className="grid gap-5 text-sm leading-relaxed @xl:grid-cols-2">
        <dl className="space-y-4">
          <div>
            <dt className="font-semibold">{t("assistance_memo")}</dt>
            <dd lang="ja" className="mt-1 whitespace-pre-wrap wrap-anywhere">
              {call.handoff.summaryJa}
            </dd>
          </div>
          {call.handoff.unresolved && (
            <div>
              <dt className="font-semibold">{t("assistance_unresolved")}</dt>
              <dd lang="ja" className="mt-1 whitespace-pre-wrap wrap-anywhere">
                {call.handoff.unresolved}
              </dd>
            </div>
          )}
        </dl>
        <dl className="space-y-4">
          <div>
            <dt className="mb-1 flex flex-wrap items-center gap-2 font-semibold">
              {t("assistance_original")}
              <LanguageLabel locale={call.handoff.locale} />
            </dt>
            <dd lang={call.handoff.locale} className="whitespace-pre-wrap wrap-anywhere">
              {call.handoff.originalText || t("assistance_no_original")}
            </dd>
          </div>
          {call.handoff.attempted.length > 0 && (
            <div>
              <dt className="font-semibold">{t("assistance_attempted")}</dt>
              <dd className="mt-1">
                <ul className="list-disc pl-5">
                  {[...new Set(call.handoff.attempted)].map((item) => (
                    <li key={item} lang="ja" className="whitespace-pre-wrap wrap-anywhere">
                      {item}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
