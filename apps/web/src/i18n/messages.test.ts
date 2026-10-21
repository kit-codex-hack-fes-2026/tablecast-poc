import { expect, it } from "vitest";
import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import { m } from "../paraglide/messages.js";
import { fixtureValue } from "../test-support/fixture-value";

// 現在の翻訳は単純文字列と{name}補間。構文の検証と生成はParaglideへ任せる。
const placeholders = (message: string) =>
  [
    ...new Set([...message.matchAll(/\{(\w+)\}/gu)].map((match) => fixtureValue(match[1]))),
  ].toSorted();

it("日英の翻訳キーと単純補間の入力名が揃い、空の文言がない", () => {
  const japanese: Record<string, string> = ja;
  const english: Record<string, string> = en;
  expect(Object.keys(japanese).toSorted()).toEqual(Object.keys(english).toSorted());
  expect(Object.entries(japanese).filter(([, message]) => !message.trim())).toEqual([]);
  expect(Object.entries(english).filter(([, message]) => !message.trim())).toEqual([]);
  for (const [key, message] of Object.entries(japanese)) {
    expect({ key, inputs: placeholders(message) }).toEqual({
      key,
      inputs: placeholders(fixtureValue(english[key])),
    });
  }
});

it("公開メッセージ関数は言語ごとに補間し、日本語へ戻しても英語を残さない", () => {
  const row = { kind: "商品", index: 2, name: "柚子ソーダ" };
  expect(m.editor_row_title(row, { locale: "ja" })).toBe("商品 2：柚子ソーダ");
  expect(m.editor_row_title(row, { locale: "en" })).toBe("商品 2: 柚子ソーダ");
  expect(m.editor_row_title(row, { locale: "ja" })).toBe("商品 2：柚子ソーダ");
  const players = { min: 2, max: 6, current: 3 };
  expect(m.games_players(players, { locale: "ja" })).toBe("2〜6人用 · 現在3人");
  expect(m.games_players(players, { locale: "en" })).toBe("2–6 players · 3 at your table");
  expect(m.games_players(players, { locale: "ja" })).toBe("2〜6人用 · 現在3人");
  expect(m.form_required({}, { locale: "ja" })).toBe(ja.form_required);
  expect(m.form_required({}, { locale: "en" })).toBe(en.form_required);
  expect(m.form_required({}, { locale: "ja" })).toBe(ja.form_required);
});
