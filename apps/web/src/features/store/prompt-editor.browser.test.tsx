import { instructionText, type CastInstruction } from "@tablecast/api/schema";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import PromptEditorInput from "./prompt-editor-input";
import { InstructionView } from "./instruction-view";
import "../../styles.css";

afterEach(cleanup);
const changed = vi.fn<(value: CastInstruction) => void>();
function Harness({
  initial = "",
  disabledInitially = false,
}: {
  initial?: CastInstruction;
  disabledInitially?: boolean;
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
      <InstructionView value={saved} />
    </LocaleProvider>
  );
}

it("旧本文を開くだけでdirtyにせず、書式変更と保存・再読込を保つ", async () => {
  changed.mockClear();
  await render(<Harness initial="# 記号\n\n末尾\n" />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  await expect.element(input).toBeVisible();
  expect(changed).not.toHaveBeenCalled();
  await input.fill("接客方針");
  await page.getByRole("combobox", { name: ja.prompt_block }).selectOptions("heading-2");
  await page.getByRole("button", { name: "保存を再現" }).click();
  await expect
    .element(page.getByRole("status", { name: "保存本文" }))
    .toHaveTextContent("## 接客方針");
  await input.fill("未保存の編集");
  await page.getByRole("button", { name: "再読込を再現" }).click();
  await expect.element(input).toHaveTextContent("接客方針");
  await expect
    .element(page.getByRole("button", { name: ja.prompt_undo, exact: true }))
    .toBeDisabled();
});

it("スラッシュ検索をキーボードで確定し、Escは入力を消さない", async () => {
  await render(<Harness />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  await input.click();
  await userEvent.keyboard("/heading");
  await expect.element(page.getByRole("listbox")).toBeVisible();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("combobox", { name: ja.prompt_block }))
    .toHaveValue("heading-2");
  await page.getByRole("combobox", { name: ja.prompt_block }).selectOptions("paragraph");
  await input.fill("");
  await userEvent.keyboard("/nothingmatches");
  await expect.element(page.getByText(ja.prompt_no_commands)).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(input).toHaveTextContent("/nothingmatches");
});

it("IME確定中のEnterをスラッシュ候補が消費しない", async () => {
  await render(<Harness />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  await input.click();
  await userEvent.keyboard("/heading");
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    isComposing: true,
    bubbles: true,
    cancelable: true,
  });
  input.element().dispatchEvent(event);
  await expect.element(input).toHaveTextContent("/heading");
  await expect.element(page.getByRole("listbox")).toBeVisible();
});

it("画像付きHTMLから文章と強調だけを取り込み、除外を知らせる", async () => {
  await render(<Harness />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  await input.click();
  const data = new DataTransfer();
  data.setData(
    "text/html",
    '<p>前<strong>丁寧</strong><img src="https://example.invalid/image.png"><iframe src="https://example.invalid/embed"></iframe>後</p>',
  );
  input
    .element()
    .dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  await expect.element(input).toHaveTextContent("前丁寧後");
  expect(input.element().querySelectorAll("img,iframe")).toHaveLength(0);
  await expect.element(page.getByText(ja.prompt_omitted)).toBeVisible();
  await page.getByRole("button", { name: "保存を再現" }).click();
  await expect
    .element(page.getByRole("status", { name: "保存本文" }))
    .toHaveTextContent("前**丁寧**後");
});

it("ファイルdropとdisabled中の貼付けで本文を書き換えない", async () => {
  await render(<Harness initial="保持する本文" />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  await input.click();
  const data = new DataTransfer();
  data.items.add(new File(["image"], "tablecast-photo.png", { type: "image/png" }));
  input
    .element()
    .dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  await expect.element(input).toHaveTextContent("保持する本文");
  await expect.element(page.getByText(ja.prompt_omitted)).toBeVisible();
  await page.getByRole("button", { name: "編集可否を切替" }).click();
  await expect.element(input).toHaveAttribute("contenteditable", "false");
  const clipboard = new DataTransfer();
  clipboard.setData("text/html", "<p>上書き</p>");
  input
    .element()
    .dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }),
    );
  await expect.element(input).toHaveTextContent("保持する本文");
  await expect.element(page.getByRole("button", { name: ja.prompt_bold })).toBeDisabled();
});

it("上限超過を切り捨てず入力を保持する", async () => {
  await render(<Harness />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  const text = "あ".repeat(5001);
  await input.fill(text);
  await expect.element(page.getByRole("alert")).toHaveTextContent(ja.prompt_limit);
  expect(input.element().textContent).toBe(text);
  await expect.element(input).toHaveAttribute("aria-invalid", "true");
});

it("通常入力のUndoで旧文字列へ戻り、Redoと強調中の改行も保持する", async () => {
  const initial = "# 記号\n\n最後\n";
  await render(<Harness initial={initial} />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  await input.click();
  await userEvent.keyboard("{Control>}{End}{/Control}追記");
  await page.getByRole("button", { name: ja.prompt_undo, exact: true }).click();
  expect(changed).toHaveBeenLastCalledWith(initial);
  await page.getByRole("button", { name: ja.prompt_redo, exact: true }).click();
  await expect.element(input).toHaveTextContent("追記");
  await page.getByRole("button", { name: ja.prompt_bold, exact: true }).click();
  await userEvent.keyboard("太字{Shift>}{Enter}{/Shift}続き");
  await page.getByRole("button", { name: "保存を再現" }).click();
  await expect.element(page.getByRole("status", { name: "保存本文" })).toHaveTextContent("太字");
  await expect.element(page.getByRole("status", { name: "保存本文" })).toHaveTextContent("続き");
});

it("画像のみのHTML貼付けは選択中の既存本文を消さない", async () => {
  await render(<Harness initial="保持する本文" />);
  const input = page.getByRole("textbox", { name: "日本語 接客方針" });
  await input.click();
  await userEvent.keyboard("{Control>}a{/Control}");
  const data = new DataTransfer();
  data.setData("text/html", '<p><img src="https://example.invalid/image.png"></p>');
  input
    .element()
    .dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  await expect.element(input).toHaveTextContent("保持する本文");
  await expect.element(page.getByText(ja.prompt_omitted)).toBeVisible();
});
