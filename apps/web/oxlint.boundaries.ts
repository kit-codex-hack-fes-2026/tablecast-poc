// 業務機能の内部は所有者で閉じ、共有する読取・編集部品だけを列挙する。
const owners = [
  "account",
  "billing",
  "catalog",
  "configuration",
  "customer",
  "demo",
  "devices",
  "floor",
  "games",
  "help",
  "kiosk",
  "pos",
  "rewards",
  "shell",
  "statistics",
  "store",
];
export const boundaryFiles = [
  ["test", "src/**/*.{test,stories}.{ts,tsx}"],
  ["test", "src/test-support/**"],
  ["test", "src/features/*/test-support/**"],
  ["test", "src/features/billing/billing-fixture.ts"],
  ["route", "src/routes/*.tsx"],
  ["router", "src/router.tsx"],
  ["server", "src/{server,ssr,lib/api-fetch.server}.ts"],
  ["lib", "src/sw.ts"],
  ["transport", "src/lib/{api,api-fetch,auth-client}.ts"],
  ["lib", "src/lib/*.{ts,tsx}"],
  ["ui", "src/components/ui/*.{ts,tsx}"],
  ["component", "src/components/*.{ts,tsx}"],
  ["component", "src/components/ai-elements/*.tsx"],
  ["component", "src/components/form/*.{ts,tsx}"],
  ["i18n", "src/i18n/*.{ts,tsx}"],
  ["generated", "src/paraglide/**"],
  ["generated", "src/routeTree.gen.ts"],
  ["asset", "src/*.css"],
  ["declaration", "src/env.d.ts"],
  ["context", "src/features/store/store-context.tsx"],
  ["context", "src/features/configuration/configuration-languages-context.ts"],
  ["composition", "src/features/(store)/{admin-shell,store-shell,settings-shell,store-home}.tsx"],
  ["model", "src/features/*/*-{model,defaults}.ts"],
  ["model", "src/features/*/table-cache.ts"],
  ["model", "src/features/*/device-qr-code.ts"],
  ["query", "src/features/*/*-query.ts"],
  ["runtime", "src/features/*/*-dom.ts"],
  [
    "runtime",
    "src/features/*/voice-{connection,runtime,microphone,transcript,delegation,proactive,transport,subscription,observations}.ts",
  ],
  ["feature", "src/features/*/*.tsx"],
];
const file = (categories: string | string[], feature?: string, module?: string[]) => ({
  file: {
    categories,
    ...(feature
      ? module
        ? {
            path: `**/src/features/${feature}/${module.length === 1 ? module[0] : `{${module.join(",")}}`}.{ts,tsx}`,
          }
        : { captured: { feature } }
      : {}),
  },
});
const publicFiles = (feature: string, module: string[]) => ({
  from: file(["feature", "composition"]),
  allow: { to: file(["feature", "composition", "query", "model", "context"], feature, module) },
});
export const boundaryPolicies = [
  {
    from: { file: { path: "**/src/ssr.ts" } },
    allow: { to: { file: { path: "**/src/i18n/runtime-default.ts" } } },
  },

  ...Object.entries({
    test: [
      "test",
      "feature",
      "composition",
      "context",
      "model",
      "query",
      "runtime",
      "component",
      "ui",
      "lib",
      "transport",
      "i18n",
    ],
    route: [
      "feature",
      "composition",
      "context",
      "query",
      "model",
      "component",
      "ui",
      "lib",
      "i18n",
      "generated",
      "asset",
    ],
    router: ["generated", "component", "lib"],
    server: ["server", "generated"],
    transport: ["transport", "lib", "server"],
    lib: ["lib", "transport", "server"],
    component: ["component", "ui", "lib", "i18n"],
    ui: ["ui"],
    i18n: ["i18n", "generated"],
    context: [],
    model: ["i18n", "generated"],
    query: ["lib", "transport"],
    runtime: ["lib", "transport"],
    feature: ["component", "ui", "lib", "transport", "i18n", "context"],
    composition: ["component", "ui", "lib", "transport", "i18n", "context"],
  }).map(([from, to]) => ({ from: file(from), allow: { to: file(to) } })),
  ...owners.flatMap((feature) =>
    Object.entries({
      feature: ["feature", "query", "model", "runtime"],
      composition: ["feature", "composition", "query", "model", "runtime"],
      model: ["model"],
      query: ["query", "model"],
      runtime: ["runtime", "model"],
    }).map(([role, targets]) => ({
      from: file(role, feature),
      allow: { to: file(targets, feature) },
    })),
  ),
  {
    from: { file: { path: "**/src/features/store/home-query.ts" } },
    allow: { to: file("query", "floor", ["floor-query"]) },
  },
  // 画面を構成するstoreは各機能の入口を組み合わせる。共通shellはデータを受け取る。
  {
    from: file("composition"),
    allow: {
      to: file("feature", "configuration", [
        "configuration-header",
        "configuration-route",
        "configuration-toolbar",
        "menu-navigation",
      ]),
    },
  },
  {
    from: file("composition", "store"),
    allow: { to: file("feature", "statistics", ["home-statistics"]) },
  },
  { from: file("model", "kiosk"), allow: { to: file("model", "configuration", ["guide-model"]) } },
  publicFiles("store", ["admin-shell", "settings-shell", "store-query", "home-query"]),
  publicFiles("catalog", ["catalog-query"]),
  publicFiles("configuration", [
    "guide-model",
    "menu-query",
    "drafts-query",
    "configuration-fields",
    "configuration-image-field",
    "configuration-image-model",
    "language-fields",
    "configuration-languages-context",
  ]),
  {
    from: file(["feature", "composition"], "catalog"),
    allow: {
      to: file(["feature", "model"], "configuration", [
        "cast-overview-page",
        "configuration-defaults",
        "configuration-editor",
        "configuration-editor-model",
        "configuration-status",
        "configuration-toolbar",
        "configuration-workflow",
        "instruction-view",
        "menu-model",
        "store-languages-editor",
      ]),
    },
  },
  {
    from: { file: { path: "**/src/features/catalog/menu-item-dom.ts" } },
    allow: {
      to: { file: { categories: "ui", path: "**/src/components/ui/disclosure-target.ts" } },
    },
  },
  {
    from: file("model", "catalog"),
    allow: { to: file("model", "configuration", ["menu-model", "configuration-defaults"]) },
  },
  { from: file(["model", "query"]), allow: { to: file("model", "shell", ["collection-model"]) } },
  {
    from: file(["feature", "query"], "statistics"),
    allow: { to: file("model", "floor", ["floor-model"]) },
  },
  {
    from: file(["feature", "composition"], "store"),
    allow: { to: file("query", "floor", ["floor-query"]) },
  },
  {
    from: file("feature", "floor"),
    allow: { to: file("feature", "rewards", ["coupon-visit", "point-visit"]) },
  },
  { from: file("feature", "floor"), allow: { to: file("feature", "pos", ["pos-checkout"]) } },
  {
    from: file("feature", "demo"),
    allow: { to: file("feature", "configuration", ["configuration-errors"]) },
  },
  { from: file("feature", "demo"), allow: { to: file("feature", "kiosk", ["kiosk"]) } },
  { from: file(["feature", "composition"]), allow: { to: file(["feature", "model"], "shell") } },
  {
    from: file(["feature", "model", "runtime"], "shell"),
    disallow: { to: file(["composition", "query", "runtime", "transport"]) },
  },
  {
    from: file(["feature", "model", "runtime"], "shell"),
    disallow: { to: file(["feature", "composition", "query", "runtime", "transport"], "!shell") },
  },
  { allow: { to: { module: { origin: ["external", "core"] } } } },
  { disallow: { to: { module: { source: "@tablecast/api" } } } },
  { allow: { to: { module: { source: "@tablecast/api", internalPath: "schema" } } } },
  {
    from: file(["feature", "test"]),
    allow: { to: { module: { source: "@tablecast/api", internalPath: "catalog-search" } } },
  },
  {
    from: file("transport"),
    allow: { to: { module: { source: "@tablecast/api", internalPath: "client" } } },
  },
  { from: file("ui"), disallow: { to: { module: { source: "@tablecast/api" } } } },
  { disallow: { to: { module: { source: ["drizzle-orm", "hono", "@hono/*", "bun", "bun:*"] } } } },
  {
    from: file(["ui", "model"]),
    disallow: {
      to: {
        module: {
          source: [
            "@tanstack/react-query",
            "@tanstack/react-start",
            "better-auth",
            "@better-auth/*",
          ],
        },
      },
    },
  },
];
