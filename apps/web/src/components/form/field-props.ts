import type { ComponentProps } from "react";
import type { Input } from "../ui/input";
export type FieldProps = Omit<ComponentProps<typeof Input>, "name" | "onChange" | "value"> & {
  description?: string;
  label: string;
};
