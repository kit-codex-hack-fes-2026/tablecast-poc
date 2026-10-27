import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, server, userEvent } from "vitest/browser";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { fixtureValue } from "../../test-support/fixture-value";
import "../../styles.css";
import { Kiosk } from "./kiosk";
import {
  fixture,
  mountKiosk,
  orderPanel,
  requests,
  TablecastSocket,
  targetWrites,
} from "./test-support/kiosk-fixture";
import { VoiceConnection } from "./voice-connection";

beforeEach(() => server.commands.tablecastLogoFixture(true));
afterEach(() => server.commands.tablecastLogoFixture(false));

it.each(["ja", "en"] as const)(
  "%sの補助入口と縦横の切替は接客対象・会話・カートを保持する",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    fixture.current.locale = locale;
    fixture.current.uiSection = "menu";
    fixture.catalogResponse = Response.json({
      ...catalog,
      configuration: {
        ...catalog.configuration,
        branding: {
          logo: null,
          banner: {
            imageKey: `tablecast/uploads/${"a".repeat(64)}.webp`,
            alt: { ja: "店舗バナー", en: "Store banner" },
            imageKind: "illustration",
            imageSource: { generated: true, description: "横長バナーの配置試験用" },
          },
        },
      },
    });
    fixture.current.events = [
      {
        cursor: 1,
        kind: "voice.user",
        data: {
          role: "user",
          text:
            locale === "ja"
              ? "お刺身に合う日本酒はありますか？"
              : "Which sake goes well with sashimi?",
          locale,
        },
        storeId: fixture.current.storeId,
        tableSessionId: fixture.current.id,
        createdAt: 1788645000000,
      },
      {
        cursor: 2,
        kind: "voice.tool",
        data: {
          turnId: "tablecast-layout-turn",
          toolCallId: "tablecast-layout-call",
          toolName: "getCatalog",
          state: "completed",
        },
        storeId: fixture.current.storeId,
        tableSessionId: fixture.current.id,
        createdAt: 1788645001000,
      },
      {
        cursor: 3,
        kind: "voice.assistant",
        data: {
          role: "assistant",
          text:
            locale === "ja"
              ? "すっきりした辛口の月凪がおすすめです。"
              : "I recommend the crisp, dry Tsukinagi.",
          locale,
        },
        storeId: fixture.current.storeId,
        tableSessionId: fixture.current.id,
        createdAt: 1788645002000,
      },
    ];
    fixture.current.cursor = 3;
    fixture.participantNames = ["Reo", "Alex"];
    vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue([
      {
        deviceId: "default",
        groupId: "tablecast-ipad",
        kind: "audioinput",
        label: "iPad microphone",
        toJSON: () => ({}),
      },
    ]);
    const observe = vi.spyOn(VoiceConnection.prototype, "observeMicrophones");
    await page.viewport(1024, 768);
    await mountKiosk();
    const tools = page.getByRole("button", { name: new RegExp(`^${labels.kiosk_visit_tools}`) });
    await expect.element(tools).toBeVisible();
    expect(tools.element().closest("header")).not.toBeNull();
    const conversation = page
      .getByRole("region", { name: labels.kiosk_conversation, exact: true })
      .element();
    // イベントの独立queryが初期cursorを取得してから通知接続を開始する。
    await expect.poll(() => TablecastSocket.instances.length).toBe(1);
    const socket = fixtureValue(TablecastSocket.instances[0]);
    const cart = structuredClone(fixture.current.cart);
    const order = orderPanel();
    const group = order?.parentElement;
    if (!order || !group) throw new Error("分割された注文領域がありません");
    const paneWidth = order.getBoundingClientRect().width;
    const availableWidth = group.getBoundingClientRect().width;
    const conversationWidth = conversation.getBoundingClientRect().width;
    const handleWidth = page
      .getByRole("separator", { name: labels.kiosk_resize_panes })
      .element()
      .getBoundingClientRect().width;
    // OSの常設スクロールバー領域を除いた実Group幅に対して、メニューと固定幅の会話欄を確認する。
    expect(conversationWidth).toBeCloseTo(240, 0);
    expect(paneWidth + conversationWidth + handleWidth).toBeCloseTo(availableWidth, 0);
    expect(paneWidth / availableWidth).toBeGreaterThan(0.75);
    expect(paneWidth / availableWidth).toBeLessThan(0.78);
    await expect
      .element(page.getByRole("region", { name: labels.customer_join_visit }))
      .not.toBeInTheDocument();
    tools.element().focus();
    await userEvent.keyboard("{Enter}");
    const dialog = page.getByRole("dialog", { name: labels.kiosk_visit_tools, exact: true });
    await expect.element(dialog).toBeVisible();
    await expect
      .element(dialog.getByText(labels.kiosk_service_group, { exact: true }))
      .toBeVisible();
    await dialog.getByRole("button", { name: "Alex", exact: true }).click();
    await expect
      .element(dialog.getByRole("button", { name: "Alex", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{Escape}");
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(tools).toHaveFocus();
    await tools.click();
    await expect
      .element(dialog.getByRole("button", { name: "Alex", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{Escape}");
    for (const [width, height] of [
      [1512, 982],
      [1180, 820],
      [820, 1180],
      [402, 874],
    ] as const) {
      await page.viewport(width, height);
      const brand = document.querySelector('header img[alt="TableCast"]');
      const storeBanner = document.querySelector('header [data-ui="store-logo-banner"] img');
      if (!brand || !storeBanner) throw new Error("ヘッダーのブランドと店舗バナーが必要です");
      expect(brand.getBoundingClientRect().width).toBe(112);
      expect(storeBanner.getBoundingClientRect().height).toBe(40);
      await expect
        .element(page.getByRole("separator", { name: labels.kiosk_resize_panes }))
        .toHaveAttribute("aria-orientation", width >= 896 ? "vertical" : "horizontal");
      await expect
        .poll(() => conversation.getBoundingClientRect().height)
        .toBeGreaterThanOrEqual(width >= 896 ? 224 : 344);
      const resume = page.getByRole("button", { name: labels.kiosk_voice_resume, exact: true });
      const review = page.getByRole("button", { name: labels.kiosk_review, exact: true });
      expect(resume.element().closest("[data-theme-part=voice-controls]")).not.toBeNull();
      expect(document.querySelector("[data-theme-part=header]")?.contains(resume.element())).toBe(
        false,
      );
      for (const control of [resume, review]) {
        await expect.element(control).toBeVisible();
        const bounds = control.element().getBoundingClientRect();
        expect(bounds.height).toBeGreaterThanOrEqual(56);
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(width);
        expect(bounds.bottom).toBeLessThanOrEqual(height);
      }
      await page.screenshot({
        path: `../../../test-results/tablecast-guest-compact-${locale}-${width}.png`,
      });
      expect(tools.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      await expect
        .poll(() => {
          const conversationBounds = conversation.getBoundingClientRect();
          const orderBounds = orderPanel()?.getBoundingClientRect();
          if (!orderBounds) throw new Error("注文ペインが必要です");
          return width >= 896
            ? conversationBounds.right - orderBounds.left
            : conversationBounds.bottom - orderBounds.top;
        })
        .toBeLessThanOrEqual(2);
      expect(
        page.getByRole("region", { name: labels.kiosk_conversation, exact: true }).element(),
      ).toBe(conversation);
    }
    const history = conversation.querySelector('[data-ui="conversation-history"]');
    const controls = conversation.querySelector('[data-theme-part="voice-controls"]');
    const camera = conversation.querySelector('[data-ui="camera-frame"]');
    if (!history || !controls || !camera) throw new Error("常設会話・操作・カメラがありません");
    expect(history.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
    expect(camera.getBoundingClientRect().width).toBeLessThanOrEqual(160);
    expect(controls.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      history.getBoundingClientRect().bottom,
    );
    expect(controls.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      conversation.getBoundingClientRect().bottom,
    );
    await expect
      .element(page.getByRole("button", { name: labels.kiosk_history_show }))
      .not.toBeInTheDocument();
    for (const tab of page.getByRole("tab").elements()) {
      expect(tab.getBoundingClientRect().height).toBe(
        page
          .getByRole("button", { name: labels.kiosk_voice_resume, exact: true })
          .element()
          .getBoundingClientRect().height,
      );
      expect(parseFloat(getComputedStyle(tab).fontSize)).toBeGreaterThanOrEqual(14);
      expect(tab.scrollWidth).toBeLessThanOrEqual(tab.clientWidth);
    }
    await page.viewport(1024, 768);
    await expect.poll(() => orderPanel()?.getBoundingClientRect().width).toBeCloseTo(paneWidth, 0);
    const separator = page.getByRole("separator", { name: labels.kiosk_resize_panes });
    separator.element().focus();
    await userEvent.keyboard("{ArrowRight}");
    const resizedWidth = conversation.getBoundingClientRect().width;
    expect(resizedWidth).toBeGreaterThan(240);
    await page.viewport(768, 1024);
    await expect.element(separator).toHaveAttribute("aria-orientation", "horizontal");
    await page.viewport(1024, 768);
    await expect
      .poll(() => conversation.getBoundingClientRect().width)
      .toBeCloseTo(resizedWidth, 0);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(TablecastSocket.instances).toEqual([socket]);
    expect(socket.closed).toBe(false);
    expect(fixture.current.cart).toEqual(cart);
    expect(targetWrites).toEqual([
      {
        participantId: "11111111-1111-4111-8111-111111111111",
        token: "22222222-2222-4222-8222-222222222222",
      },
    ]);
    expect(requests.filter((request) => /\/voice\/(start|stop)$/.test(request.url))).toHaveLength(
      0,
    );
  },
);

it("店舗テーマでもヘッダーと音声・カート操作を縦横で維持する", async () => {
  fixture.current.uiSection = "menu";
  fixture.current.staffCalled = false;
  fixture.catalogResponse = Response.json({
    ...catalog,
    configuration: {
      ...catalog.configuration,
      appearance: {
        colours: { ink: "#201a16", paper: "#fff8e7", accent: "#bb241c" },
        parts: {
          header: { background: "#fff8e7" },
          "product-card": { borderWidth: 3, borderColor: "#201a16", radius: 4, shadow: "offset" },
        },
      },
    },
  });
  await page.viewport(1180, 820);
  await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <QueryClientProvider client={fixture.client}>
        <MotionProvider>
          <Kiosk />
        </MotionProvider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
  for (const [width, height] of [
    [1180, 820],
    [820, 1180],
  ] as const) {
    await page.viewport(width, height);
    await expect.element(page.getByRole("button", { name: ja.kiosk_call_staff })).toBeVisible();
    await expect.element(page.getByRole("button", { name: ja.kiosk_review })).toBeVisible();
    const voice = document.querySelector('[data-theme-part="voice-controls"]');
    if (!voice) throw new Error("音声操作が必要です");
    expect(voice.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  }
  await page.getByRole("button", { name: ja.kiosk_call_staff }).click();
  await expect.element(page.getByRole("button", { name: ja.kiosk_called_staff })).toBeDisabled();
});

it.each(["ja", "en"] as const)(
  "%sの横長バナー未設定時は店舗ロゴを表示し、画像失敗でも店舗名とヘッダーの高さを保つ",
  async (locale) => {
    vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue([
      {
        deviceId: "default",
        groupId: "tablecast-ipad",
        kind: "audioinput",
        label: "iPad microphone",
        toJSON: () => ({}),
      },
    ]);
    fixture.current.locale = locale;
    fixture.catalogResponse = Response.json({
      ...catalog,
      configuration: {
        ...catalog.configuration,
        products: catalog.configuration.products.map((product) => ({
          ...product,
          available: true,
        })),
        branding: {
          banner: null,
          logo: {
            imageKey: `tablecast/uploads/${"a".repeat(64)}.webp`,
            alt: { ja: "店舗ロゴ", en: "Restaurant logo" },
            imageKind: "illustration",
            imageSource: { generated: true, description: "店舗の横長ロゴの配置試験用" },
          },
        },
      },
    });
    await page.viewport(1180, 820);
    fixture.current.uiSection = "menu";
    fixture.current.cursor = 2;
    fixture.current.events = [
      {
        cursor: 1,
        kind: "voice.products",
        storeId: fixture.current.storeId,
        tableSessionId: fixture.current.id,
        createdAt: 1788645000000,
        data: {
          turnId: "tablecast-service-offers",
          productIds: catalog.configuration.products
            .toReversed()
            .slice(0, 4)
            .map(({ id }) => id),
        },
      },
      {
        cursor: 2,
        kind: "voice.assistant",
        storeId: fixture.current.storeId,
        tableSessionId: fixture.current.id,
        createdAt: 1788645001000,
        data: {
          role: "assistant",
          locale,
          text:
            locale === "ja"
              ? "こちらがおすすめです。気になる料理はありますか？"
              : "Here are our recommendations. Which would you like to hear about?",
        },
      },
    ];
    await mountKiosk();
    const image = page.getByRole("img", {
      name: locale === "ja" ? "店舗ロゴ" : "Restaurant logo",
      exact: true,
    });
    await expect.element(image).toBeVisible();
    await expect
      .poll(() => {
        const element = image.element();
        return element instanceof HTMLImageElement ? element.naturalWidth : 0;
      })
      .toBe(400);
    const header = document.querySelector("header");
    if (!header) throw new Error("ヘッダーがありません");
    expect(image.element().getBoundingClientRect().height).toBe(40);
    expect(header.getBoundingClientRect().height).toBe(64);
    await Promise.all(
      [
        ...document.querySelectorAll(
          '[data-ui="voice-products-entry"], [data-ui="conversation-entry"]',
        ),
      ].flatMap((element) => element.getAnimations().map((animation) => animation.finished)),
    );
    await page.screenshot({ path: `../../../test-results/tablecast-service-${locale}-ipad.png` });
    image.element().dispatchEvent(new Event("error"));
    await expect.element(image).not.toBeInTheDocument();
    expect(header.getBoundingClientRect().height).toBe(64);
    expect(header.textContent).toContain(fixture.current.storeName);
  },
);

it.each(["ja", "en"] as const)(
  "%sの横長バナー取得が失敗しても設定済み店舗ロゴへ切り替える",
  async (locale) => {
    fixture.current.locale = locale;
    fixture.catalogResponse = Response.json({
      ...catalog,
      configuration: {
        ...catalog.configuration,
        branding: {
          banner: {
            imageKey: `tablecast/uploads/${"b".repeat(64)}.webp`,
            alt: { ja: "取得できないバナー", en: "Unavailable banner" },
            imageKind: "illustration",
            imageSource: { generated: true, description: "取得失敗の確認用" },
          },
          logo: {
            imageKey: `tablecast/uploads/${"a".repeat(64)}.webp`,
            alt: { ja: "店舗ロゴ", en: "Restaurant logo" },
            imageKind: "illustration",
            imageSource: { generated: true, description: "代わりに表示するロゴ" },
          },
        },
      },
    });
    await page.viewport(1180, 820);
    await mountKiosk();
    const image = page.getByRole("img", {
      name: locale === "ja" ? "店舗ロゴ" : "Restaurant logo",
      exact: true,
    });
    await expect.element(image).toBeVisible();
    await expect
      .poll(() => {
        const element = image.element();
        return element instanceof HTMLImageElement ? element.naturalWidth : 0;
      })
      .toBe(400);
    expect(image.element().getBoundingClientRect().height).toBe(40);
  },
);
