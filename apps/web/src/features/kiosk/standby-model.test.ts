import { describe, expect, it } from "vitest";
import {
  type StandbyObservation,
  WakeDecision,
  wakeLanguage,
  wakeLocale,
  wakePhrases,
} from "./standby-model";
const observation = (
  at: number,
  overrides: Partial<StandbyObservation> = {},
): StandbyObservation => ({
  at,
  person: 1,
  attention: 1,
  score: 1,
  raised: false,
  crossed: false,
  mouth: 0,
  ...overrides,
});
describe("端末内の呼出語", () => {
  it.each(Object.entries(wakePhrases))("%sの定型句だけを認める", (locale, phrases) => {
    for (const phrase of phrases)
      expect(wakeLanguage(` ${phrase}！ `)).toBe(
        locale === "zh-Hant" && phrase === "不好意思" ? "zh-Hans" : locale,
      );
  });
  it.each(["すみません、お茶をください", "excuse me can we order", "", "こんにちは", "thank you"])(
    "通常会話を呼出語としない: %s",
    (text) => expect(wakeLanguage(text)).toBeUndefined(),
  );
});
describe("自卓候補の継続判定", () => {
  it.each([
    ["hand_raise", 800, { raised: true }],
    ["bill_check", 1000, { crossed: true, raised: true }],
    ["gaze", 3000, {}],
  ] as const)("%sの継続時間を満たすまで接続しない", (activation, dwell, overrides) => {
    const decision = new WakeDecision();
    for (let at = 0; at < dwell; at += 100)
      expect(decision.observe(observation(at, overrides), at)).toBeUndefined();
    expect(decision.observe(observation(dwell, overrides), dwell)).toBe(activation);
  });
  it.each(["遠方", "遮蔽", "別人", "古い結果", "逆順", "追跡切れ"])(
    "%sで蓄積を破棄する",
    (reason) => {
      const decision = new WakeDecision();
      for (let at = 0; at <= 700; at += 100)
        decision.observe(observation(at, { raised: true }), at);
      if (reason === "遠方") decision.observe(observation(800, { score: 0.79 }), 800);
      if (reason === "遮蔽") decision.observe(undefined, 800);
      if (reason === "別人") decision.observe(observation(800, { person: 2, raised: true }), 800);
      if (reason === "古い結果") decision.observe(observation(0, { raised: true }), 800);
      if (reason === "逆順") decision.observe(observation(600, { raised: true }), 800);
      if (reason === "追跡切れ") decision.observe(observation(1600, { raised: true }), 1600);
      expect(decision.observe(observation(1700, { raised: true }), 1700)).toBeUndefined();
    },
  );
  it("口の動きが一致しない発話、別人への切替、推論中の追跡切れを拒否する", () => {
    const decision = new WakeDecision();
    decision.observe(observation(0), 0);
    decision.beginSpeech(0);
    for (let at = 100; at <= 400; at += 100) decision.observe(observation(at), at);
    expect(decision.endSpeech(450)).toBeUndefined();
    decision.beginSpeech(450);
    for (let at = 500; at <= 800; at += 100)
      decision.observe(observation(at, { mouth: at % 200 ? 0.1 : 0 }), at);
    expect(decision.endSpeech(850)).toBe(1);
    expect(decision.currentPerson(2000)).toBeUndefined();
    decision.observe(observation(2100), 2100);
    decision.beginSpeech(2100);
    decision.observe(observation(2200, { person: 2, mouth: 0.2 }), 2200);
    expect(decision.endSpeech(2300)).toBeUndefined();
  });
});

it("登録済みの地域言語に合わせ、未登録言語は勝手に追加しない", () => {
  expect(wakeLocale("fr", "ja", ["ja", "fr-FR"])).toBe("fr-FR");
  expect(wakeLocale("zh-Hans", "zh-Hant", ["zh-Hant"])).toBe("zh-Hant");
  expect(wakeLocale(undefined, "de-AT", ["de-AT"])).toBe("de-AT");
  expect(wakeLocale("fr", "ja", ["ja", "en"])).toBeUndefined();
});
