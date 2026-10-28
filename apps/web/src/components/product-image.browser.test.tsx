import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server.browser";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import transparent from "../../.storybook/tablecast-transparent.svg?url&no-inline";
import { LocaleProvider } from "../i18n/locale";
import { catalog, product } from "../test-support/tablecast-fixtures";
import "../styles.css";
import { ImageProvider } from "./image-provider";
import { ProductImage } from "./product-image";
import { ProductMenu } from "./product-menu";

const blurhash = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

const menu = (imageKey: null | string) => (
  <LocaleProvider initialLocale="ja" persist={false}>
    <div className="w-64">
      <ProductMenu
        catalog={{
          ...catalog,
          configuration: {
            ...catalog.configuration,
            products: catalog.configuration.products.map((item) => ({
              ...item,
              imageKey: item.id === product.id ? imageKey : null,
              imageKind: "photograph",
            })),
          },
        }}
        onChoose={() => undefined}
      />
    </div>
  </LocaleProvider>
);

it("商品画像の未登録・取得待ち・失敗で商品名と次の行の位置を変えない", async () => {
  const view = await render(menu(null));
  const title = () => view.getByText(product.text.ja.displayName, { exact: true }).element();
  const next = () => view.getByRole("button", { name: /こもれび 白霞 にごり酒/ }).element();
  const titleTop = title().getBoundingClientRect().top;
  const nextTop = next().getBoundingClientRect().top;
  await view.rerender(menu("tablecast-missing-menu-image.webp"));
  expect(title().getBoundingClientRect().top).toBe(titleTop);
  expect(next().getBoundingClientRect().top).toBe(nextTop);
  const image = view.container.querySelector("img");
  if (!image) throw new Error("商品画像がありません");
  await expect.poll(() => image.complete && image.naturalWidth === 0).toBe(true);
  expect(title().getBoundingClientRect().top).toBe(titleTop);
  expect(next().getBoundingClientRect().top).toBe(nextTop);
  await view.rerender(menu(null));
  expect(title().getBoundingClientRect().top).toBe(titleTop);
  expect(next().getBoundingClientRect().top).toBe(nextTop);
});

it("読込待ちの背景と寸法を保ち、透過画像の成功後に背景を消す", async () => {
  const view = await render(
    <div style={{ marginTop: 20000 }}>
      <ProductImage src={transparent} alt="商品" width={192} height={192} blurhash={blurhash} />
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
      blurhash={blurhash}
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
        blurhash={blurhash}
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
      blurhash={blurhash}
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

it("店舗別の表示情報からSSRへ背景と寸法を埋め込み、候補幅を原寸と上限で制限する", () => {
  const key = "tablecast/uploads/source.webp";
  const html = renderToString(
    <ImageProvider
      basePath="/api/admin/stores/tablecast-store"
      assets={{ [key]: { width: 240, height: 120, blurhash } }}
    >
      <ProductImage
        src={`/media/${key}`}
        alt="店舗バナー"
        width={1600}
        height={600}
        natural
        sizes="480px"
      />
    </ImageProvider>,
  );
  const template = document.createElement("template");
  template.innerHTML = html;
  const image = template.content.querySelector("img");
  expect(html).toContain("data:image/");
  expect(image?.getAttribute("width")).toBe("240");
  expect(image?.getAttribute("height")).toBe("120");
  expect(image?.getAttribute("src")).toContain("/api/admin/stores/tablecast-store/images/");
  const widths = image
    ?.getAttribute("srcset")
    ?.split(",")
    .map((candidate) =>
      Number(
        new URL(candidate.trim().split(" ")[0] ?? "", location.origin).searchParams.get("width"),
      ),
    );
  expect(widths?.length).toBeGreaterThan(0);
  expect(widths?.every((width) => width <= 240)).toBe(true);
});
