import { Field } from "@base-ui/react/field";
import { useFieldContext } from "../../lib/form-context";
import { DatePicker, type DatePickerProps } from "../date-picker";
import { DateTimePicker } from "../date-time-picker";
import { FieldErrors } from "../ui/field-errors";

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
