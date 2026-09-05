import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
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
      <main className="empty-page">
        <h1>{t("auth_subtitle")}</h1>
        <a className="primary-button" href={`/login?${oauthQuery}`}>
          {t("auth_sign_in")}
        </a>
      </main>
    );
  return (
    <main className="pair-page">
      <header className="simple-header">
        <Link className="brand" to="/">
          TableCast
        </Link>
        <LanguageSwitch onChange={setLocale} />
      </header>
      <section className="pair-card">
        <ShieldCheck size={36} aria-hidden="true" />
        <h1>{t(postLogin ? "oauth_organisation" : "oauth_title")}</h1>
        <p>{t("oauth_note")}</p>
        <dl className="diagnostics w-full text-left">
          <div>
            <dt>{t("oauth_client")}</dt>
            <dd>{search.get("client_id")}</dd>
          </div>
          <div>
            <dt>{t("oauth_permissions")}</dt>
            <dd>{search.get("scope")?.split(" ").join(" · ")}</dd>
          </div>
        </dl>
        {postLogin && (
          <label className="stacked-form w-full">
            {t("oauth_organisation")}
            <select value={selected} onChange={(event) => setOrganization(event.target.value)}>
              {organizations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <ErrorNotice error={stores.error || consent.error} />
        <div className="dialog-actions mt-8 w-full">
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
