import { createStoreSchema } from "@tablecast/api/schema";
import { expect, it } from "vitest";
import { zodFieldValidator } from "./form-validation";

it("同じschemaの日英検証は言語を共有せず、形式の説明だけを上書きする", () => {
  // Given: SSRでも共有されるAPI schemaと日英の検証関数。
  const japanese = zodFieldValidator(createStoreSchema.shape.tableCount, "ja");
  const english = zodFieldValidator(createStoreSchema.shape.tableCount, "en");
  // When / Then: 交互に実行しても呼び出し元の言語と上限を保つ。
  expect(japanese({ value: 101 })?.[0]?.message).toContain("100以下");
  expect(english({ value: 101 })?.[0]?.message).toContain("<=100");
  expect(japanese({ value: 101 })?.[0]?.message).toContain("100以下");
  // When / Then: 正規表現の代わりに利用者が修正できる形式を案内する。
  const slug = zodFieldValidator(
    createStoreSchema.shape.slug,
    "ja",
    "半角英小文字・数字・ハイフンで入力してください。",
  );
  expect(slug({ value: "INVALID SLUG" })?.[0]?.message).toBe(
    "半角英小文字・数字・ハイフンで入力してください。",
  );
  expect(slug({ value: "tablecast-store" })).toBeUndefined();
});
