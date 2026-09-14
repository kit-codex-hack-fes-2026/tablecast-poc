import {
  imageMetadataSchema,
  maxImageBytes,
  productSchema,
  type Product,
} from "@tablecast/api/schema";
import { useMutation } from "@tanstack/react-query";
import { ImageOff, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { ProductImage } from "../../components/product-image";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { BooleanField } from "./configuration-fields";
import { configurationImageUploadKey } from "./menu-query";

type ImageValue = Pick<Product, "imageKey" | "imageKind" | "imageSource">;
export type ImageStagedChange = (id: string, staged: boolean) => void;
type ImageMetadata = Pick<Product, "imageKind"> & {
  imageSource: NonNullable<Product["imageSource"]>;
};
type ImageInput = {
  candidate: { file: File; url: string } | null;
  imageKey: string;
  metadata: ImageMetadata;
  staged: boolean;
  error:
    | "editor_image_invalid_file"
    | "editor_image_invalid_key"
    | "editor_image_source_required"
    | null;
};
const emptyMetadata = {
  imageKind: "illustration" as const,
  imageSource: { generated: false, description: "" },
};

function imageInput(value: ImageValue): ImageInput {
  return {
    candidate: null,
    imageKey: value.imageKey ?? "",
    metadata: {
      imageKind: value.imageKind,
      imageSource: value.imageSource ?? emptyMetadata.imageSource,
    },
    staged: false,
    error: null,
  };
}

function ImagePreview({ src, label }: { src: string | null; label: string }) {
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

export function ConfigurationImageField({
  storeId,
  value,
  onChange,
  onStagedChange,
  disabled,
}: {
  storeId: string;
  value: ImageValue;
  onChange: (value: ImageValue) => void;
  onStagedChange?: ImageStagedChange;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const [mode, setMode] = useState("file");
  const [input, setInput] = useState(() => imageInput(value));
  const { candidate, imageKey, metadata, staged, error } = input;
  function updateInput(change: Partial<ImageInput>) {
    setInput((previous) => ({ ...previous, ...change }));
    if (change.staged !== undefined) onStagedChange?.(id, change.staged);
  }
  const mounted = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onStagedChange?.(id, false);
    };
  }, [id, onStagedChange]);
  useEffect(
    () => () => {
      if (candidate) URL.revokeObjectURL(candidate.url);
    },
    [candidate],
  );
  const upload = useMutation({
    mutationKey: configurationImageUploadKey(storeId),
    mutationFn: ({ file, metadata: submission }: { file: File; metadata: ImageMetadata }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].images.$post({
          param: { storeId },
          form: { image: file, metadata: JSON.stringify(submission) },
        }),
      ),
    onSuccess: (result) => {
      if (!mounted.current) return;
      onChange({
        imageKey: result.imageKey,
        imageKind: result.imageKind,
        imageSource: result.imageSource,
      });
      updateInput(imageInput(result));
      if (fileInput.current) fileInput.current.value = "";
    },
  });
  useEffect(() => {
    if (upload.isSuccess && document.activeElement === document.body) fileInput.current?.focus();
  }, [upload.isSuccess]);
  const busy = disabled || upload.isPending;
  function apply() {
    updateInput({ error: null });
    if (mode === "file") {
      if (!candidate) return;
      const parsed = imageMetadataSchema.safeParse(metadata);
      if (!parsed.success) {
        updateInput({ error: "editor_image_source_required" });
        return;
      }
      upload.mutate({ file: candidate.file, metadata: parsed.data });
    } else {
      const parsed = productSchema.shape.imageKey.safeParse(imageKey.trim());
      if (!parsed.success) {
        updateInput({ error: "editor_image_invalid_key" });
        return;
      }
      const source = imageMetadataSchema.safeParse(metadata);
      if (!source.success && parsed.data?.startsWith("tablecast/uploads/")) {
        updateInput({ error: "editor_image_source_required" });
        return;
      }
      const next = {
        imageKey: parsed.data,
        imageKind: metadata.imageKind,
        imageSource: source.success ? source.data.imageSource : undefined,
      };
      onChange(next);
      updateInput(imageInput(next));
      upload.reset();
    }
  }
  return (
    <fieldset className="grid min-w-0 gap-4" disabled={disabled} aria-describedby={`${id}-hint`}>
      <legend className="sr-only">{t("editor_image_settings")}</legend>
      <div className="flex flex-wrap gap-6">
        <ImagePreview
          key={value.imageKey ?? "none"}
          src={value.imageKey ? `/media/${value.imageKey}` : null}
          label={t("editor_image_current")}
        />
        {candidate && mode === "file" && (
          <ImagePreview
            key={candidate.url}
            src={candidate.url}
            label={t("editor_image_candidate")}
          />
        )}
      </div>
      {value.imageKey && (
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
            disabled={busy}
            onClick={() => {
              onChange({ imageKey: null, imageKind: "illustration", imageSource: undefined });
              updateInput(imageInput({ imageKey: null, imageKind: "illustration" }));
              upload.reset();
              if (fileInput.current) fileInput.current.value = "";
              fileInput.current?.focus();
            }}
          >
            <Trash2 aria-hidden />
            {t("editor_image_remove")}
          </Button>
        </div>
      )}
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {t("editor_image_save_hint")}
      </p>
      <label className="grid gap-2 text-sm">
        {t("editor_image_method")}
        <NativeSelect
          disabled={busy}
          value={mode}
          onChange={(event) => {
            setMode(event.target.value);
            updateInput({ error: null });
            upload.reset();
          }}
        >
          <option value="file">{t("editor_image_file")}</option>
          <option value="existing">{t("editor_image_existing")}</option>
        </NativeSelect>
      </label>
      {mode === "file" ? (
        <div className="grid gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-self-start gap-2 rounded-lg border border-input px-4 focus-within:outline-3 focus-within:outline-offset-2">
            <ImagePlus aria-hidden className="size-5" />
            {t(value.imageKey ? "editor_image_replace" : "editor_image_choose")}
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              aria-describedby={`${id}-format ${id}-error`}
              aria-invalid={error === "editor_image_invalid_file"}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                updateInput({ error: null });
                upload.reset();
                if (
                  !file.size ||
                  file.size > maxImageBytes ||
                  !["image/png", "image/jpeg", "image/webp"].includes(file.type)
                ) {
                  updateInput({ error: "editor_image_invalid_file" });
                  event.currentTarget.value = "";
                  return;
                }
                updateInput({
                  candidate: { file, url: URL.createObjectURL(file) },
                  metadata: emptyMetadata,
                  staged: true,
                });
              }}
            />
          </label>
          <p id={`${id}-format`} className="text-sm text-muted-foreground">
            {t("editor_image_formats")}
          </p>
          {candidate && <p className="break-all text-sm">{candidate.file.name}</p>}
        </div>
      ) : (
        <label className="grid gap-2 text-sm">
          <span id={`${id}-key-label`}>{t("editor_image")}</span>
          <Input
            aria-labelledby={`${id}-key-label`}
            aria-invalid={error === "editor_image_invalid_key"}
            maxLength={300}
            value={imageKey}
            disabled={busy}
            aria-describedby={`${id}-key ${id}-error`}
            onChange={(event) => {
              updateInput({ imageKey: event.target.value, staged: true, error: null });
            }}
          />
          <span id={`${id}-key`} className="text-muted-foreground">
            {t("editor_image_key_hint")}
          </span>
        </label>
      )}
      {(candidate || mode === "existing") && (
        <>
          <ImageMetadataFields
            id={id}
            value={metadata}
            disabled={busy}
            invalid={error === "editor_image_source_required"}
            onChange={(nextMetadata) =>
              updateInput({ metadata: nextMetadata, staged: true, error: null })
            }
          />
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={busy}
            onClick={apply}
          >
            {t(
              upload.isError
                ? "common_retry"
                : mode === "file"
                  ? "editor_image_upload"
                  : "editor_image_apply",
            )}
          </Button>
        </>
      )}
      {staged && (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={busy}
          onClick={() => {
            updateInput(imageInput(value));
            upload.reset();
            if (fileInput.current) fileInput.current.value = "";
            fileInput.current?.focus();
          }}
        >
          {t("editor_image_reset")}
        </Button>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <ActionFeedback
        pending={upload.isPending}
        error={upload.error}
        success={upload.isSuccess}
        successMessage={t("editor_image_uploaded")}
      />
    </fieldset>
  );
}

function ImageMetadataFields({
  id,
  value,
  disabled,
  invalid,
  onChange,
}: {
  id: string;
  value: ImageMetadata;
  disabled: boolean;
  invalid: boolean;
  onChange: (value: ImageMetadata) => void;
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
