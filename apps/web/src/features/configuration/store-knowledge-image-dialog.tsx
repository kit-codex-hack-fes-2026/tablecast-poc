import { type StoreSkill, storeSkillSchema } from "@tablecast/api/schema";
import { useState } from "react";
import type { ImageValue } from "./configuration-image-model";
import { Button } from "../../components/ui/button";
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
import { useI18n } from "../../i18n/locale";
import { ConfigurationImageField } from "./configuration-image-field";
type KnowledgeFile = StoreSkill["files"][number];
export function KnowledgeImageDialog({
  skill,
  storeId,
  disabled,
  onOpenChange,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (file: KnowledgeFile) => void;
  onOpenChange: (open: boolean) => void;
  skill: StoreSkill;
  storeId: string;
}) {
  const { t } = useI18n();
  const [path, setPath] = useState(`assets/image-${skill.files.length}.webp`);
  const [alt, setAlt] = useState("");
  const [image, setImage] = useState<ImageValue>({ imageKey: null, imageKind: "photograph" });
  const candidate =
    image.imageKey && image.imageSource
      ? {
          path,
          alt,
          imageKey: image.imageKey,
          imageKind: image.imageKind,
          imageSource: image.imageSource,
        }
      : undefined;
  const valid =
    candidate &&
    storeSkillSchema.safeParse({ ...skill, files: [...skill.files, candidate] }).success;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("knowledge_add_image")}</DialogTitle>
          <DialogDescription>{t("knowledge_image_hint")}</DialogDescription>
        </DialogHeader>
        <DialogScroll className="space-y-4">
          <label className="grid gap-2 text-sm">
            {t("knowledge_path")}
            <Input value={path} onChange={(event) => setPath(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm">
            {t("theme_alt")}
            <Input value={alt} maxLength={300} onChange={(event) => setAlt(event.target.value)} />
          </label>
          <ConfigurationImageField
            storeId={storeId}
            value={image}
            onChange={setImage}
            disabled={disabled}
          />
        </DialogScroll>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common_cancel")}
          </Button>
          <Button
            type="button"
            disabled={disabled || !valid}
            onClick={() => {
              if (candidate && valid) onAdd(candidate);
            }}
          >
            {t("knowledge_add_image")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
