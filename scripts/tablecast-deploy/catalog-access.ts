import { z } from "zod";
import { cloudflare } from "../tablecast-deploy-api.ts";
import { accessApplicationConfig, tablecastAccess } from "../tablecast-deploy-config.ts";
import { assertAccessConfiguration } from "../tablecast-infra-access.ts";

const appSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().optional(),
  destinations: z
    .array(
      z.object({ type: z.string(), worker_id: z.string().optional(), uri: z.string().optional() }),
    )
    .optional(),
  policies: z.array(z.object({ id: z.string() })).optional(),
});

export async function applications() {
  const apps = z.array(appSchema).parse(await cloudflare("access/apps?per_page=1000"));
  if (apps.length >= 1000) throw new Error("Access一覧の上限に達しました。");
  return apps;
}

export function ownedCatalogApplication(
  app: z.infer<typeof appSchema>,
  name: string,
  domain: string,
  workerId?: string,
) {
  if (
    app.name !== name ||
    (app.domain !== domain &&
      !(
        workerId &&
        app.destinations?.length === 1 &&
        app.destinations[0]?.type === "worker" &&
        app.destinations[0]?.worker_id === workerId
      ))
  )
    throw new Error("カタログAccessの所有対象が一致しません。");
  if (
    app.destinations?.some(
      (value) =>
        !(value.type === "public" && value.uri === domain) &&
        !(value.type === "worker" && value.worker_id === workerId),
    )
  )
    throw new Error("他の対象を含むAccess applicationは変更できません。");
}

export async function protect(name: string, domain: string, workerId?: string) {
  const [apps] = await Promise.all([applications(), assertAccessConfiguration()]);
  const app = apps.find((value) => value.name === name);
  if (app) ownedCatalogApplication(app, name, domain, workerId);
  const policies = tablecastAccess.policies.map((value) => value.id);
  const created = appSchema.parse(
    await cloudflare(
      `access/apps${app ? `/${app.id}` : ""}`,
      app ? "PUT" : "POST",
      accessApplicationConfig(name, domain, workerId),
    ),
  );
  const checked = appSchema.parse(await cloudflare(`access/apps/${created.id}`));
  ownedCatalogApplication(checked, name, domain, workerId);
  if (
    workerId &&
    !checked.destinations?.some((value) => value.type === "worker" && value.worker_id === workerId)
  )
    throw new Error("Worker単位のAccess保護を確認できません。");
  if (
    checked.policies?.length !== 2 ||
    !policies.every((id) => checked.policies?.some((value) => value.id === id))
  )
    throw new Error("Access policyを確認できません。");
}
