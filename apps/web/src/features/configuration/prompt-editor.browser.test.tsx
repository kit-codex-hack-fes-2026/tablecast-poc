import { type CastInstruction, instructionText } from "@tablecast/api/schema";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { InstructionView } from "./instruction-view";
import { LanguageFields } from "./language-fields";
import PromptEditorInput from "./prompt-editor-input";

afterEach(cleanup);
const changed = vi.fn<(value: CastInstruction) => void>();
function Harness({
  initial = "",
  disabledInitially = false,
}: {
  disabledInitially?: boolean;
  initial?: CastInstruction;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [disabled, setDisabled] = useState(disabledInitially);
  return (
    <LocaleProvider initialLocale="ja" persist={false}>
      <span id="tablecast-instruction-label">日本語 接客方針</span>
      <PromptEditorInput
        id="tablecast-instruction"
        labelledBy="tablecast-instruction-label"
        language="ja"
        value={value}
        disabled={disabled}
        onChange={(next) => {
          changed(next);
          setValue(next);
        }}
      />
      <button type="button" onClick={() => setSaved(value)}>
        保存を再現
      </button>
      <button type="button" onClick={() => setValue(saved)}>
        再読込を再現
      </button>
      <button type="button" onClick={() => setDisabled((previous) => !previous)}>
        編集可否を切替
      </button>
      <output aria-label="保存本文">{instructionText(saved)}</output>
      <div aria-label="保存したプレビュー">
        <InstructionView value={saved} />
      </div>
    </LocaleProvider>
  );
}

const legacy: CastInstruction = {
  format: "tiptap-json",
  version: 1,
  document: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "接客方針" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "丁寧に", marks: [{ type: "bold" }] },
          { type: "hardBreak" },
          { type: "text", text: "* は記号" },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 3 },
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "おすすめ" }] }],
          },
        ],
      },
    ],
  },
};

it("旧構造化本文は読込とプレビューで変更せず、編集後だけMarkdownとして保存する", async () => {
  changed.mockClear();
  await render(<Harness initial={legacy} />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  await expect.element(input).toHaveValue(instructionText(legacy));
  await page.getByRole("tab", { name: ja.prompt_preview }).click();
  expect(changed).not.toHaveBeenCalled();
  await expect.element(page.getByRole("heading", { name: "接客方針" }).first()).toBeVisible();
  await page.getByRole("tab", { name: ja.prompt_source }).click();
  await input.fill(`${instructionText(legacy)}\n\n## 追加\n- おすすめを一品`);
  await page.getByRole("button", { name: "保存を再現" }).click();
  expect(changed.mock.lastCall?.[0]).toBe(
    `${instructionText(legacy)}\n\n## 追加\n- おすすめを一品`,
  );
  await input.fill("未保存の編集");
  await page.getByRole("button", { name: "再読込を再現" }).click();
  await expect
    .element(input)
    .toHaveValue(`${instructionText(legacy)}\n\n## 追加\n- おすすめを一品`);
});

it("Markdownの記号と空行を保持し、プレビューの画像・HTMLを実行しない", async () => {
  const markdown =
    "# 方針\n\n**丁寧**に案内します。\n\n![画像](https://example.invalid/photo.png)\n\n<script>alert(1)</script>\n";
  await render(<Harness initial={markdown} />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  await expect.element(input).toHaveValue(markdown);
  await page.getByRole("tab", { name: ja.prompt_preview }).click();
  await expect.element(page.getByRole("heading", { name: "方針" }).first()).toBeVisible();
  expect(document.querySelector('img[src="https://example.invalid/photo.png"]')).toBeNull();
  expect(document.querySelector("script:not([src])")?.textContent).not.toBe("alert(1)");
  await page.getByRole("tab", { name: ja.prompt_source }).click();
  await expect.element(input).toHaveValue(markdown);
});

it("上限超過を切り捨てず、保存待機中は入力を止める", async () => {
  await render(<Harness />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  const text = "あ".repeat(5001);
  await input.fill(text);
  await expect.element(page.getByRole("alert")).toMatchTextContent(ja.prompt_limit);
  await expect.element(input).toHaveValue(text);
  await expect.element(input).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "編集可否を切替" }).click();
  await expect.element(input).toBeDisabled();
  await expect.element(input).toHaveValue(text);
});

it("プレビューを挟んでも本文とネイティブUndoの履歴を保つ", async () => {
  await render(<Harness initial="既存本文" />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  await input.click();
  await userEvent.keyboard("{Control>}{End}{/Control}追");
  await expect.element(input).toHaveValue("既存本文追");
  await page.getByRole("tab", { name: ja.prompt_preview }).click();
  await page.getByRole("tab", { name: ja.prompt_source }).click();
  await input.click();
  await userEvent.keyboard(
    navigator.platform.includes("Mac") ? "{Meta>}z{/Meta}" : "{Control>}z{/Control}",
  );
  await expect.element(input).toHaveValue("既存本文");
});

it("長い本文は入力欄が伸び、利用者も縦にリサイズできる", async () => {
  await render(<Harness initial="短い本文" />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  const before = input.element().getBoundingClientRect().height;
  await input.fill(Array.from({ length: 40 }, (_, index) => `行 ${index + 1}`).join("\n"));
  expect(getComputedStyle(input.element()).resize).toBe("vertical");
  await expect.poll(() => input.element().getBoundingClientRect().height).toBeGreaterThan(before);
});

it("非表示言語の必須項目にエラーがあればその言語を開き入力へ移る", async () => {
  await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <form onSubmit={(event) => event.preventDefault()}>
        <LanguageFields>
          {(language, labelId) => (
            <input
              required
              aria-labelledby={labelId}
              defaultValue={language === "ja" ? "保持する名前" : ""}
            />
          )}
        </LanguageFields>
        <button type="submit">保存</button>
      </form>
    </LocaleProvider>,
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .element(page.getByRole("tab", { name: "English" }))
    .toHaveAttribute("aria-selected", "true");
  await expect.element(page.getByRole("textbox", { name: "英語", exact: true })).toHaveFocus();
  await page.getByRole("tab", { name: "日本語", exact: true }).click();
  await expect
    .element(page.getByRole("textbox", { name: "日本語", exact: true }))
    .toHaveValue("保持する名前");
});
