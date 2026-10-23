import { Field } from "@base-ui/react/field";
import { type AnyFieldLikeMeta } from "@tanstack/react-form";
import { type ComponentProps, type ReactNode, useEffect, useMemo, useRef } from "react";
import { useI18n } from "../../i18n/locale";
import { useFieldContext, useFormContext } from "../../lib/form-context";
import { activeServerFieldErrors, serverFieldErrors } from "../../lib/server-field-errors";
import { DatePicker, type DatePickerProps } from "../date-picker";
import { DateTimePicker } from "../date-time-picker";
import { ErrorNotice } from "../error-notice";
import { Button } from "../ui/button";
import { FieldErrors } from "../ui/field-errors";
import { Input } from "../ui/input";

export function TextField({
  numeric = false,
  label,
  description,
  ...props
}: FieldProps & { numeric?: boolean }) {
  const field = useFieldContext<number | string>();
  const { locale } = useI18n();
  const previousLocale = useRef(locale);
  useEffect(() => {
    if (
      previousLocale.current !== locale &&
      field.state.meta.isTouched &&
      !field.state.meta.errorMap.onServer
    )
      void field.validate("change");
    previousLocale.current = locale;
  }, [field, locale]);
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid;
  return (
    <Field.Root name={field.name} invalid={invalid} className="flex flex-col gap-2">
      <Field.Label className="text-base font-medium">{label}</Field.Label>
      <Input
        {...props}
        type={numeric ? "number" : props.type}
        value={numeric && Number.isNaN(field.state.value) ? "" : field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) =>
          field.handleChange(numeric ? event.target.valueAsNumber : event.target.value)
        }
      />
      {description && (
        <Field.Description className="text-sm text-muted-foreground">
          {description}
        </Field.Description>
      )}
      {invalid && <FieldErrors errors={field.state.meta.errors} />}
    </Field.Root>
  );
}

export function NumberField(props: FieldProps) {
  return <TextField {...props} numeric />;
}

/** DatePickerのISO値をTanStack Formへ渡し、既存のblur・エラー表示を共有する。 */
export function DateField({
  label,
  description,
  includeTime = false,
  ...props
}: Omit<DatePickerProps, "name" | "onValueChange" | "value"> & {
  description?: string;
  includeTime?: boolean;
}) {
  const field = useFieldContext<string>();
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid;
  const Picker = includeTime ? DateTimePicker : DatePicker;
  return (
    <Field.Root name={field.name} invalid={invalid} className="flex min-w-0 flex-col gap-2">
      <Field.Label className="text-base font-medium">{label}</Field.Label>
      <Picker
        {...props}
        label={label}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onValueChange={field.handleChange}
      />
      {description && (
        <Field.Description className="text-sm text-muted-foreground">
          {description}
        </Field.Description>
      )}
      {invalid && <FieldErrors errors={field.state.meta.errors} />}
    </Field.Root>
  );
}
const unchangedNames: Record<string, string> = {};

export function FormErrors({
  error,
  fieldNames = unchangedNames,
}: {
  error: unknown;
  fieldNames?: Record<string, string>;
}) {
  const form = useFormContext();
  const { locale } = useI18n();
  const fields = useMemo(
    () => serverFieldErrors(error, locale, fieldNames),
    [error, locale, fieldNames],
  );
  const previousError = useRef<unknown>(undefined);
  useEffect(() => {
    const metadata: Record<string, AnyFieldLikeMeta | undefined> = form.state.fieldMeta;
    const activeFields = activeServerFieldErrors(fields, metadata, previousError.current === error);
    previousError.current = error;
    form.setErrorMap({ onServer: { fields: activeFields } });
  }, [form, fields, error]);
  const attached =
    Object.keys(fields).length > 0 &&
    Object.keys(fields).every((path) => Object.hasOwn(form.state.fieldMeta, path));
  return attached ? null : <ErrorNotice error={error} />;
}
export function SubmitButton({
  children,
  ...props
}: ComponentProps<typeof Button> & { children: ReactNode }) {
  const form = useFormContext();
  const { t } = useI18n();
  return (
    <form.Subscribe
      selector={(state) => ({ pending: state.isSubmitting, dirty: !state.isDefaultValue })}
    >
      {({ pending, dirty }) => (
        <Button
          {...props}
          type="submit"
          data-pwa-blocked={pending || dirty}
          disabled={pending || props.disabled}
          aria-busy={pending}
          aria-description={pending ? t("form_submitting") : undefined}
        >
          {children}
        </Button>
      )}
    </form.Subscribe>
  );
}
type FieldProps = Omit<ComponentProps<typeof Input>, "name" | "onChange" | "value"> & {
  description?: string;
  label: string;
};
export function FormRoot({
  stopPropagation = false,
  ...props
}: Omit<ComponentProps<"form">, "onSubmit"> & { stopPropagation?: boolean }) {
  const form = useFormContext();
  return (
    <form
      {...props}
      onSubmit={(event) => {
        event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        void form.handleSubmit();
      }}
    />
  );
}
