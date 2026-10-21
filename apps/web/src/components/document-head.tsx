import { useMatches } from "@tanstack/react-router";
import { useI18n, type SimpleMessageKey } from "../i18n/locale";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    document?: { title: SimpleMessageKey; description: SimpleMessageKey };
  }
}

export type DocumentDetails = {
  title?: SimpleMessageKey;
  name?: string | { ja: string; en: string };
  store?: string;
};

/** titleとdescriptionはこの一箇所だけが所有し、言語変更でloaderを再実行しない。 */
export function DocumentHead() {
  const { locale, t } = useI18n();
  const matches = useMatches();
  const metadata = matches.map((match) => match.staticData.document).findLast(Boolean);
  const details = matches.flatMap<DocumentDetails>(({ loaderData, status }) =>
    status === "success" && loaderData && typeof loaderData === "object" && "document" in loaderData
      ? [loaderData.document]
      : [],
  );
  const latest = details.at(-1);
  // 現行Routerの全体404はstatusがsuccessのまま、RouteMatchの_notFoundで通知される。
  // oxlint-disable-next-line no-underscore-dangle -- TanStackの型が公開する404状態をそのまま読む。
  const missing = matches.some((match) => match.status === "notFound" || match._notFound);
  const failed = matches.some((match) => match.status === "error");
  const titleKey = missing
    ? "head_not_found"
    : failed
      ? "head_error"
      : (latest?.title ?? metadata?.title);
  const descriptionKey = missing
    ? "head_not_found_description"
    : failed
      ? "head_error_description"
      : (metadata?.description ?? "head_guest_description");
  const store =
    !missing && !failed ? details.map((detail) => detail.store).findLast(Boolean) : undefined;
  const name = !missing && !failed ? latest?.name : undefined;
  const objectName = typeof name === "string" ? name : name?.[locale];
  const title = [objectName, titleKey ? t(titleKey) : undefined, store, "TableCast"]
    .filter(Boolean)
    .join(" · ");
  const description = [store, t(descriptionKey)].filter(Boolean).join(" · ");
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
    </>
  );
}
