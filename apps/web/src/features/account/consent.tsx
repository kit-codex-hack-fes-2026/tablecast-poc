import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { ArrowRight, Check, ShieldCheck, Store, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Store as StoreData } from "../store/store-query";
import { Brand } from "../../components/brand";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
import { RoleBadge } from "../../components/role-badge";
import { StoreIcon } from "../../components/store-icon";
import { Button } from "../../components/ui/button";
import { buttonVariants } from "../../components/ui/button-variants";
import { useI18n } from "../../i18n/locale";
import { apiError } from "../../lib/api-error";
import { authClient, authResult } from "../../lib/auth-client";
import { sessionOptions } from "../../lib/session-query";
import { withoutCollectionSearch } from "../shell/collection-model";
import { useCollectionSearch } from "../shell/collection-search";
import { storesOptions } from "../store/store-query";

export function Consent() {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const { t, setLocale } = useI18n();
  const search = new URLSearchParams(searchStr);
  const oauthQuery = withoutCollectionSearch(searchStr, "consentStores");
  const collection = useCollectionSearch({
    prefix: "consentStores",
    sortIds: ["name", "role"],
  });
  const session = useQuery(sessionOptions);
  const postLogin = !session.data?.session.activeOrganizationId;
  const [organization, setOrganization] = useState("");
  const stores = useQuery(storesOptions);
  const organizations = stores.data?.stores ?? [];
  const selected =
    organization || session.data?.session.activeOrganizationId || organizations[0]?.organizationId;
  const selectedStore = organizations.find((store) => store.organizationId === selected);
  const columns = useMemo(
    () => consentStoreColumns(t, selected, setOrganization, postLogin),
    [t, selected, postLogin],
  );
  // SDKの成功処理がdocumentを転送するため、破棄される画面のQuery cacheは再取得しない。
  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation
  const consent = useMutation({
    mutationFn: async (accept: boolean) => {
      if (postLogin && accept) {
        // Cookie更新後のOAuth再開と転送は、採用SDKのprovider/redirect pluginが行う。
        return authResult(await authClient.organization.setActive({ organizationId: selected }));
      }
      return authResult(await authClient.oauth2.consent({ accept, oauth_query: oauthQuery }));
    },
  });
  if (apiError(stores.error)?.status === 401)
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
      <header className="flex flex-wrap items-center justify-between gap-4 py-6 px-9 max-sm:p-6">
        <Link data-ui="brand" className="inline-flex shrink-0 items-center" to="/">
          <Brand />
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
            {...collection}
            searchLabel={t("stores_search")}
            searchPlaceholder={t("stores_search")}
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
        {selectedStore && (
          <div
            role="group"
            aria-label={t("common_selected")}
            className="mt-6 flex w-full items-center gap-3 rounded-xl bg-surface-subtle p-4 text-left"
          >
            <StoreIcon name={selectedStore.name} logo={selectedStore.logo} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("common_selected")}</p>
              <p className="font-semibold wrap-anywhere">{selectedStore.name}</p>
            </div>
          </div>
        )}
        <div className="mt-4 flex w-full justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => consent.mutate(false)}
            disabled={consent.isPending}
          >
            <X />
            {t("oauth_deny")}
          </Button>
          <Button
            size="lg"
            onClick={() => consent.mutate(true)}
            disabled={consent.isPending || stores.isPending || session.isPending || !selected}
          >
            <ArrowRight />
            {t(postLogin ? "oauth_continue" : "oauth_allow")}
          </Button>
        </div>
      </section>
    </main>
  );
}

type ConsentStore = StoreData;
function consentStoreColumns(
  t: ReturnType<typeof useI18n>["t"],
  selected: string | undefined,
  select: (id: string) => void,
  selectable: boolean,
): DataTableColumn<ConsentStore>[] {
  return [
    { accessorKey: "name", header: t("admin_store"), meta: { icon: Store } },
    {
      accessorKey: "role",
      meta: { icon: ShieldCheck },
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
          {selected === row.original.organizationId ? <Check /> : <ArrowRight />}
          {t(selected === row.original.organizationId ? "common_selected" : "common_select")}
        </Button>
      ),
    },
  ];
}
