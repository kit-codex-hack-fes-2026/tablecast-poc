import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, QrCode } from "lucide-react";
import { useI18n } from "../../i18n/locale";
import { customerMembershipsOptions } from "./customer-query";

export function CustomerMemberships() {
  const { t } = useI18n();
  const { data } = useSuspenseQuery(customerMembershipsOptions);
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">{t("customer_title")}</h1>
        <p className="text-muted-foreground">{t("customer_intro")}</p>
      </div>
      {data.memberships.length ? (
        <ul className="space-y-4">
          {data.memberships.map((membership) => (
            <li key={membership.id}>
              <Link
                to="/member/$storeId"
                params={{ storeId: membership.storeId }}
                className="flex min-h-28 items-center justify-between gap-4 rounded-2xl border bg-card p-6 text-card-foreground shadow-sm"
              >
                <div>
                  <p className="text-lg font-semibold">{membership.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t("customer_card")}</p>
                </div>
                <ArrowUpRight aria-hidden className="size-5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4 rounded-2xl border border-dashed p-8 text-center">
          <QrCode aria-hidden className="mx-auto size-10 text-muted-foreground" />
          <p>{t("customer_empty")}</p>
        </div>
      )}
    </section>
  );
}
