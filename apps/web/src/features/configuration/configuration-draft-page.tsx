import type { ConfigDraft } from "@tablecast/api/schema";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  LoaderCircle,
  type LucideIcon,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { useState } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScroll,
  DialogTitle,
} from "../../components/ui/dialog";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { m } from "../../paraglide/messages";
import { catalogOptions } from "../catalog/catalog-query";
import { useStore } from "../store/store-context";
import { ConfigurationChanges } from "./configuration-changes";
import { ConfigurationErrors } from "./configuration-errors";
import { ConfigurationToolbar } from "./configuration-toolbar";
import { menuLabels, type MenuReviewSearch, menuSectionSchema } from "./menu-model";
import { draftOptions } from "./menu-query";

export function DraftPage({ draftId, search }: { draftId: string; search: MenuReviewSearch }) {
  const { returnSection = "products", ...listSearch } = search;
  const { id: storeId, role } = useStore();
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const query = useSuspenseQuery(draftOptions(storeId, draftId));
  const draft = query.data;
  const store = useStore();
  const catalog = useSuspenseQuery(catalogOptions(storeId));
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishKey] = useState(() => crypto.randomUUID());
  const route = rpc.api.admin.stores[":storeId"].drafts[":id"];
  const param = { storeId, id: draftId };
  function saved(next: ConfigDraft) {
    client.setQueryData(draftOptions(storeId, draftId).queryKey, next);
    void client.invalidateQueries({ queryKey: ["tablecast-drafts", storeId] });
    void client.invalidateQueries({ queryKey: ["tablecast-draft-choices", storeId] });
    void client.invalidateQueries({ queryKey: ["tablecast-configuration-history", storeId] });
    void client.invalidateQueries({ queryKey: ["tablecast-configuration-release", storeId] });
  }
  const validate = useMutation({
    mutationFn: () => {
      return parseResponse(
        route.validate.$post({ param, json: { expectedVersion: draft.version } }),
      );
    },
    onSuccess: saved,
  });
  const publish = useMutation({
    mutationFn: () => {
      return parseResponse(
        route.publish.$post({
          param,
          json: {
            expectedVersion: draft.version,
            baseVersion: draft.baseVersion,
            idempotencyKey: publishKey,
            approved: true,
          },
        }),
      );
    },
    onSuccess: (next) => {
      saved(next);
      void client.invalidateQueries({ queryKey: ["tablecast-admin-catalog", storeId] });
      void client.invalidateQueries({ queryKey: ["tablecast-home", storeId] });
      void client.invalidateQueries({ queryKey: ["tablecast-stores"] });
      setConfirmPublish(false);
    },
    onError: async (error) => {
      if (apiError(error)?.status !== 409) return;
      await Promise.all([
        client.invalidateQueries({ queryKey: catalogOptions(storeId).queryKey }),
        client.invalidateQueries({ queryKey: draftOptions(storeId, draftId).queryKey }),
      ]);
      setConfirmPublish(false);
    },
  });
  const discard = useMutation({
    mutationFn: () => {
      return parseResponse(
        route.discard.$post({ param, json: { expectedVersion: draft.version } }),
      );
    },
    onSuccess: (next) => {
      saved(next);
      void navigate({ to: "/admin/stores/$storeId/menu/changes", params: { storeId } });
    },
  });
  const busy = [validate.isPending, publish.isPending, discard.isPending].some(Boolean);
  const { editable, stale, cannotPublish, guidance } = draftPublicationState(
    draft,
    role,
    catalog.data.version,
  );
  const error = validate.error || publish.error || discard.error;

  return (
    <>
      <Button
        nativeButton={false}
        role="link"
        variant="ghost"
        className="w-fit"
        render={<Link to="/admin/stores/$storeId/menu/changes" params={{ storeId }} />}
      >
        <ArrowLeft />
        {t("admin_drafts")}
      </Button>
      <PageHeader title={t("admin_review_draft")} />

      <ErrorNotice error={query.error || catalog.error || error} />
      <div className="space-y-2">
        <p
          role="status"
          className={stale || draft.errors.length ? "text-destructive" : "text-muted-foreground"}
        >
          <span key={guidance} className="block motion-safe:animate-tablecast-state">
            {editable ? t(guidance) : t("workflow_terminal_note")}
          </span>
        </p>
        {draft.changes.some((change) => change.sensitive) && (
          <Badge variant="warning">
            <TriangleAlert />
            {t("admin_sensitive")}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-2" aria-label={t("workflow_correction_links")}>
        {menuSectionSchema.options.map((section) => (
          <Button
            key={section}
            nativeButton={false}
            role="link"
            variant="outline"
            render={
              editable ? (
                <Link
                  to="/admin/stores/$storeId/menu/changes/$draftId/$section"
                  params={{ storeId, draftId, section }}
                  search={section === returnSection ? listSearch : {}}
                />
              ) : (
                <Link
                  to="/admin/stores/$storeId/menu/$section"
                  params={{ storeId, section }}
                  search={section === returnSection ? listSearch : {}}
                />
              )
            }
          >
            {t(menuLabels[section])}
          </Button>
        ))}
      </div>
      {(!editable || stale) && (
        <Button
          nativeButton={false}
          role="link"
          render={
            <Link
              to="/admin/stores/$storeId/menu/$section"
              params={{ storeId, section: returnSection }}
              search={listSearch}
            />
          }
        >
          {t("workflow_view_published")}
        </Button>
      )}

      <ConfigurationErrors errors={draft.errors} configuration={draft.configuration} />
      <ConfigurationChanges changes={draft.changes} configuration={draft.configuration} />
      {editable && (
        <ConfigurationToolbar>
          <div className="flex flex-wrap gap-2">
            <ConfirmAction
              label={t("editor_discard_draft")}
              triggerLabel={t("workflow_discard_short")}
              subject={t("menu_discard_note")}
              disabled={busy}
              onConfirm={() => discard.mutate()}
              icon={<Trash2 />}
            />
            <Button
              variant="outline"
              aria-label={t("admin_validate")}
              disabled={busy || !draft.changes.length}
              onClick={() => validate.mutate()}
            >
              <PublicationIcon pending={validate.isPending} icon={Check} />
              {t("workflow_validate_short")}
            </Button>
            <Button
              aria-label={t("admin_publish")}
              disabled={busy || cannotPublish}
              onClick={() => setConfirmPublish(true)}
            >
              <PublicationIcon pending={publish.isPending} icon={Upload} />
              {t("workflow_publish_short")}
            </Button>
          </div>
        </ConfigurationToolbar>
      )}
      <Dialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workflow_publish_title")}</DialogTitle>
            <DialogClose aria-label={t("common_close")}>
              <X />
            </DialogClose>
          </DialogHeader>
          <DialogDescription>
            {m.workflow_publish_impact(
              { store: store.name, version: draft.baseVersion + 1 },
              { locale },
            )}
          </DialogDescription>
          <DialogScroll>
            <ConfigurationChanges changes={draft.changes} configuration={draft.configuration} />
            <ErrorNotice error={publish.error} />
          </DialogScroll>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPublish(false)}>
              {t("common_cancel")}
            </Button>
            <Button
              disabled={busy || cannotPublish}
              data-pwa-blocked={busy}
              onClick={() => publish.mutate()}
            >
              <PublicationIcon pending={publish.isPending} icon={Upload} />
              {t("admin_publish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PublicationIcon({ pending, icon: Icon }: { icon: LucideIcon; pending: boolean }) {
  return pending ? <LoaderCircle className="motion-safe:animate-spin" /> : <Icon />;
}

function draftPublicationState(draft: ConfigDraft, role: string, publishedVersion: number) {
  const editable =
    (draft.status === "draft" || draft.status === "ready") &&
    (role === "owner" || role === "admin");
  const stale = editable && publishedVersion !== draft.baseVersion;
  const cannotPublish =
    !editable ||
    stale ||
    draft.status !== "ready" ||
    draft.errors.length > 0 ||
    !draft.changes.length;
  const guidance = stale
    ? "workflow_stale"
    : draft.errors.length
      ? "workflow_fix_errors"
      : !draft.changes.length
        ? "workflow_no_changes"
        : draft.status !== "ready"
          ? "workflow_validate_first"
          : "workflow_publish_ready";
  return { editable, stale, cannotPublish, guidance } as const;
}
