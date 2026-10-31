import type { ConfigDraft, Demo } from "@tablecast/api/schema";

export type DemoDraft = Pick<
  ConfigDraft,
  "configuration" | "createdAt" | "id" | "status" | "version"
>;

export function demoConfigurationState(
  data: Demo,
  drafts: DemoDraft[] | undefined,
  publishedVersion: number | undefined,
  sourceError: unknown,
  sourceDraftId?: null | string,
) {
  const sourceVersion = data.sourceDraftId
    ? drafts?.find((draft) => draft.id === data.sourceDraftId)?.version
    : publishedVersion;
  const hasUpdate =
    !sourceError && sourceVersion !== undefined && sourceVersion > data.sourceVersion;
  const draftItems =
    drafts?.filter((draft) => draft.status === "draft" || draft.status === "ready") ?? [];
  const selectedConfiguration =
    draftItems.find((draft) => draft.id === sourceDraftId)?.configuration ?? data.configuration;
  return { hasUpdate, draftItems, selectedConfiguration };
}
