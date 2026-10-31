import QrScanner from "qr-scanner";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { Surface } from "./test-support/voice-panel-fixture";
import { VoiceProgress } from "./voice-progress";
import { VoiceReferenceCard } from "./voice-reference";

const favicon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" rx="4" fill="#0b734c"/><text x="7" y="18" font-size="17" fill="white">T</text></svg>')}`;
it.each([
  { label: "短いURL", url: "https://example.com/tea?from=tablecast" },
  { label: "上限に近いURL", url: `https://example.com/tea?data=${"a".repeat(950)}` },
])("$label: 中央favicon付き実描画QRをデコードし、出典リンクとOGPを表示する", async ({ url }) => {
  await page.viewport(1180, 820);
  const screen = await render(
    <Surface>
      <div className="w-44">
        <VoiceReferenceCard
          reference={{
            url,
            title: "Tea guide",
            description: "Tea reference",
            faviconUrl: favicon,
            imageUrl: favicon,
          }}
        />
      </div>
    </Surface>,
  );
  await expect
    .element(screen.getByRole("link", { name: "Tea guide" }))
    .toHaveAttribute("href", url);
  await expect
    .element(screen.getByRole("img", { name: "Tea guide" }))
    .toHaveAttribute("src", favicon);
  const card = document.querySelector('[data-ui="voice-reference"]');
  if (!(card instanceof HTMLElement)) throw new Error("参考カードがありません");
  expect(card.getBoundingClientRect().width).toBeLessThanOrEqual(176);
  expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
  let readingSurface: Element = card;
  let svg = card.querySelector("svg:has(title)");
  if (url.length > 400) {
    await screen.getByRole("button", { name: ja.kiosk_reference_expand }).click();
    readingSurface = screen.getByRole("dialog").element();
    svg = readingSurface.querySelector("svg:has(title)");
  }
  await expect.poll(() => getComputedStyle(readingSurface).transform).toBe("none");
  if (!svg) throw new Error("QRが描画されていません");
  expect(svg.querySelector("image")?.getAttribute("href")).toBe(favicon);
  const rendered = svg.cloneNode(true);
  if (!(rendered instanceof SVGSVGElement)) throw new Error("SVGのQRが必要です");
  const size = Math.round(svg.getBoundingClientRect().width);
  rendered.setAttribute("width", String(size));
  rendered.setAttribute("height", String(size));
  const image = new Image();
  image.src = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(rendered))}`;
  await image.decode();
  const result = await QrScanner.scanImage(image, { returnDetailedScanResult: true });
  expect(result.data).toBe(url);
  if (url.length <= 400)
    await screen.getByRole("button", { name: ja.kiosk_reference_expand }).click();
  await userEvent.keyboard("{Escape}");
  await expect
    .element(screen.getByRole("button", { name: ja.kiosk_reference_expand }))
    .toHaveFocus();
});
it("画像取得失敗でもQRを残し、推論要約を操作なしで表示して完了後も保つ", async () => {
  const screen = await render(
    <Surface>
      <VoiceReferenceCard
        reference={{
          url: "https://example.com/tea",
          title: "Tea guide",
          imageUrl: "data:image/png;base64,broken",
          faviconUrl: "data:image/png;base64,broken",
        }}
      />
      <VoiceProgress
        view={{
          status: "thinking",
          progress: {
            stage: "searching",
            summary: "**公開資料**を確認しています。\n\n- 出典を確認\n- 価格は店舗情報で確認",
          },
          citations: [{ url: "https://example.com/tea", title: "Tea source" }],
        }}
      />
    </Surface>,
  );
  await expect.element(screen.getByRole("status")).toHaveTextContent(ja.kiosk_searching);
  await expect.element(screen.getByText("公開資料", { exact: true })).toBeVisible();
  expect(
    Number(getComputedStyle(screen.getByText("公開資料", { exact: true }).element()).fontWeight),
  ).toBeGreaterThanOrEqual(600);
  expect(screen.getByText("出典を確認", { exact: true }).element().closest("li")).not.toBeNull();
  await expect
    .element(screen.getByRole("region", { name: ja.kiosk_reasoning_summary }))
    .toBeVisible();
  await expect.element(screen.getByText("公開資料", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("link", { name: "Tea source" })).toBeVisible();
  await expect.element(screen.getByRole("link", { name: "Tea guide" })).toBeVisible();
  await expect.poll(() => document.querySelector('[data-ui="voice-reference"] > img')).toBeNull();
  expect(document.querySelector('[data-ui="voice-reference"] svg:has(title)')).not.toBeNull();
  await screen.rerender(
    <Surface>
      <VoiceProgress
        view={{
          status: "listening",
          progress: { stage: "searching", summary: "**公開資料**を確認しました。" },
        }}
      />
    </Surface>,
  );
  await expect.element(screen.getByText("公開資料", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
});
