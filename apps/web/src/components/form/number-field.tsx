import { useEffect, useRef } from "react";
import { useI18n } from "../../i18n/locale";
import { Field } from "@base-ui/react/field";
import { useFieldContext } from "../../lib/form-context";
import { Input } from "../ui/input";
import { FieldErrors } from "../ui/field-errors";
import type { FieldProps } from "./field-props";
export function NumberField({ label, description, ...props }: FieldProps) {
  const field = useFieldContext<number>();
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
        type="number"
        value={Number.isNaN(field.state.value) ? "" : field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.valueAsNumber)}
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
