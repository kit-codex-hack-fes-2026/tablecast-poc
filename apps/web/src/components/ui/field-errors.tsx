import { Field } from "@base-ui/react/field";

export function FieldErrors({ errors }: { errors: unknown[] }) {
  const messages = errors.flatMap((error) => {
    const message =
      typeof error === "string"
        ? error
        : typeof error === "object" &&
            error !== null &&
            "message" in error &&
            typeof error.message === "string"
          ? error.message
          : null;
    return message ? [message] : [];
  });
  return [...new Set(messages)].map((message) => (
    <Field.Error key={message} match className="text-sm text-destructive" role="alert">
      {message}
    </Field.Error>
  ));
}
