import { tablecastAccountId } from "../scripts/tablecast-deploy-config.ts";

// 2026-10-11にD1一覧・DO一覧とSQLite storageを照合した常設資源。
export const tablecastAdoptedResources = {
  production: {
    database: "6cc5c833-9c01-4172-92e7-18d713db9a8f",
    namespaces: {
      StoreEvents: "2d4e84834bfc4d41be6093d4e5242d8c",
      TablecastEmulate: "4bb365dc1db448d9a38480381e06508f",
    },
  },
  staging: {
    database: "0af58c70-6818-4e94-a23d-976993d321c4",
    namespaces: {
      StoreEvents: "2c60391b44404f5280829a980bcaf795",
      TablecastEmulate: "238f0efa5ad349a7bceffc8ab1cb158c",
    },
  },
};

// 2026-10-11に現物を照合した既存ID。service tokenの秘密値・期限を再生成しない。
export const tablecastAccess = {
  serviceToken: {
    id: "7ac8f0a6-6fbe-45a0-b1e1-3c3b495e5e6d",
    name: "tablecast-preview-service",
    duration: "8760h",
  },
  policies: [
    {
      id: "7abce02a-37b7-43df-94e3-ba95360ea74f",
      name: "tablecast-preview-members",
      decision: "allow",
      include: [{ cloudflare_account_member: { account_id: tablecastAccountId } }],
      require: [],
      exclude: [],
    },
    {
      id: "53f813e1-8d09-4588-a513-fcc40856b3be",
      name: "tablecast-preview-service",
      decision: "non_identity",
      include: [{ service_token: { token_id: "7ac8f0a6-6fbe-45a0-b1e1-3c3b495e5e6d" } }],
      require: [],
      exclude: [],
    },
  ],
} as const;

export function accessApplicationConfig(name: string, domain: string, workerId?: string) {
  return {
    name,
    type: "self_hosted",
    session_duration: "24h",
    ...(workerId ? { destinations: [{ type: "worker", worker_id: workerId }] } : { domain }),
    policies: tablecastAccess.policies.map((policy, index) => ({
      id: policy.id,
      precedence: index + 1,
    })),
  };
}
