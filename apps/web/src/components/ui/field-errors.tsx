import { Field } from "@base-ui/react/field";

/**
 * Field.Root内で入力とエラーを関連付ける。
 * errorsは文字列またはmessageを持つオブジェクトの配列。
 * 表示文を重複除去する。
 * API全体の失敗にはErrorNotice、フォーム全体にはFormErrorsを使う。
 * エラーだけを赤色で示さず、原因と修正方法を文章にする。
 */
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
    <Field.Error
      key={message}
      match
      className="text-sm text-destructive motion-safe:animate-tablecast-state"
      role="alert"
    >
      {message}
    </Field.Error>
  ));
}
