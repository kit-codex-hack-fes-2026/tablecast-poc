import { expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { fixture, mountKiosk } from "./test-support/kiosk-fixture";
import { VoiceConnection } from "./voice-connection";

it.each(["ja", "en"] as const)(
  "%sの実客画面で初期案内・マイク設定と下部再開を併用できる",
  async (locale) => {
    fixture.current.locale = locale;
    fixture.current.uiSection = "menu";
    fixture.current.events = [];
    const labels = locale === "ja" ? ja : en;
    const start = vi.spyOn(VoiceConnection.prototype, "start").mockResolvedValue(undefined);
    vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue([
      {
        deviceId: "default",
        groupId: "tablecast-ipad",
        kind: "audioinput",
        label: "iPad microphone",
        toJSON: () => ({}),
      },
    ]);
    await page.viewport(1180, 820);
    await mountKiosk();
    const welcome = page.getByRole("button", { name: labels.kiosk_welcome_start, exact: true });
    await expect.element(welcome).toBeVisible();
    await page.getByRole("button", { name: labels.kiosk_input_settings, exact: true }).click();
    const settings = page.getByRole("dialog", { name: labels.kiosk_input_settings, exact: true });
    await expect
      .element(settings.getByRole("combobox", { name: labels.kiosk_microphone_input }))
      .toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(start).not.toHaveBeenCalled();
    await welcome.click();
    expect(start).toHaveBeenCalledOnce();
    await page.getByRole("button", { name: labels.kiosk_voice_resume, exact: true }).click();
    expect(start).toHaveBeenCalledTimes(2);
  },
);
