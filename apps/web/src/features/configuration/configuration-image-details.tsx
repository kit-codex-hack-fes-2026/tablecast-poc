import { productSchema } from "@tablecast/api/schema";
import { ImageOff, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ImageInput, ImageMetadata, ImageValue } from "./configuration-image-model";
import { ProductImage } from "../../components/product-image";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { BooleanField } from "./configuration-fields";

function ImagePreview({ src, label }: { label: string; src: null | string }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  return (
    <figure className="grid min-w-0 justify-items-start gap-2">
      <figcaption className="text-sm font-medium">{label}</figcaption>
      <div className="flex size-32 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {src && !failed ? (
          src.startsWith("blob:") ? (
            <img
              src={src}
              alt={label}
              width={128}
              height={128}
              className="size-full object-contain"
              onError={() => setFailed(true)}
            />
          ) : (
            <ProductImage
              src={src}
              alt={label}
              width={128}
              height={128}
              sizes="128px"
              className="size-full object-contain"
              onError={() => setFailed(true)}
            />
          )
        ) : (
          <ImageOff aria-hidden className="size-8 text-muted-foreground" />
        )}
      </div>
      {(!src || failed) && (
        <p role={failed ? "status" : undefined} className="text-sm text-muted-foreground">
          {t(failed ? "editor_image_load_error" : "editor_image_empty")}
        </p>
      )}
    </figure>
  );
}

export function ImageMetadataFields({
  id,
  value,
  disabled,
  invalid,
  onChange,
}: {
  disabled: boolean;
  id: string;
  invalid: boolean;
  onChange: (value: ImageMetadata) => void;
  value: ImageMetadata;
}) {
  const { t } = useI18n();
  return (
    <>
      <label className="grid gap-2 text-sm">
        {t("editor_image_kind")}
        <NativeSelect
          value={value.imageKind}
          disabled={disabled || value.imageSource.generated}
          onChange={(event) =>
            onChange({
              ...value,
              imageKind: productSchema.shape.imageKind.parse(event.target.value),
            })
          }
        >
          <option value="illustration">{t("kiosk_illustration")}</option>
          <option value="photograph">{t("editor_photograph")}</option>
        </NativeSelect>
      </label>
      <BooleanField
        label={t("editor_generated_image")}
        disabled={disabled}
        value={value.imageSource.generated}
        onChange={(generated) =>
          onChange({
            imageKind: generated ? "illustration" : value.imageKind,
            imageSource: { ...value.imageSource, generated },
          })
        }
      />
      <label className="grid gap-2 text-sm">
        <span id={`${id}-source-label`}>{t("editor_image_source")}</span>
        <Input
          aria-labelledby={`${id}-source-label`}
          aria-invalid={invalid}
          maxLength={500}
          value={value.imageSource.description}
          disabled={disabled}
          aria-describedby={`${id}-source ${id}-error`}
          onChange={(event) =>
            onChange({
              ...value,
              imageSource: { ...value.imageSource, description: event.target.value },
            })
          }
        />
        <span id={`${id}-source`} className="text-muted-foreground">
          {t("editor_image_source_hint")}
        </span>
      </label>
    </>
  );
}

export function CurrentImageDetails({
  value,
  disabled,
  onRemove,
}: {
  disabled: boolean;
  onRemove: () => void;
  value: ImageValue;
}) {
  const { t } = useI18n();
  if (!value.imageKey) return null;
  return (
    <div className="grid gap-2 text-sm">
      <p>
        {t(value.imageKind === "illustration" ? "kiosk_illustration" : "editor_photograph")}
        {value.imageSource?.generated && (
          <span className="ml-2">{t("editor_generated_image")}</span>
        )}
      </p>
      {value.imageSource && <p className="wrap-break-word">{value.imageSource.description}</p>}
      <Button
        variant="outline"
        type="button"
        className="justify-self-start"
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 aria-hidden />
        {t("editor_image_remove")}
      </Button>
    </div>
  );
}

export function ImagePreviews({
  value,
  candidate,
  mode,
}: {
  candidate: ImageInput["candidate"];
  mode: string;
  value: ImageValue;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-6">
      <ImagePreview
        key={value.imageKey ?? "none"}
        src={value.imageKey ? `/media/${value.imageKey}` : null}
        label={t("editor_image_current")}
      />
      {candidate && mode === "file" && (
        <ImagePreview key={candidate.url} src={candidate.url} label={t("editor_image_candidate")} />
      )}
    </div>
  );
}
