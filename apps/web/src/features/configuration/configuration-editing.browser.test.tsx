import { resolveLocalized } from "@tablecast/api/localization";
import { instructionText } from "@tablecast/api/schema";
import { defaultCastInstructions } from "@tablecast/api/speech";
import { expect, it, vi } from "vitest";
import { cleanup } from "vitest-browser-react";
import ja from "../../../messages/ja.json";
import "../../styles.css";
import { draftOptions } from "./menu-query";
import {
  base,
  draftId,
  fixture,
  open,
  storeId,
} from "./test-support/configuration-workflow-fixture";

it("標準プロンプトを明示上書きして両層を保存し、解除すると既定へ戻る", async () => {
  const { screen } = await open(`${base}/changes/${draftId}/cast/settings#system-ja`);
  const original = structuredClone(fixture.current.configuration.cast.instructions);
  const source = screen.getByRole("textbox", { name: ja.cast_system_layer, exact: true });
  const toggle = screen.getByRole("checkbox", { name: ja.cast_system_override, exact: true });
  await expect.element(toggle).toHaveFocus();
  await expect.element(source).toHaveAttribute("readonly");
  await expect.element(source).toHaveValue(defaultCastInstructions.ja);
  await toggle.click();
  await source.fill("回答は2文まで、数字は算用数字で表記する。");
  await screen.getByRole("tab", { name: "English", exact: true }).click();
  await screen.getByRole("checkbox", { name: ja.cast_system_override, exact: true }).click();
  await screen
    .getByRole("textbox", { name: ja.cast_system_layer, exact: true })
    .fill("Answer in up to 2 sentences using Arabic digits.");
  await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.element(screen.getByText(ja.account_saved, { exact: true })).toBeVisible();
  expect(fixture.current.configuration.cast.systemInstructions).toEqual({
    ja: "回答は2文まで、数字は算用数字で表記する。",
    en: "Answer in up to 2 sentences using Arabic digits.",
  });
  expect(fixture.current.configuration.cast.instructions).toEqual(original);
  await screen.getByRole("checkbox", { name: ja.cast_system_override, exact: true }).click();
  await expect
    .element(screen.getByRole("textbox", { name: ja.cast_system_layer, exact: true }))
    .toHaveValue(defaultCastInstructions.en);
  await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.poll(() => fixture.current.configuration.cast.systemInstructions?.en).toBeNull();
  expect(fixture.current.configuration.cast.systemInstructions?.ja).toBe(
    "回答は2文まで、数字は算用数字で表記する。",
  );
});

it.each([503, 409])(
  "保存が%sで失敗しても入力を保持し、再試行で保存して変更確認へ進む",
  async (status) => {
    const product = fixture.current.configuration.products[0];
    if (!product) throw new Error("商品fixtureが必要です");
    const { screen, router } = await open(`${base}/changes/${draftId}/products/${product.id}`);
    const price = screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true });
    await price.fill("777");
    fixture.saveFailure = status;
    await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
    await expect.element(screen.getByRole("alert")).toBeVisible();
    await expect.element(price).toHaveValue(777);
    await expect
      .element(screen.getByRole("link", { name: ja.workflow_review, exact: true }))
      .toBeDisabled();
    fixture.saveFailure = 0;
    const pending = Promise.withResolvers<void>();
    fixture.waitForSave = pending.promise;
    await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
    await expect.element(price).toBeDisabled();
    await expect.element(screen.getByText(ja.workflow_saving, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(ja.form_submitting, { exact: true })).toBeVisible();
    pending.resolve();
    await expect.element(screen.getByText(ja.account_saved, { exact: true })).toBeVisible();
    await screen.getByRole("link", { name: ja.workflow_review, exact: true }).click();
    await expect.poll(() => router.state.location.pathname).toBe(`${base}/changes/${draftId}`);
  },
);

it.each([503, 409])(
  "接客文書は保存失敗%s後も両言語と書式を保ち、待機中は編集を止める",
  async (status) => {
    const { screen } = await open(`${base}/changes/${draftId}/cast/settings#instructions-ja`);
    const japanese = screen.getByRole("textbox", {
      name: `${ja.common_ja} ${ja.editor_cast_instructions}`,
      exact: true,
    });
    const english = screen.getByRole("textbox", {
      name: `${ja.common_en} ${ja.editor_cast_instructions}`,
      exact: true,
    });
    await expect.element(japanese).not.toBeDisabled();
    await japanese.fill("## 接客方針を保持");
    await screen.getByRole("tab", { name: "English", exact: true }).click();
    await english.fill("Keep English instructions");
    fixture.saveFailure = status;
    await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
    await expect.element(screen.getByRole("alert")).toBeVisible();
    await expect.element(english).toHaveValue("Keep English instructions");
    await screen.getByRole("tab", { name: "日本語", exact: true }).click();
    await expect.element(japanese).toHaveValue("## 接客方針を保持");
    fixture.saveFailure = 0;
    const pending = Promise.withResolvers<void>();
    fixture.waitForSave = pending.promise;
    await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
    await expect.element(japanese).toBeDisabled();
    expect(document.querySelector('textarea[lang="en"]')?.matches(":disabled")).toBe(true);
    await expect.element(screen.getByText(ja.form_submitting, { exact: true })).toBeVisible();
    pending.resolve();
    await expect.element(screen.getByText(ja.account_saved, { exact: true })).toBeVisible();
    expect(instructionText(fixture.current.configuration.cast.instructions.ja)).toBe(
      "## 接客方針を保持",
    );
    expect(
      instructionText(resolveLocalized(fixture.current.configuration.cast.instructions, "en")),
    ).toBe("Keep English instructions");
  },
);

it("日本語の商品編集で価格・売切・両言語の本文を保存し、再取得でも入力を復元する", async () => {
  const locale = "ja";
  const labels = ja;
  const product = fixture.current.configuration.products[0];
  if (!product) throw new Error("商品fixtureが必要です");
  const expected = structuredClone(product);
  expected.price = 777;
  expected.available = false;
  const path = `${base}/changes/${draftId}/products/${product.id}`;
  const { screen } = await open(path, locale);
  await screen.getByRole("spinbutton", { name: labels.admin_unit_price, exact: true }).fill("777");
  const leave = vi.spyOn(window, "confirm").mockReturnValue(false);
  await screen
    .getByRole("navigation", { name: labels.editor_product_identity, exact: true })
    .getByRole("link", { name: labels.editor_modifiers, exact: true })
    .click();
  expect(leave).not.toHaveBeenCalled();
  await expect
    .element(screen.getByRole("spinbutton", { name: labels.admin_unit_price, exact: true }))
    .toHaveValue(777);
  leave.mockRestore();

  await screen.getByRole("checkbox", { name: labels.admin_available, exact: true }).first().click();
  for (const contentLocale of ["ja", "en"] as const) {
    const language = contentLocale === "ja" ? labels.common_ja : labels.common_en;
    const content = screen.getByRole("region", {
      name: labels.editor_product_content,
      exact: true,
    });
    await content
      .getByRole("tab", { name: contentLocale === "ja" ? "日本語" : "English", exact: true })
      .click();
    await screen
      .getByRole("region", { name: labels.editor_product_basics, exact: true })
      .getByRole("tab", { name: contentLocale === "ja" ? "日本語" : "English", exact: true })
      .click();
    const group = content.getByRole("group", { name: language, exact: true });
    for (const field of [
      { key: "displayName", label: labels.admin_meaning_name },
      { key: "speechName", label: labels.admin_speech_name },
      { key: "description", label: labels.admin_description },
    ] as const) {
      resolveLocalized(expected.text, contentLocale)[field.key] =
        `${contentLocale} ${field.key} の保存内容`;
      const target =
        field.key === "displayName"
          ? screen.getByRole("region", { name: labels.editor_product_basics, exact: true })
          : group;
      await target
        .getByRole("textbox", { name: `${language} ${field.label}`, exact: true })
        .fill(resolveLocalized(expected.text, contentLocale)[field.key]);
    }
  }
  await screen.getByRole("button", { name: labels.common_save, exact: true }).click();
  await expect.element(screen.getByText(labels.account_saved, { exact: true })).toBeVisible();
  expect(fixture.current.configuration.products.find((item) => item.id === product.id)).toEqual(
    expected,
  );
  await cleanup();
  fixture.client.removeQueries({ queryKey: draftOptions(storeId, draftId).queryKey });
  const reopened = await open(path, locale);
  await expect
    .element(
      reopened.screen.getByRole("spinbutton", { name: labels.admin_unit_price, exact: true }),
    )
    .toHaveValue(777);
  await expect
    .element(
      reopened.screen.getByRole("checkbox", { name: labels.admin_available, exact: true }).first(),
    )
    .not.toBeChecked();
  for (const contentLocale of ["ja", "en"] as const) {
    const language = contentLocale === "ja" ? labels.common_ja : labels.common_en;
    await reopened.screen
      .getByRole("region", { name: labels.editor_product_content, exact: true })
      .getByRole("tab", { name: contentLocale === "ja" ? "日本語" : "English", exact: true })
      .click();
    await expect
      .element(
        reopened.screen.getByRole("textbox", {
          name: `${language} ${labels.admin_description}`,
          exact: true,
        }),
      )
      .toHaveValue(resolveLocalized(expected.text, contentLocale).description);
  }
});

it("日本語の接客概要から既存下書きの各入力へ移り、音声と本文を保存・再取得できる", async () => {
  const locale = "ja";
  const labels = ja;
  const { screen, router } = await open(`${base}/cast`, locale);
  await screen.getByRole("tab", { name: "English", exact: true }).click();
  await screen
    .getByRole("button", {
      name: labels.cast_edit_voice.replace("{language}", labels.common_en),
      exact: true,
    })
    .click();
  await screen
    .getByRole("dialog")
    .getByRole("button", { name: labels.workflow_resume, exact: true })
    .click();
  const editPath = `${base}/changes/${draftId}/cast/settings`;
  await expect.poll(() => router.state.location.pathname).toBe(editPath);
  await expect
    .element(
      screen.getByRole("combobox", {
        name: `${labels.common_en} ${labels.editor_voice}`,
        exact: true,
      }),
    )
    .toHaveFocus();
  expect(
    fixture.requests.filter(
      (request) => request.method === "POST" && request.url.endsWith("/drafts"),
    ),
  ).toHaveLength(0);
  for (const target of [
    {
      hash: "voice-ja",
      label: labels.cast_edit_voice.replace("{language}", labels.common_ja),
      role: "combobox",
      field: `${labels.common_ja} ${labels.editor_voice}`,
    },
    {
      hash: "proactive",
      label: labels.cast_edit_proactive,
      role: "checkbox",
      field: labels.editor_proactive,
    },
    {
      hash: "instructions-en",
      label: labels.cast_edit_instructions.replace("{language}", labels.common_en),
      role: "textbox",
      field: `${labels.common_en} ${labels.editor_cast_instructions}`,
    },
  ] as const) {
    await screen
      .getByRole("main")
      .getByRole("link", { name: labels.editor_cast, exact: true })
      .click();
    if (target.hash.endsWith("-en"))
      await screen.getByRole("tab", { name: "English", exact: true }).click();
    await screen.getByRole("link", { name: target.label, exact: true }).click();
    expect(router.state.location.hash).toBe(target.hash);
    await expect
      .element(screen.getByRole(target.role, { name: target.field, exact: true }))
      .toHaveFocus();
  }
  await screen.getByRole("tab", { name: "日本語", exact: true }).click();
  await screen
    .getByRole("combobox", { name: `${labels.common_ja} ${labels.editor_voice}`, exact: true })
    .selectOptions("marin");
  await screen.getByRole("tab", { name: "English", exact: true }).click();
  await screen
    .getByRole("combobox", { name: `${labels.common_en} ${labels.editor_voice}`, exact: true })
    .selectOptions("cedar");
  const instructions = screen.getByRole("textbox", {
    name: `${labels.common_en} ${labels.editor_cast_instructions}`,
    exact: true,
  });
  await instructions.fill("Keep these service instructions after saving.");
  await screen.getByRole("button", { name: labels.common_save, exact: true }).click();
  await expect.element(screen.getByText(labels.account_saved, { exact: true })).toBeVisible();
  expect(fixture.current.configuration.cast.voice).toEqual({ ja: "marin", en: "cedar" });
  expect(
    instructionText(resolveLocalized(fixture.current.configuration.cast.instructions, "en")),
  ).toBe("Keep these service instructions after saving.");
  await cleanup();
  fixture.client.removeQueries({ queryKey: draftOptions(storeId, draftId).queryKey });
  const reopened = await open(editPath, locale);
  await expect
    .element(
      reopened.screen.getByRole("combobox", {
        name: `${labels.common_ja} ${labels.editor_voice}`,
        exact: true,
      }),
    )
    .toHaveValue("marin");
  await reopened.screen.getByRole("tab", { name: "English", exact: true }).click();
  await expect
    .element(
      reopened.screen.getByRole("combobox", {
        name: `${labels.common_en} ${labels.editor_voice}`,
        exact: true,
      }),
    )
    .toHaveValue("cedar");
  await expect
    .element(
      reopened.screen.getByRole("textbox", {
        name: `${labels.common_en} ${labels.editor_cast_instructions}`,
        exact: true,
      }),
    )
    .toHaveValue("Keep these service instructions after saving.");
});

it("未保存入力を戻す確認では下書きを破棄せず、最後の保存値へ戻る", async () => {
  const product = fixture.current.configuration.products[0];
  if (!product) throw new Error("商品fixtureが必要です");
  const { screen } = await open(`${base}/changes/${draftId}/products/${product.id}`);
  const price = screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true });
  await price.fill("777");
  await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.element(screen.getByText(ja.account_saved, { exact: true })).toBeVisible();
  await price.fill("888");
  await screen.getByRole("button", { name: ja.workflow_revert, exact: true }).click();
  await screen
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.common_cancel, exact: true })
    .click();
  await expect.element(price).toHaveValue(888);
  await screen.getByRole("button", { name: ja.workflow_revert, exact: true }).click();
  await screen
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.workflow_revert, exact: true })
    .click();
  await expect.element(price).toHaveValue(777);
  expect(fixture.requests.filter((request) => request.url.endsWith("/discard"))).toHaveLength(0);
});

it("接客入力を戻しても初回移動用のhashへfocusを移し直さない", async () => {
  const initial = instructionText(fixture.current.configuration.cast.instructions.ja);
  const { screen } = await open(`${base}/changes/${draftId}/cast/settings#instructions-ja`);
  const instructions = screen.getByRole("textbox", {
    name: `${ja.common_ja} ${ja.editor_cast_instructions}`,
    exact: true,
  });
  await expect.element(instructions).toHaveFocus();
  await instructions.fill("入力を戻す操作の検証用接客方針");
  await screen.getByRole("button", { name: ja.workflow_revert, exact: true }).click();
  await screen
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.workflow_revert, exact: true })
    .click();
  await expect.element(screen.getByRole("alertdialog")).not.toBeInTheDocument();
  await expect.element(instructions).toHaveValue(initial);
  await expect.element(instructions).not.toHaveFocus();
});

it.each(["published", "discarded"] as const)(
  "%sの直接編集URLは閲覧のみになり、保存操作を出さない",
  async (status) => {
    fixture.current.status = status;
    const product = fixture.current.configuration.products[0];
    if (!product) throw new Error("商品fixtureが必要です");
    const { screen } = await open(`${base}/changes/${draftId}/products/${product.id}`);
    await expect
      .element(screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true }))
      .toBeDisabled();
    await expect
      .element(screen.getByRole("button", { name: ja.common_save, exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText(ja.workflow_terminal_note, { exact: true }))
      .toBeVisible();
  },
);

it("開始案内の編集先へfocusし、日英の案内を同じ下書きへ保存する", async () => {
  const { screen } = await open(`${base}/changes/${draftId}/cast/settings#opening-ja`);
  const japanese = screen.getByRole("textbox", {
    name: `${ja.common_ja} ${ja.editor_cast_opening}`,
    exact: true,
  });
  await expect.element(japanese).toHaveFocus();
  await japanese.fill("ようこそ。温かいお茶はいかがですか？");
  await screen.getByRole("tab", { name: "English", exact: true }).click();
  const english = screen.getByRole("textbox", {
    name: `${ja.common_en} ${ja.editor_cast_opening}`,
    exact: true,
  });
  await english.fill("Welcome. Would you like some tea?");
  await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.element(screen.getByText(ja.account_saved, { exact: true })).toBeVisible();
  expect(fixture.current.configuration.cast.openingInstructions).toEqual({
    ja: "ようこそ。温かいお茶はいかがですか？",
    en: "Welcome. Would you like some tea?",
  });
});

it("追加言語は商品名の意味訳と転写を揃えて保存し、不足中は保存を止める", async () => {
  const product = fixture.current.configuration.products[0];
  if (!product) throw new Error("商品fixtureが必要です。");
  const { screen } = await open(`${base}/changes/${draftId}/products/${product.id}`);
  await screen.getByRole("textbox", { name: ja.editor_language_code, exact: true }).fill("fr");
  await screen.getByRole("button", { name: ja.common_add, exact: true }).click();
  const basics = screen.getByRole("region", { name: ja.editor_product_basics, exact: true });
  await basics.getByRole("tab", { name: "français", exact: true }).click();
  await basics.getByRole("button", { name: ja.editor_add_translation, exact: true }).click();
  const meaning = basics.getByRole("textbox", { name: new RegExp(ja.admin_meaning_name) });
  const phonetic = basics.getByRole("textbox", { name: new RegExp(ja.admin_transliteration) });
  await meaning.fill("Thé vert grillé");
  await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.element(phonetic).toBeInvalid();
  expect(fixture.current.configuration.languages).not.toContain("fr");
  await phonetic.fill("Hōjicha");
  await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.element(screen.getByText(ja.account_saved, { exact: true })).toBeVisible();
  expect(fixture.current.configuration.languages).toContain("fr");
  expect(
    fixture.current.configuration.products.find((item) => item.id === product.id)?.text.fr,
  ).toMatchObject({ displayName: "Thé vert grillé", transliteration: "Hōjicha" });
});
