import { createFormHook } from "@tanstack/react-form";
import { fieldContext, formContext } from "../lib/form-context";
import {
  DateField,
  FormErrors,
  FormRoot,
  NumberField,
  SubmitButton,
  TextField,
} from "./form/fields";

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, NumberField, DateField },
  formComponents: { Form: FormRoot, SubmitButton, FormErrors },
});
