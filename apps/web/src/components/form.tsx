import { createFormHook } from "@tanstack/react-form";
import { fieldContext, formContext } from "../lib/form-context";
import { DateField } from "./form/date-field";
import { TextField } from "./form/text-field";
import { NumberField } from "./form/number-field";
import { SubmitButton } from "./form/submit-button";
import { FormErrors } from "./form/errors";

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, NumberField, DateField },
  formComponents: { SubmitButton, FormErrors },
});
