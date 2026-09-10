import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

import { AdminShell } from "../shell/admin-shell";

export function Admin() {
  const { t } = useI18n();
  return (
    <AdminShell tab="live" header={t("admin_store")}>
      <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-input p-6">
        <Building2 className="size-10" />
        <h1 className="text-2xl font-semibold">{t("auth_no_stores")}</h1>
        <p>{t("org_empty_hint")}</p>
        <Button nativeButton={false} role="link" render={<Link to="/organisations" />}>
          {t("org_manage")}
        </Button>
      </div>
    </AdminShell>
  );
}
