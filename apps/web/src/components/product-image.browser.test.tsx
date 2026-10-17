import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server.browser";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import "../styles.css";
import { ProductImage } from "./product-image";
import transparent from "../../.storybook/tablecast-transparent.svg?url&no-inline";

const blurDataURL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23d4a574'/%3E%3C/svg%3E";

it("読込待ちの背景と寸法を保ち、透過画像の成功後に背景を消す", async () => {
  const view = await render(
    <div style={{ marginTop: 20000 }}>
      <ProductImage
        src={transparent}
        alt="商品"
        width={192}
        height={192}
        blurDataURL={blurDataURL}
      />
    </div>,
  );
  const image = view.getByRole("img", { name: "商品" }).element();
  expect(image.getBoundingClientRect().width).toBe(192);
  expect(image.getBoundingClientRect().height).toBe(192);
  expect(getComputedStyle(image).backgroundImage).toContain("data:image/");
  image.scrollIntoView();
  await expect.poll(() => getComputedStyle(image).backgroundImage).toBe("none");
  expect(image.getBoundingClientRect().height).toBe(192);
  await expect.element(view.getByRole("img", { name: "商品" })).toBeVisible();
});

it("読込失敗で背景を消して通知し、画像差替え後は再び読込待ちを表示する", async () => {
  const onError = vi.fn<() => void>();
  const view = await render(
    <ProductImage
      src="/tablecast-missing-image.png"
      alt="商品"
      width={96}
      height={96}
      blurDataURL={blurDataURL}
      onError={onError}
      priority
    />,
  );
  const image = view.getByRole("img", { name: "商品" }).element();
  await expect.poll(() => onError.mock.calls.length).toBe(1);
  await expect.poll(() => getComputedStyle(image).backgroundImage).toBe("none");
  expect(image.getBoundingClientRect().height).toBe(96);
  await view.rerender(
    <div style={{ marginTop: 20000 }}>
      <ProductImage
        src="/icons/tablecast-512.png"
        alt="商品"
        width={96}
        height={96}
        blurDataURL={blurDataURL}
      />
    </div>,
  );
  expect(
    getComputedStyle(view.getByRole("img", { name: "商品" }).element()).backgroundImage,
  ).toContain("data:image/");
});

it("hydration前に読込済みでも背景を消し、placeholder未指定の寸法も予約する", async () => {
  const content = (
    <ProductImage
      src="/icons/tablecast-180.png"
      alt="商品"
      width={180}
      height={180}
      blurDataURL={blurDataURL}
      priority
    />
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(content);
  document.body.appendChild(container);
  const image = container.querySelector("img");
  if (!image) throw new Error("SSR画像がありません");
  try {
    await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true);
    const root = hydrateRoot(container, content);
    try {
      await expect.poll(() => getComputedStyle(image).backgroundImage).toBe("none");
      expect(image.getBoundingClientRect().height).toBe(180);
    } finally {
      root.unmount();
    }
  } finally {
    container.remove();
  }
  const view = await render(
    <ProductImage src="/icons/tablecast-180.png" alt="背景なし" width={64} height={64} />,
  );
  const plain = view.getByRole("img", { name: "背景なし" }).element();
  expect(getComputedStyle(plain).backgroundImage).toBe("none");
  expect(plain.getBoundingClientRect().height).toBe(64);
});
