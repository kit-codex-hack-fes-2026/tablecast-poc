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

type ImageValue = Pick<Product, "imageKey" | "imageKind" | "imageSource">;

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
  disabled,
}: {
  storeId: string;
  value: ImageValue;
  onChange: (value: ImageValue) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const [mode, setMode] = useState("file");
  const [candidate, setCandidate] = useState<{ file: File; url: string } | null>(null);
  const [imageKey, setImageKey] = useState(value.imageKey ?? "");
  const [metadata, setMetadata] = useState({
    imageKind: value.imageKind,
    imageSource: value.imageSource ?? { generated: false, description: "" },
  });
  const [error, setError] = useState<
    "editor_image_invalid_file" | "editor_image_invalid_key" | "editor_image_source_required" | null
  >(null);
  const mounted = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (candidate) URL.revokeObjectURL(candidate.url);
    },
    [candidate],
  );
  const upload = useMutation({
    mutationFn: ({ file, metadata: input }: { file: File; metadata: typeof metadata }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].images.$post({
          param: { storeId },
          form: { image: file, metadata: JSON.stringify(input) },
        }),
      ),
    onSuccess: (result) => {
      if (!mounted.current) return;
      onChange({
        imageKey: result.imageKey,
        imageKind: result.imageKind,
        imageSource: result.imageSource,
      });
      setImageKey(result.imageKey);
      setCandidate(null);
      if (fileInput.current) fileInput.current.value = "";
    },
  });
  useEffect(() => {
    if (upload.isSuccess && document.activeElement === document.body) fileInput.current?.focus();
  }, [upload.isSuccess]);
  const busy = disabled || upload.isPending;
  function apply() {
    setError(null);
    if (mode === "file") {
      if (!candidate) return;
      const parsed = imageMetadataSchema.safeParse(metadata);
      if (!parsed.success) {
        setError("editor_image_source_required");
        return;
      }
      upload.mutate({ file: candidate.file, metadata: parsed.data });
    } else {
      const parsed = productSchema.shape.imageKey.safeParse(imageKey.trim());
      if (!parsed.success) {
        setError("editor_image_invalid_key");
        return;
      }
      const source = imageMetadataSchema.safeParse(metadata);
      if (!source.success && parsed.data?.startsWith("tablecast/uploads/")) {
        setError("editor_image_source_required");
        return;
      }
      onChange({
        imageKey: parsed.data,
        imageKind: metadata.imageKind,
        imageSource: source.success ? source.data.imageSource : undefined,
      });
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
              setImageKey("");
              setCandidate(null);
              setError(null);
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
            setError(null);
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
                setError(null);
                upload.reset();
                if (
                  !file.size ||
                  file.size > maxImageBytes ||
                  !["image/png", "image/jpeg", "image/webp"].includes(file.type)
                ) {
                  setError("editor_image_invalid_file");
                  event.currentTarget.value = "";
                  return;
                }
                setCandidate({ file, url: URL.createObjectURL(file) });
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
              setImageKey(event.target.value);
              setError(null);
            }}
          />
          <span id={`${id}-key`} className="text-muted-foreground">
            {t("editor_image_key_hint")}
          </span>
        </label>
      )}
      {(candidate || mode === "existing") && (
        <>
          <label className="grid gap-2 text-sm">
            {t("editor_image_kind")}
            <NativeSelect
              value={metadata.imageKind}
              disabled={busy || metadata.imageSource.generated}
              onChange={(event) =>
                setMetadata({
                  ...metadata,
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
            disabled={busy}
            value={metadata.imageSource.generated}
            onChange={(generated) =>
              setMetadata({
                imageKind: generated ? "illustration" : metadata.imageKind,
                imageSource: { ...metadata.imageSource, generated },
              })
            }
          />
          <label className="grid gap-2 text-sm">
            <span id={`${id}-source-label`}>{t("editor_image_source")}</span>
            <Input
              aria-labelledby={`${id}-source-label`}
              aria-invalid={error === "editor_image_source_required"}
              maxLength={500}
              value={metadata.imageSource.description}
              disabled={busy}
              aria-describedby={`${id}-source ${id}-error`}
              onChange={(event) => {
                setMetadata({
                  ...metadata,
                  imageSource: { ...metadata.imageSource, description: event.target.value },
                });
                setError(null);
              }}
            />
            <span id={`${id}-source`} className="text-muted-foreground">
              {t("editor_image_source_hint")}
            </span>
          </label>
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
