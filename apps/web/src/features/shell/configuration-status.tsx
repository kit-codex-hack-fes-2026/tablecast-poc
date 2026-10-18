import type { ConfigDraft } from "@tablecast/api/schema";
import { Check, FilePenLine, LoaderCircle, TriangleAlert } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { useI18n } from "../../i18n/locale";
import { apiError } from "../../lib/api-error";
import { m } from "../../paraglide/messages";

export function DraftStatus({ status }: { status: ConfigDraft["status"] }) {
  const { t } = useI18n();
  return (
    <Badge variant={status === "ready" || status === "published" ? "success" : "inactive"}>
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
  storeName?: string;
  publishedVersion: number;
  draft?: Pick<ConfigDraft, "id" | "baseVersion" | "version" | "status">;
  dirty?: boolean;
  pending?: boolean;
  error?: unknown;
}) {
  const { t, locale } = useI18n();
  const state = pending
    ? "workflow_saving"
    : error
      ? apiError(error)?.status === 409
        ? "workflow_conflict"
        : "workflow_failed"
      : dirty
        ? "workflow_dirty"
        : undefined;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm" role="status">
      <span hidden={!storeName} className="min-w-0 wrap-anywhere font-semibold">
        {storeName}
      </span>
      <span>{m.workflow_published_version({ version: publishedVersion }, { locale })}</span>
      {draft && (
        <>
          <span className="wrap-anywhere">
            {m.workflow_draft_identity({ id: draft.id.slice(0, 8) }, { locale })}
          </span>
          <span>{m.workflow_base_version({ version: draft.baseVersion }, { locale })}</span>
          <span>{m.workflow_revision({ version: draft.version }, { locale })}</span>
          <DraftStatus status={draft.status} />
        </>
      )}
      {state && (
        <Badge variant={error ? "destructive" : "secondary"}>
          {pending ? (
            <LoaderCircle className="size-4 motion-safe:animate-spin" />
          ) : error ? (
            <TriangleAlert className="size-4" />
          ) : (
            <FilePenLine className="size-4" />
          )}
          {t(state)}
        </Badge>
      )}
    </div>
  );
}
