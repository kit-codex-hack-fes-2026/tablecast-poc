import type { Locale, VoiceActivation } from "@tablecast/api/schema";

export type WakeActivation = Exclude<VoiceActivation, "manual">;
export type StandbyStatus =
  | "armed"
  | "connecting"
  | "conversation"
  | "error"
  | "language"
  | "off"
  | "preparing"
  | "suspended";
export type StandbyObservation = {
  at: number;
  attention: number;
  crossed: boolean;
  mouth: number;
  person: number;
  raised: boolean;
  score: number;
};
export type StandbyInput =
  | { at: number; bitmap: ImageBitmap; type: "frame" }
  | { audio: Float32Array; id: number; type: "speech" }
  | { mode: "speech" | "vision"; type: "init" };
export type StandbyOutput =
  | { id: number; locale?: Locale; type: "speech" }
  | { observation?: StandbyObservation; type: "frame" }
  | { type: "error" }
  | { type: "ready" };

export const wakePhrases: Readonly<Record<string, readonly string[]>> = {
  ja: ["すみません", "すいません"],
  en: ["excuse me"],
  "zh-Hans": ["服务员", "不好意思"],
  "zh-Hant": ["服務員", "不好意思"],
  ko: ["저기요", "실례합니다"],
  fr: ["excusez-moi", "excusez moi"],
  es: ["disculpe", "perdone"],
  de: ["entschuldigung"],
  it: ["mi scusi"],
  pt: ["com licença"],
  ar: ["لو سمحت"],
  hi: ["सुनिए"],
};
const normalise = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, "");
export function wakeLanguage(text: string): Locale | undefined {
  const normal = normalise(text);
  return Object.entries(wakePhrases).find(([, phrases]) =>
    phrases.some((phrase) => normalise(phrase) === normal),
  )?.[0];
}

export function wakeLocale(
  detected: Locale | undefined,
  selected: Locale,
  languages: readonly Locale[],
) {
  if (!detected || detected.split("-")[0] === selected.split("-")[0]) return selected;
  return languages.includes(detected)
    ? detected
    : languages.find((locale) => locale.split("-")[0] === detected.split("-")[0]);
}

// 推定結果の時刻を使う。遅着、遮蔽、移動、別人への切替を継続時間に加えない。
export class WakeDecision {
  private since?: { activation: WakeActivation; at: number; person: number };
  private previous?: StandbyObservation;
  private speech?: { at: number; moving: number; person: number; samples: number; valid: boolean };
  reset() {
    this.since = undefined;
    this.previous = undefined;
    this.speech = undefined;
  }
  observe(observation: StandbyObservation | undefined, now: number): undefined | WakeActivation {
    const previous = this.previous;
    const valid =
      observation &&
      observation.score >= 0.8 &&
      now - observation.at <= 750 &&
      now >= observation.at;
    if (!valid) {
      this.reset();
      return undefined;
    }
    const continuous =
      previous &&
      observation.person === previous.person &&
      observation.at > previous.at &&
      observation.at - previous.at <= 750;
    if (!continuous) this.since = undefined;
    if (this.speech) {
      this.speech.valid &&= Boolean(continuous && this.speech.person === observation.person);
      this.speech.samples++;
      if (previous && Math.abs(previous.mouth - observation.mouth) > 0.025) this.speech.moving++;
    }
    this.previous = observation;
    const activation = observation.crossed
      ? "bill_check"
      : observation.raised
        ? "hand_raise"
        : observation.attention >= 0.92
          ? "gaze"
          : undefined;
    if (!activation) {
      this.since = undefined;
      return undefined;
    }
    if (this.since?.person !== observation.person || this.since.activation !== activation)
      this.since = { at: observation.at, person: observation.person, activation };
    const dwell = activation === "gaze" ? 3000 : activation === "bill_check" ? 1000 : 800;
    return observation.at - this.since.at >= dwell ? activation : undefined;
  }
  beginSpeech(now: number) {
    const person = this.previous;
    this.speech =
      person && now - person.at < 500
        ? { person: person.person, at: now, moving: 0, samples: 0, valid: true }
        : undefined;
  }
  endSpeech(now: number): number | undefined {
    const speech = this.speech;
    this.speech = undefined;
    return speech?.valid &&
      speech.samples >= 3 &&
      speech.moving >= 2 &&
      now - speech.at <= 5000 &&
      this.currentPerson(now) === speech.person
      ? speech.person
      : undefined;
  }
  currentPerson(now: number) {
    return this.previous && now - this.previous.at < 750 ? this.previous.person : undefined;
  }
}
