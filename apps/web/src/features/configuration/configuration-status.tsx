import type { ConfigDraft } from "@tablecast/api/schema";
import { Check, FilePenLine, LoaderCircle, TriangleAlert } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { useI18n } from "../../i18n/locale";
import { apiError } from "../../lib/api-error";
import { m } from "../../paraglide/messages";

export function DraftStatus({ status }: { status: ConfigDraft["status"] }) {
  const { t } = useI18n();
  return (
    <Badge
      key={status}
      className="motion-safe:animate-tablecast-state"
      variant={
        status === "published" || status === "ready"
          ? "success"
          : status === "draft"
            ? "info"
            : "inactive"
      }
    >
      {status === "ready" || status === "published" ? (
        <Check className="size-4" />
      ) : (
        <FilePenLine className="size-4" />
      )}
      {t(status === "draft" ? "workflow_saved" : `draft_${status}`)}
    </Badge>
  );
}

export function ConfigurationStatus({
  storeName,
  publishedVersion,
  draft,
  dirty = false,
  pending = false,
  error,
}: {
  dirty?: boolean;
  draft?: Pick<ConfigDraft, "baseVersion" | "id" | "status" | "version">;
  error?: unknown;
  pending?: boolean;
  publishedVersion: number;
  storeName?: string;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm" role="status">
      <span hidden={!storeName} className="min-w-0 wrap-anywhere font-semibold">
        {storeName}
      </span>
      <span>{m.workflow_published_version({ version: publishedVersion }, { locale })}</span>
      {draft && (
        <>
          <span className="inline-flex flex-wrap items-center gap-2 border-l-2 border-info/30 pl-3">
            <FilePenLine aria-hidden="true" className="size-4 text-info" />
            {t("workflow_draft_identity")}
            <span className="text-muted-foreground">
              {m.workflow_base_version({ version: draft.baseVersion }, { locale })}
            </span>
          </span>
          <DraftStatus status={draft.status} />
        </>
      )}
      <SaveStatus dirty={dirty} pending={pending} error={error} />
    </div>
  );
}

export function SaveStatus({
  dirty,
  pending,
  error,
}: {
  dirty: boolean;
  error?: unknown;
  pending: boolean;
}) {
  const { t } = useI18n();
  if (pending)
    return (
      <Badge key="info" variant="info" className="motion-safe:animate-tablecast-state">
        <LoaderCircle className="size-4 motion-safe:animate-spin" />
        {t("workflow_saving")}
      </Badge>
    );
  if (error)
    return (
      <Badge
        key="destructive"
        variant="destructive"
        className="motion-safe:animate-tablecast-state"
      >
        <TriangleAlert className="size-4" />
        {t(apiError(error)?.status === 409 ? "workflow_conflict" : "workflow_failed")}
      </Badge>
    );
  if (dirty)
    return (
      <Badge key="warning" variant="warning" className="motion-safe:animate-tablecast-state">
        <FilePenLine className="size-4" />
        {t("workflow_dirty")}
      </Badge>
    );
  return null;
}
