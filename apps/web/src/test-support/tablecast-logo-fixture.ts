import type { BrowserCommand } from "vitest/node";

// ロゴ画像のHTTP境界だけをケース単位で固定し、終了時に解除する。
export const tablecastLogoFixture: BrowserCommand<[enabled: boolean], void> = async (
  { context },
  enabled,
) => {
  const path = `**/media/tablecast/uploads/${"a".repeat(64)}.webp*`;
  await context.unroute(path);
  if (enabled)
    await context.route(path, (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="white"/><text x="12" y="66" font-size="52" font-family="sans-serif" fill="black">こもれび</text></svg>',
      }),
    );
};

declare module "vitest/browser" {
  interface BrowserCommands {
    tablecastLogoFixture: (enabled: boolean) => Promise<void>;
  }
}
