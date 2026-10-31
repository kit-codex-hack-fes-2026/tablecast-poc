import type { RawConfig } from "@cloudflare/workers-utils";
import { z } from "zod";
import type { DeploymentTarget } from "./tablecast-deploy-config.ts";

export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};

const bindingSchema = z.array(z.looseObject({ name: z.string(), type: z.string() }));
export function assertWorkerOwner(
  actual: Record<string, unknown>,
  target: DeploymentTarget,
  api: boolean,
  databaseId?: string,
  namespaces?: readonly { class: string; id: string }[],
) {
  const bindings = bindingSchema.parse(actual.bindings);
  const text = (name: string) => bindings.find((binding) => binding.name === name)?.text;
  if (
    text("TABLECAST_ENV") !== target.environment ||
    text("TABLECAST_PR_NUMBER") !== (target.pr ?? "")
  )
    throw new Error(
      "Workerの所有環境・PR番号が一致しません。対象外のWorkerは変更・削除できません。",
    );
  if (
    api &&
    (!databaseId || bindings.find((binding) => binding.name === "TABLECAST_DB")?.id !== databaseId)
  )
    throw new Error("Workerが所有台帳とは別のD1を参照しています。");
  if (
    api &&
    namespaces &&
    bindings.some(
      (binding) =>
        binding.type === "durable_object_namespace" &&
        !namespaces.some(
          (namespace) =>
            namespace.class === binding.class_name && namespace.id === binding.namespace_id,
        ),
    )
  )
    throw new Error("Workerが所有対象とは別のDO namespaceを参照しています。");
}

export function workerConfigurationDiff(
  config: RawConfig,
  actual: Record<string, unknown>,
  schedules: unknown,
) {
  const fields: string[] = [];
  for (const [key, expected] of Object.entries({
    compatibility_date: config.compatibility_date,
    compatibility_flags: config.compatibility_flags,
    placement: config.placement ?? {},
  })) {
    if (canonical(actual[key] ?? null) !== canonical(expected ?? null)) fields.push(key);
  }
  const observed = z.record(z.string(), z.unknown()).parse(actual.observability ?? {});
  for (const [key, expected] of Object.entries(config.observability ?? {}))
    if (canonical(observed[key]) !== canonical(expected)) fields.push(`observability.${key}`);
  const bindings = bindingSchema.parse(actual.bindings);
  const expected: Record<string, Record<string, unknown>> = {};
  for (const [name, value] of Object.entries(config.vars ?? {}))
    expected[name] = { type: "plain_text", text: value };
  for (const name of config.secrets?.required ?? []) expected[name] = { type: "secret_text" };
  for (const binding of config.d1_databases ?? [])
    expected[binding.binding] = { type: "d1", id: binding.database_id };
  for (const binding of config.r2_buckets ?? [])
    expected[binding.binding] = { type: "r2_bucket", bucket_name: binding.bucket_name };
  for (const binding of config.services ?? [])
    expected[binding.binding] = { type: "service", service: binding.service };
  for (const binding of config.durable_objects?.bindings ?? [])
    expected[binding.name] = { type: "durable_object_namespace", class_name: binding.class_name };
  for (const binding of config.send_email ?? [])
    expected[binding.name] = {
      type: "send_email",
      destination_address: binding.destination_address,
      allowed_destination_addresses: binding.allowed_destination_addresses,
      allowed_sender_addresses: binding.allowed_sender_addresses,
    };
  if (config.images) expected[config.images.binding] = { type: "images" };
  for (const [name, value] of Object.entries(expected)) {
    const binding = bindings.find((entry) => entry.name === name);
    if (
      !binding ||
      Object.entries(value).some(([key, desired]) => canonical(binding[key]) !== canonical(desired))
    )
      fields.push(`bindings.${name}`);
  }
  for (const binding of bindings)
    if (!expected[binding.name] && binding.type !== "secret_text")
      fields.push(`bindings.${binding.name}.remove`);
  const crons = z.object({ schedules: z.array(z.object({ cron: z.string() })) }).parse(schedules);
  if (
    canonical(crons.schedules.map(({ cron }) => cron)) !== canonical(config.triggers?.crons ?? [])
  )
    fields.push("triggers.crons");
  return fields;
}
