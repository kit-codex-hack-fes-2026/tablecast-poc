import type { PosIssue } from "@tablecast/api/schema";
import { AlertCircle } from "lucide-react";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";

const issueMessages = {
  POS_DEVICE_REQUIRED: "pos_issue_device",
  POS_ENVIRONMENT_MISMATCH: "pos_issue_auth",
  POS_DISCONNECT_PENDING: "pos_disconnect_pending_hint",
  POS_NOT_CONFIGURED: "pos_issue_not_configured",
  POS_CONNECTION_REQUIRED: "pos_issue_connection",
  POS_LOCATION_REQUIRED: "pos_issue_location",
  POS_MAPPING_REQUIRED: "pos_issue_mapping",
  POS_PRODUCT_UNAVAILABLE: "pos_issue_unavailable",
  POS_PRICE_MISMATCH: "pos_issue_price",
  POS_TOTAL_MISMATCH: "pos_issue_total",
  POS_UNSUPPORTED: "pos_issue_unsupported",
  POS_AUTH_REQUIRED: "pos_issue_auth",
  POS_PROVIDER_UNAVAILABLE: "pos_issue_provider",
  POS_UNKNOWN_OUTCOME: "pos_review_hint",
  POS_CHECKOUT_LOCKED: "pos_locked",
  POS_CHECKOUT_CONFLICT: "pos_issue_conflict",
  POS_CART_NOT_EMPTY: "pos_issue_cart",
  POS_ORDERS_PENDING: "pos_issue_orders",
  POS_ALREADY_PAID: "pos_issue_paid",
  POS_SESSION_CLOSED: "pos_issue_closed",
  POS_ZERO_OR_EMPTY: "pos_issue_empty",
  POS_VERSION_CONFLICT: "pos_issue_version",
} as const;

export function PosIssues({ issues }: { issues: PosIssue[] }) {
  const { t, locale } = useI18n();
  if (!issues.length) return null;
  return (
    <div role="region" aria-label={t("pos_issues")} className="flex items-start gap-2 text-warning">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <ul className="space-y-3 text-sm">
        {issues.map((issue) => {
          const key = Object.entries(issueMessages).find(([code]) => code === issue.code)?.[1];
          return (
            <li
              key={`${issue.code}:${issue.localId ?? issue.name ?? ""}:${issue.expected ?? ""}:${issue.actual ?? ""}`}
              className="space-y-1"
            >
              {issue.name && <strong className="block font-medium">{issue.name}</strong>}
              <p>{t(key ?? "pos_issue_unknown")}</p>
              {(issue.expected !== undefined || issue.actual !== undefined) && (
                <p className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums text-muted-foreground">
                  {issue.expected !== undefined && (
                    <span>
                      {t("pos_expected")}: {money(issue.expected, locale)}
                    </span>
                  )}
                  {issue.actual !== undefined && (
                    <span>
                      {t("pos_actual")}: {money(issue.actual, locale)}
                    </span>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
