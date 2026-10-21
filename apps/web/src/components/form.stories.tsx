import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { useState } from "react";
import { z } from "zod";
import { useI18n } from "../i18n/locale";
import { ActionFeedback } from "./action-feedback";
import { useAppForm } from "./form";
import { TextField } from "./form/text-field";
import { NumberField } from "./form/number-field";
import { SubmitButton } from "./form/submit-button";
import { FormErrors } from "./form/errors";

/**
 * useAppFormがTanStack FormとBase UI Fieldを組み合わせる。
 * defaultValues・validators・onSubmitを渡し、AppField内のTextField/NumberField、AppForm内のSubmitButton/FormErrorsを使う。
 * TextFieldはlabel、description、required、type、autoComplete等、NumberFieldはlabel、min、max、step等を受け取る。
 * 入力とエラーの関連は共通部品が担当し、API権限・金額・版競合はfeatureが担当する。
 * 保存失敗時にフォームを作り直さない。
 * 以下のSourceが実行可能な組合せ例。
 */
function FormExample({
  submit,
}: {
  submit: (value: { email: string; count: number }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<unknown>();
  const [saved, setSaved] = useState(false);
  const form = useAppForm({
    defaultValues: { email: "", count: 2 },
    onSubmit: async ({ value }) => {
      setError(undefined);
      setSaved(false);
      try {
        await submit(value);
        setSaved(true);
      } catch (failure) {
        setError(failure);
      }
    },
  });
  return (
    <main className="max-w-lg space-y-5 p-6">
      <h1 className="text-xl font-semibold">{t("org_invite")}</h1>
      <form
        noValidate
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.AppField name="email" validators={{ onChange: z.email({ error: t("form_email") }) }}>
          {(field) => (
            <field.TextField label={t("auth_email")} type="email" required autoComplete="email" />
          )}
        </form.AppField>
        <form.AppField
          name="count"
          validators={{
            onChange: z
              .number({ error: t("form_number") })
              .int()
              .min(1)
              .max(30),
          }}
        >
          {(field) => (
            <field.NumberField label={t("admin_guest_count")} min={1} max={30} required />
          )}
        </form.AppField>
        <form.AppForm>
          <form.SubmitButton>{t("account_save")}</form.SubmitButton>
        </form.AppForm>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(pending) => (
            <ActionFeedback
              pending={pending}
              error={error}
              success={saved}
              successMessage={t("account_saved")}
            />
          )}
        </form.Subscribe>
      </form>
    </main>
  );
}

const submit = fn<(value: { email: string; count: number }) => Promise<void>>();
const meta = {
  tags: ["autodocs"],

  title: "デザインシステム/フォーム",
  component: FormExample,
  subcomponents: { TextField, NumberField, SubmitButton, FormErrors },
  args: { submit },
} satisfies Meta<typeof FormExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const 項目エラーと失敗後の再送: Story = {
  play: async ({ canvasElement }) => {
    // Given: 応答を保留する送信先と未入力のフォーム。
    submit.mockReset();
    const response = Promise.withResolvers<void>();
    submit.mockReturnValueOnce(response.promise).mockResolvedValue(undefined);
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "保存" });
    const email = canvas.getByRole("textbox", { name: "メールアドレス" });
    // When: 未入力で送信し、修正して再送する。
    await userEvent.click(button);
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription("有効なメールアドレスを入力してください。");
    await expect(submit).not.toHaveBeenCalled();
    await userEvent.type(email, "staff@example.test");
    await userEvent.click(button);
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
    response.reject(new TypeError("ネットワーク接続が失敗した"));
    // Then: 入力を保持し、失敗を表示して再送できる。
    await waitFor(() => expect(canvas.getByRole("alert")).toBeVisible());
    await expect(email).toHaveValue("staff@example.test");
    await expect(button).toBeEnabled();
    await userEvent.click(button);
    await expect(submit).toHaveBeenCalledTimes(2);
    await expect(submit).toHaveBeenLastCalledWith({ email: "staff@example.test", count: 2 });
    await waitFor(() => expect(canvas.getByText("更新しました")).toBeVisible());
    // axeは成功表示の入場が完了した状態で文字のコントラストを検査する。
    await waitFor(() =>
      expect(canvas.getByText("更新しました").parentElement).toHaveStyle({ opacity: "1" }),
    );
  },
};
export const 英語: Story = {
  tags: ["!test"],
  globals: { locale: "en" },
  args: { submit: fn().mockResolvedValue(undefined) },
};
