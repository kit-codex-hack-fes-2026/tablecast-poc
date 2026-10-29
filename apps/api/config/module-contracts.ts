import { dependencies } from "./dependencies.ts";

// 別moduleから使う能力だけを公開する。use-case内部とHTTP組立ては所有moduleに留める。
const moduleContracts = {
  account: [],
  appearance: ["model"],
  auth: ["middleware", "model", "policy", "token", "passkey-policy"],
  billing: ["credentials", "stripe", "usage"],
  catalog: ["conditions", "model", "pricing", "queries", "search"],
  configuration: [
    "instruction-model",
    "instruction-response",
    "model",
    "queries",
    "use-cases/drafts",
  ],
  "customer-coupons": [
    "audience",
    "issuance",
    "model",
    "queries",
    "use-cases/issue",
    "use-cases/rules",
  ],
  "customer-memory": [
    "context",
    "model",
    "queries",
    "use-cases/consumption",
    "use-cases/sources",
    "use-cases/target",
  ],
  "customer-points": ["mutations", "model", "queries", "use-cases/policy"],
  "customer-visits": ["queries", "service"],
  currency: ["model", "display", "service"],
  customers: ["middleware", "model", "queries"],
  demo: ["queries"],
  devices: [],
  games: ["model", "queries", "use-cases/publication"],
  mcp: [],
  media: ["model", "service", "queries"],
  orders: ["queries", "model", "use-cases/cart", "use-cases/confirmation"],
  statistics: ["model", "service"],
  stores: ["queries"],
  tables: [
    "assistance-queries",
    "use-cases/assistance",
    "model",
    "mutations",
    "queries",
    "core-queries",
    "state-read",
    "use-cases/presentation",
    "values",
  ],
  voice: ["catalog", "model", "runtime", "service"],
};

const compositions = {
  "stores/routes": [
    "catalog/routes",
    "statistics/routes",
    "customer-points/admin-routes",
    "customer-coupons/admin-routes",
    "configuration/routes",
    "games/admin-routes",
    "devices/admin-routes",
    "media/admin-routes",
    "orders/routes",
    "tables/admin-routes",
    "voice/catalog-routes",
  ],
  "customers/routes": [
    "customer-visits/routes",
    "customer-memory/routes",
    "customer-points/routes",
    "customer-coupons/routes",
  ],
  "tables/ordering-routes": ["media/routes"],
  "customer-coupons/routes": ["media/routes"],
  "customers/public-routes": ["media/routes"],
  "tables/operations-routes": ["games/routes", "voice/routes"],
  "demo/routes": ["tables/operations-routes"],
};

export const modulePolicies = [
  ...Object.entries(moduleContracts).flatMap(([module, paths]) => [
    {
      from: { file: { path: `src/modules/!(${module})/**` } },
      disallow: { to: { file: { path: `src/modules/${module}/**` } } },
    },
    ...Object.entries(dependencies).map(([category, allowed]) => ({
      from: { file: { path: `src/modules/!(${module})/**`, categories: category } },
      allow: {
        to: {
          file: {
            path: paths.map((path) => `src/modules/${module}/${path}.ts`),
            categories: allowed,
          },
        },
      },
    })),
  ]),
  // 業務確定の連鎖を作らず、別moduleは読取・statement契約で同じbatchへ参加する。
  ...Object.keys(moduleContracts).map((module) => ({
    from: { file: { path: `src/modules/!(${module})/**`, categories: "use-case" } },
    disallow: { to: { file: { path: `src/modules/${module}/**`, categories: "use-case" } } },
  })),
  ...Object.entries(compositions).map(([source, targets]) => ({
    from: { file: { path: `src/modules/${source}.ts` } },
    allow: {
      to: { file: { path: targets.map((path) => `src/modules/${path}.ts`), categories: "route" } },
    },
  })),
  { disallow: { to: { file: { categories: "integration" } } } },
  {
    from: { file: { path: "src/modules/voice/runtime.ts" } },
    allow: { to: { file: { categories: "integration" } } },
  },
];
