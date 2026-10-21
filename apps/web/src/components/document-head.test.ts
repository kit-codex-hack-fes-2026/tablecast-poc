import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  HeadContent,
  RouterContextProvider,
} from "@tanstack/react-router";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { LocaleProvider } from "../i18n/locale";
import { DocumentHead } from "./document-head";

it("SSRでアセットheadと同居してもtitleとdescriptionは各1件で日英の対象名を出す", async () => {
  const root = createRootRoute({
    head: () => ({
      meta: [{ name: "viewport", content: "width=device-width" }],
      links: [{ rel: "icon", href: "/favicon.svg" }],
    }),
  });
  const product = createRoute({
    getParentRoute: () => root,
    path: "/product/$itemId",
    staticData: { document: { title: "editor_products", description: "head_catalog_description" } },
    loader: () => ({
      document: { name: { ja: "柚子ソーダ", en: "Yuzu soda" }, store: "こもれび" },
    }),
  });
  const router = createRouter({
    routeTree: root.addChildren([product]),
    history: createMemoryHistory({ initialEntries: ["/product/internal-secret-id"] }),
    isServer: true,
  });
  await router.load();
  for (const locale of ["ja", "en"] as const) {
    const html = renderToString(
      h(RouterContextProvider, {
        router,
        children: h(
          "html",
          null,
          h("head", null, h(HeadContent)),
          h(
            "body",
            null,
            h(LocaleProvider, { initialLocale: locale, persist: false, children: h(DocumentHead) }),
          ),
        ),
      }),
    );
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    expect(head.match(/<title>/g)).toHaveLength(1);
    expect(head.match(/name="description"/g)).toHaveLength(1);
    expect(head).toContain(
      locale === "ja"
        ? "<title>柚子ソーダ · 商品 · こもれび · TableCast</title>"
        : "<title>Yuzu soda · Products · こもれび · TableCast</title>",
    );
    expect(head).toContain('name="viewport"');
    expect(head).toContain('href="/favicon.svg"');
    expect(html).not.toContain("internal-secret-id");
  }
});
