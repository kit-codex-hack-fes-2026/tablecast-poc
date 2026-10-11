import { z } from "zod";
import { cloudflare } from "./tablecast-deploy-api";
import { tablecastAccess } from "../infra/tablecast.config";

const policySchema = z.object({
  id: z.string(),
  name: z.string(),
  decision: z.string(),
  include: z.array(z.json()),
  require: z.array(z.json()),
  exclude: z.array(z.json()),
});
const tokenSchema = z.object({ id: z.string(), name: z.string(), duration: z.string() });
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};

export async function reconcileAccess(apply = false, request = cloudflare) {
  const policies = z.array(policySchema).parse(await request("access/policies?per_page=1000"));
  const token = tokenSchema
    .optional()
    .parse(
      await request(
        `access/service_tokens/${tablecastAccess.serviceToken.id}`,
        "GET",
        undefined,
        true,
      ),
    );
  if (policies.length >= 1000) throw new Error("Access policy一覧の上限に達しました。");
  if (
    !token ||
    token.id !== tablecastAccess.serviceToken.id ||
    token.name !== tablecastAccess.serviceToken.name
  )
    throw new Error("採用済みservice tokenがありません。再生成せず外部入力を確認してください。");
  // durationの更新でも既存client secretを再発行しない。失効したtokenも勝手に置換しない。
  const changes: { resource: string; action: "update" | "unchanged" }[] = [];
  for (const desired of tablecastAccess.policies) {
    const actual = policies.find((value) => value.id === desired.id);
    if (!actual || actual.name !== desired.name)
      throw new Error("採用済みAccess policyの所有情報が一致しません。");
    const changed = canonical(actual) !== canonical(desired);
    changes.push({ resource: desired.name, action: changed ? "update" : "unchanged" });
    if (apply && changed) await request(`access/policies/${desired.id}`, "PUT", desired);
  }
  const changed = token.duration !== tablecastAccess.serviceToken.duration;
  changes.push({ resource: token.name, action: changed ? "update" : "unchanged" });
  if (apply && changed)
    await request(`access/service_tokens/${token.id}`, "PUT", {
      name: token.name,
      duration: tablecastAccess.serviceToken.duration,
    });
  return changes;
}

export async function assertAccessConfiguration() {
  if ((await reconcileAccess()).some((change) => change.action !== "unchanged"))
    throw new Error(
      "Access設定に差分があります。infra:planで確認してinfra:applyで反映してください。",
    );
}
