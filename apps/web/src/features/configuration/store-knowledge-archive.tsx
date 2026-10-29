import { type StoreSkill } from "@tablecast/api/schema";
import { useMutation } from "@tanstack/react-query";
import { Archive, ArrowDownToLine, Upload } from "lucide-react";
import { useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScroll,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { configurationImageUploadKey } from "./menu-query";

export function KnowledgeArchiveControls({
  storeId,
  value,
  onChange,
  disabled,
}: {
  disabled: boolean;
  onChange?: (value: StoreSkill[]) => void;
  storeId: string;
  value: StoreSkill[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [replace, setReplace] = useState(false);
  const [kind, setKind] = useState<"illustration" | "photograph">("photograph");
  const [generated, setGenerated] = useState(false);
  const [description, setDescription] = useState("");
  const importArchive = useMutation({
    mutationKey: configurationImageUploadKey(storeId),
    mutationFn: async () => {
      if (!file || file.size > 5 * 1024 * 1024) throw new Error(t("knowledge_archive_size"));
      const data = new Uint8Array(await file.arrayBuffer()).toBase64();
      return parseResponse(
        await rpc.api.admin.stores[":storeId"].knowledge.import.$post({
          param: { storeId },
          json: {
            skills: value,
            data,
            replaceExisting: replace,
            ...(description.trim()
              ? {
                  imageMetadata: {
                    imageKind: generated ? "illustration" : kind,
                    imageSource: { generated, description },
                  },
                }
              : {}),
          },
        }),
      );
    },
    onSuccess: (result) => {
      onChange?.(result.skills);
      setOpen(false);
    },
  });
  const exportArchive = useMutation({
    mutationFn: async () => {
      const response = await rpc.api.admin.stores[":storeId"].knowledge.archive.$post({
        param: { storeId },
        json: { skills: value },
      });
      if (!response.ok) {
        await parseResponse(response);
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "tablecast-skills.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  const pending = disabled || importArchive.isPending || exportArchive.isPending;
  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        {onChange && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setOpen(true)}
            className="text-info-text"
          >
            <Upload />
            {t("knowledge_import_zip")}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !value.length}
          onClick={() => exportArchive.mutate()}
          className="text-nav-menu"
        >
          <ArrowDownToLine />
          {t("knowledge_export_zip")}
        </Button>
      </div>
      <ActionFeedback mutation={exportArchive} successMessage={t("knowledge_exported")} />
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!importArchive.isPending) setOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Archive className="mr-2 inline size-5 text-info-text" />
              {t("knowledge_import_zip")}
            </DialogTitle>
            <DialogDescription>{t("knowledge_archive_hint")}</DialogDescription>
          </DialogHeader>
          <DialogScroll className="space-y-4">
            <label className="grid gap-2 text-sm">
              {t("knowledge_archive_file")}
              <Input
                type="file"
                accept=".zip,application/zip"
                disabled={pending}
                onChange={(event) => setFile(event.target.files?.[0])}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={replace}
                onCheckedChange={(checked) => setReplace(checked)}
                disabled={pending}
              />
              {t("knowledge_replace_existing")}
            </label>
            <details className="space-y-3 rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {t("knowledge_archive_image_source")}
              </summary>
              <label className="mt-3 grid gap-2 text-sm">
                {t("editor_image_source")}
                <Input
                  value={description}
                  maxLength={500}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="grid gap-2 text-sm">
                {t("editor_image_kind")}
                <NativeSelect
                  value={kind}
                  onChange={(event) =>
                    setKind(event.target.value === "illustration" ? "illustration" : "photograph")
                  }
                  disabled={pending || generated}
                >
                  <option value="photograph">{t("knowledge_photo")}</option>
                  <option value="illustration">{t("knowledge_illustration")}</option>
                </NativeSelect>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={generated}
                  onCheckedChange={(checked) => setGenerated(checked)}
                  disabled={pending}
                />
                {t("knowledge_generated_image")}
              </label>
            </details>
            <ActionFeedback mutation={importArchive} successMessage={t("knowledge_imported")} />
          </DialogScroll>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {t("common_cancel")}
            </Button>
            <Button
              type="button"
              disabled={pending || !file}
              onClick={() => importArchive.mutate()}
            >
              <Upload />
              {t("knowledge_import_zip")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
