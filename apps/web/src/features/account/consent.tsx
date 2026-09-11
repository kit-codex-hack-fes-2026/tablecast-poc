import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "../../components/data-table";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
import { Button } from "../../components/ui/button";
import { buttonVariants } from "../../components/ui/button-variants";
import { useI18n } from "../../i18n/locale";
import { sessionOptions } from "../../lib/session-query";
import { RoleBadge } from "../../components/role-badge";
import type { loadStores } from "../store/store-query";
import { storesOptions } from "../store/store-query";

import { ApiFailure } from "../../lib/api";
import { authClient, authResult } from "../../lib/auth-client";

export function Consent() {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const { t, setLocale } = useI18n();
  const search = new URLSearchParams(searchStr);
  const oauthQuery = searchStr.slice(1);
  const session = useQuery(sessionOptions);
  const postLogin = !session.data?.session.activeOrganizationId;
  const [organization, setOrganization] = useState("");
  const stores = useQuery(storesOptions);
  const organizations = stores.data?.stores ?? [];
  const selected =
    organization || session.data?.session.activeOrganizationId || organizations[0]?.organizationId;
  const columns = useMemo(
    () => consentStoreColumns(t, selected, setOrganization, postLogin),
    [t, selected, postLogin],
  );
  const consent = useMutation({
    mutationFn: async (accept: boolean) => {
      if (postLogin && accept) {
        authResult(await authClient.organization.setActive({ organizationId: selected }));
        return authResult(
          await authClient.oauth2.continue({ postLogin: true, oauth_query: oauthQuery }),
        );
      }
      return authResult(await authClient.oauth2.consent({ accept, oauth_query: oauthQuery }));
    },
    onSuccess: (result) => window.location.assign(result.url),
  });
  if (stores.error instanceof ApiFailure && stores.error.status === 401)
    return (
      <main className="min-h-dvh flex justify-center items-center flex-col gap-7 p-8 text-center">
        <h1>{t("auth_subtitle")}</h1>
        <a
          data-slot="button"
          data-variant="default"
          className={buttonVariants({ size: "lg" })}
          href={`/login?${oauthQuery}`}
        >
          {t("auth_sign_in")}
        </a>
      </main>
    );
  return (
    <main className="min-h-dvh" data-pwa-blocked={Boolean(organization)}>
      <header className="flex items-center justify-between py-6 px-9 max-sm:p-6">
        <Link
          data-ui="brand"
          className="inline-flex items-baseline font-bold text-2xl tracking-tighter leading-tight [&_span]:text-accent [&_span]:ml-px [&_span]:text-4xl max-lg:text-2xl"
          to="/"
        >
          TableCast
        </Link>
        <LanguageSwitch onChange={setLocale} />
      </header>
      <section className="mt-12 mx-auto mb-10 max-w-3xl p-10 flex items-center flex-col text-center [&_>_[data-slot=button][data-size=text]]:mt-7 [&_>_[data-slot=button][data-size=text]]:text-muted-foreground max-sm:py-5 max-sm:px-6 max-sm:mt-9">
        <ShieldCheck size={36} aria-hidden="true" />
        <h1 className="text-3xl mt-3 max-sm:text-2xl">
          {t(postLogin ? "oauth_organisation" : "oauth_title")}
        </h1>
        <p className="text-muted-foreground text-base leading-loose mt-5 mx-0 mb-7">
          {t("oauth_note")}
        </p>
        <dl className="w-full text-left">
          <div className="border-b border-b-border py-3.5 px-0">
            <dt className="text-sm text-muted-foreground">{t("oauth_client")}</dt>
            <dd className="font-mono text-sm wrap-anywhere mt-1">{search.get("client_id")}</dd>
          </div>
          <div className="border-b border-b-border py-3.5 px-0">
            <dt className="text-sm text-muted-foreground">{t("oauth_permissions")}</dt>
            <dd className="font-mono text-sm wrap-anywhere mt-1">
              {search.get("scope")?.split(" ").join(" · ")}
            </dd>
          </div>
        </dl>
        <div className="mt-6 w-full text-left">
          <DataTable
            data={
              postLogin
                ? organizations
                : organizations.filter((store) => store.organizationId === selected)
            }
            columns={columns}
            getRowId={(store) => store.id}
            pagination={false}
          />
        </div>
        <ErrorNotice error={stores.error || consent.error} onRetry={() => void stores.refetch()} />
        <div className="mt-8 flex w-full justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => consent.mutate(false)}
            disabled={consent.isPending}
          >
            {t("oauth_deny")}
          </Button>
          <Button
            size="lg"
            onClick={() => consent.mutate(true)}
            disabled={consent.isPending || stores.isPending || session.isPending || !selected}
          >
            {t(postLogin ? "oauth_continue" : "oauth_allow")}
          </Button>
        </div>
      </section>
    </main>
  );
}

type ConsentStore = Awaited<ReturnType<typeof loadStores>>["stores"][number];
function consentStoreColumns(
  t: ReturnType<typeof useI18n>["t"],
  selected: string | undefined,
  select: (id: string) => void,
  selectable: boolean,
): ColumnDef<ConsentStore>[] {
  return [
    { accessorKey: "name", header: t("admin_store") },
    {
      accessorKey: "role",
      header: t("org_role"),
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
    },
    {
      id: "selection",
      header: t("common_status"),
      cell: ({ row }) => (
        <Button
          className="min-w-24"
          variant={selected === row.original.organizationId ? "default" : "outline"}
          disabled={!selectable}
          onClick={() => select(row.original.organizationId)}
          aria-pressed={selected === row.original.organizationId}
        >
          {t(selected === row.original.organizationId ? "common_selected" : "common_select")}
        </Button>
      ),
    },
  ];
}
