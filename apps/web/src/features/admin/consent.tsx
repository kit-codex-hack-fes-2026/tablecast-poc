import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
import { Button, buttonVariants } from "../../components/ui/button";
import { DialogFooter } from "../../components/ui/dialog";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { api, ApiFailure, json } from "../../lib/api";
import { storesSchema } from "../../lib/responses";

const redirectSchema = z.object({ redirect: z.literal(true), url: z.string().min(1) });

export function Consent() {
  const { t, setLocale } = useI18n();
  const search = new URLSearchParams(window.location.search);
  const oauthQuery = window.location.search.slice(1);
  const session = useQuery({
    queryKey: ["tablecast-oauth-session"],
    queryFn: () =>
      api(
        "/api/auth/get-session",
        {},
        z
          .object({ session: z.object({ activeOrganizationId: z.string().nullable().optional() }) })
          .nullable(),
      ),
  });
  const postLogin = !session.data?.session.activeOrganizationId;
  const [organization, setOrganization] = useState("");
  const stores = useQuery({
    queryKey: ["tablecast-stores"],
    queryFn: () => api("/api/admin/stores", {}, storesSchema),
  });
  const organizations = [
    ...new Set(
      stores.data?.stores
        .map((store) => store.organizationId)
        .filter((id): id is string => typeof id === "string") ?? [],
    ),
  ].map((id) => ({
    id,
    name:
      stores.data?.stores
        .filter((store) => store.organizationId === id)
        .map((store) => store.name)
        .join(" / ") ?? "",
  }));
  const selected =
    organization || session.data?.session.activeOrganizationId || organizations[0]?.id;
  const consent = useMutation({
    mutationFn: async (accept: boolean) => {
      if (postLogin && accept) {
        await api("/api/auth/organization/set-active", json("POST", { organizationId: selected }));
        return api(
          "/api/auth/oauth2/continue",
          json("POST", { postLogin: true, oauth_query: oauthQuery }),
          redirectSchema,
        );
      }
      return api(
        "/api/auth/oauth2/consent",
        json("POST", { accept, oauth_query: oauthQuery }),
        redirectSchema,
      );
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
    <main className="min-h-dvh">
      <header className="flex items-center justify-between py-6 px-9 max-sm:p-6">
        <Link
          className="brand inline-flex items-baseline font-bold text-2xl tracking-tighter leading-tight [&_span]:text-accent [&_span]:ml-px [&_span]:text-4xl max-lg:text-2xl"
          to="/"
        >
          TableCast
        </Link>
        <LanguageSwitch onChange={setLocale} />
      </header>
      <section className="mt-12 mx-auto mb-10 max-w-144 p-10 flex items-center flex-col text-center [&_>_[data-slot=button][data-size=text]]:mt-7 [&_>_[data-slot=button][data-size=text]]:text-muted-foreground max-sm:py-5 max-sm:px-6 max-sm:mt-9">
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
        {postLogin && (
          <label className="[&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm flex flex-col gap-4 pt-6 w-full">
            {t("oauth_organisation")}
            <NativeSelect
              value={selected}
              onChange={(event) => setOrganization(event.target.value)}
            >
              {organizations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <ErrorNotice error={stores.error || consent.error} />
        <DialogFooter className="mt-8 w-full">
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
        </DialogFooter>
      </section>
    </main>
  );
}
