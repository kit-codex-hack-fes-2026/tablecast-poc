import type { ComponentProps } from "react";
import type { Input } from "../ui/input";
export type FieldProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "name"> & {
  label: string;
  description?: string;
};
