import { createFormHook } from "@tanstack/react-form";
import { fieldContext, formContext } from "../lib/form-context";
import { TextField } from "./form/text-field";
import { NumberField } from "./form/number-field";
import { SubmitButton } from "./form/submit-button";

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, NumberField },
  formComponents: { SubmitButton },
});
