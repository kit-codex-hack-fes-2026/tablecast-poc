import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { Product } from "@tablecast/api/schema";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { ConfigurationImageField } from "./configuration-image-field";
import "../../styles.css";

const png = new File(
  [
    Uint8Array.fromBase64(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    ),
  ],
  "tablecast-dish.png",
  { type: "image/png" },
);
const original = {
  imageKey: "tablecast/original.webp",
  imageKind: "photograph" as const,
  imageSource: { generated: false, description: "店舗の料理写真" },
};
let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  document.documentElement.style.fontSize = "";
});

function Form() {
  const [form, setForm] = useState<{
    image: Pick<Product, "imageKey" | "imageKind" | "imageSource">;
    name: string;
  }>({ image: original, name: "料理名" });
  const { image, name } = form;
  const [record, setRecord] = useState("first");
  return (
    <main className="mx-auto max-w-xl p-6">
      <label>
        商品名
        <input value={name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </label>
      <ConfigurationImageField
        key={record}
        storeId="tablecast-images"
        value={image}
        onChange={(nextImage) => setForm({ ...form, image: nextImage })}
        disabled={false}
      />
      <button
        type="button"
        onClick={() => {
          setRecord("second");
          setForm({ name: "別の商品", image: original });
        }}
      >
        別の商品へ移動
      </button>
      <output className="block wrap-anywhere" aria-label="編集した参照">
        {image.imageKey ?? "none"}
      </output>
      <output className="block wrap-anywhere" aria-label="編集した出所">
        {JSON.stringify(image.imageSource)}
      </output>
    </main>
  );
}
async function setup(locale: "ja" | "en") {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <Form />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it("解除と別ファイルへの置換で出所・生成申告を持ち越さず、同じファイルの再試行では保持する", async () => {
  const requests: FormData[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname !== "/api/admin/stores/tablecast-images/images")
      throw new Error(`未定義の要求: ${request.url}`);
    requests.push(await request.formData());
    if (requests.length === 1)
      return Response.json({ error: { code: "IMAGE_PROCESSING_FAILED" } }, { status: 503 });
    return Response.json({
      imageKey: "tablecast/uploads/generated.webp",
      imageKind: "illustration",
      imageSource: { generated: true, description: "この候補の生成画像" },
      url: "/media/tablecast/uploads/generated.webp",
    });
  });
  await setup("ja");
  await page.getByRole("button", { name: ja.editor_image_remove }).click();
  await page.getByRole("combobox", { name: ja.editor_image_method }).selectOptions("existing");
  await expect
    .element(page.getByRole("textbox", { name: ja.editor_image_source, exact: true }))
    .toHaveValue("");
  await expect
    .element(page.getByRole("combobox", { name: ja.editor_image_kind }))
    .toHaveValue("illustration");
  await page.getByRole("combobox", { name: ja.editor_image_method }).selectOptions("file");
  await page.getByLabelText(ja.editor_image_choose).upload(png);
  await page.getByRole("checkbox", { name: ja.editor_generated_image }).click();
  await page
    .getByRole("textbox", { name: ja.editor_image_source, exact: true })
    .fill("この候補の生成画像");
  await page.getByRole("button", { name: ja.editor_image_upload }).click();
  await page.getByRole("button", { name: ja.common_retry }).click();
  await expect
    .element(page.getByRole("status", { name: "編集した参照" }))
    .toHaveTextContent("tablecast/uploads/generated.webp");
  expect(requests.map((request) => request.get("metadata"))).toEqual([
    JSON.stringify({
      imageKind: "illustration",
      imageSource: { generated: true, description: "この候補の生成画像" },
    }),
    JSON.stringify({
      imageKind: "illustration",
      imageSource: { generated: true, description: "この候補の生成画像" },
    }),
  ]);
  const replacement = new File([await png.arrayBuffer()], "tablecast-new-photo.png", {
    type: "image/png",
  });
  await page.getByLabelText(ja.editor_image_replace).upload(replacement);
  await expect
    .element(page.getByRole("checkbox", { name: ja.editor_generated_image }))
    .not.toBeChecked();
  await expect.element(page.getByRole("combobox", { name: ja.editor_image_kind })).toBeEnabled();
  await expect
    .element(page.getByRole("combobox", { name: ja.editor_image_kind }))
    .toHaveValue("illustration");
  await expect
    .element(page.getByRole("textbox", { name: ja.editor_image_source, exact: true }))
    .toHaveValue("");
  await page.getByRole("button", { name: ja.editor_image_upload }).click();
  await expect.element(page.getByRole("alert")).toHaveTextContent(ja.editor_image_source_required);
  expect(requests).toHaveLength(2);
});

it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)(
  "$localeで取込失敗中の画像参照と入力を保持し、再試行で置換してキーボードで解除できる",
  async ({ locale, labels }) => {
    // Given: 実HTTP clientを使い、最初の取込だけ失敗する
    const requests: FormData[] = [];
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (new URL(request.url).pathname !== "/api/admin/stores/tablecast-images/images")
        throw new Error(`未定義の要求: ${request.url}`);
      requests.push(await request.formData());
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    await setup(locale);
    await page.getByLabelText(labels.editor_image_replace).upload(png);
    await expect
      .element(page.getByRole("img", { name: labels.editor_image_candidate }))
      .toBeVisible();
    await page.getByRole("checkbox", { name: labels.editor_generated_image }).click();
    await expect
      .element(page.getByRole("combobox", { name: labels.editor_image_kind }))
      .toHaveValue("illustration");
    await expect
      .element(page.getByRole("combobox", { name: labels.editor_image_kind }))
      .toBeDisabled();
    await page
      .getByRole("textbox", { name: labels.editor_image_source, exact: true })
      .fill("店舗が利用を許可した生成イメージ");
    await page.getByRole("button", { name: labels.editor_image_upload }).click();
    await expect.poll(() => requests.length).toBe(1);
    await expect
      .element(page.getByRole("status").filter({ hasText: labels.form_submitting }))
      .toBeVisible();
    await page.getByRole("textbox", { name: "商品名", exact: true }).fill("取込中に編集した料理名");
    finish?.(Response.json({ error: { code: "IMAGE_PROCESSING_FAILED" } }, { status: 503 }));
    await expect.element(page.getByRole("alert")).toHaveTextContent(labels.common_unavailable);
    await expect
      .element(page.getByRole("status", { name: "編集した参照" }))
      .toHaveTextContent(original.imageKey);
    await expect
      .element(page.getByRole("textbox", { name: labels.editor_image_source, exact: true }))
      .toHaveValue("店舗が利用を許可した生成イメージ");
    await expect
      .element(page.getByRole("img", { name: labels.editor_image_candidate }))
      .toBeVisible();
    await page.viewport(locale === "ja" ? 768 : 1024, locale === "ja" ? 1024 : 768);
    document.documentElement.style.fontSize = "32px";
    await expect
      .poll(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
      .toBe(true);
    await page.screenshot({
      path: `../../../test-results/browser/tablecast-image-retry-${locale}.png`,
    });
    // When: 同じファイルを再試行する
    await page.getByRole("button", { name: labels.common_retry, exact: true }).click();
    await expect.poll(() => requests.length).toBe(2);
    await page.getByRole("textbox", { name: "商品名", exact: true }).fill("再試行中の料理名");
    finish?.(
      Response.json({
        imageKey: "tablecast/uploads/replacement.webp",
        imageKind: "illustration",
        imageSource: { generated: true, description: "店舗が利用を許可した生成イメージ" },
        url: "/media/tablecast/uploads/replacement.webp",
      }),
    );
    // Then: 成功結果だけを編集値へ反映し、同時編集とfocusを保つ
    await expect
      .element(page.getByRole("status", { name: "編集した参照" }))
      .toHaveTextContent("tablecast/uploads/replacement.webp");
    await expect
      .element(page.getByRole("textbox", { name: "商品名", exact: true }))
      .toHaveValue("再試行中の料理名");
    await expect
      .element(page.getByRole("status", { name: "編集した出所" }))
      .toHaveTextContent('"generated":true');
    await expect.element(page.getByRole("textbox", { name: "商品名", exact: true })).toHaveFocus();
    expect(requests.map((request) => request.get("metadata"))).toEqual([
      JSON.stringify({
        imageKind: "illustration",
        imageSource: { generated: true, description: "店舗が利用を許可した生成イメージ" },
      }),
      JSON.stringify({
        imageKind: "illustration",
        imageSource: { generated: true, description: "店舗が利用を許可した生成イメージ" },
      }),
    ]);
    const remove = page.getByRole("button", { name: labels.editor_image_remove });
    remove.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("status", { name: "編集した参照" }))
      .toHaveTextContent("none");
    await expect.element(page.getByText(labels.editor_image_empty, { exact: true })).toBeVisible();
    await expect.element(page.getByLabelText(labels.editor_image_choose)).toHaveFocus();
  },
);

it("形式・容量・出所・既存参照の不備を示し、現在の参照を変更しない", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  await setup("ja");
  for (const file of [
    new File([], "tablecast-empty.png", { type: "image/png" }),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "tablecast-large.webp", { type: "image/webp" }),
    new File(["svg"], "tablecast.svg", { type: "image/svg+xml" }),
  ]) {
    await page.getByLabelText(ja.editor_image_replace).upload(file);
    await expect.element(page.getByRole("alert")).toHaveTextContent(ja.editor_image_invalid_file);
    await expect
      .element(page.getByRole("status", { name: "編集した参照" }))
      .toHaveTextContent(original.imageKey);
  }
  await page.getByLabelText(ja.editor_image_replace).upload(png);
  await page.getByRole("textbox", { name: ja.editor_image_source, exact: true }).fill("");
  await page.getByRole("button", { name: ja.editor_image_upload }).click();
  await expect.element(page.getByRole("alert")).toHaveTextContent(ja.editor_image_source_required);
  await page.getByRole("combobox", { name: ja.editor_image_method }).selectOptions("existing");
  await page
    .getByRole("textbox", { name: ja.editor_image, exact: true })
    .fill("/Users/tablecast/photo.png");
  await page.getByRole("button", { name: ja.editor_image_apply }).click();
  await expect.element(page.getByRole("alert")).toHaveTextContent(ja.editor_image_invalid_key);
  await expect
    .element(page.getByRole("status", { name: "編集した参照" }))
    .toHaveTextContent(original.imageKey);
  await page
    .getByRole("textbox", { name: ja.editor_image, exact: true })
    .fill("tablecast/menu/new.webp");
  await page.getByRole("button", { name: ja.editor_image_apply }).click();
  await expect
    .element(page.getByRole("status", { name: "編集した参照" }))
    .toHaveTextContent("tablecast/menu/new.webp");
  await expect.element(page.getByText(ja.editor_image_load_error, { exact: true })).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it("移動前の遅い取込結果で別の商品を変更しない", async () => {
  let finish: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  await setup("ja");
  await page.getByLabelText(ja.editor_image_replace).upload(png);
  await page
    .getByRole("textbox", { name: ja.editor_image_source, exact: true })
    .fill("この候補の出所");
  await page.getByRole("button", { name: ja.editor_image_upload }).click();
  await expect.poll(() => finish).toBeDefined();
  await page.getByRole("button", { name: "別の商品へ移動" }).click();
  finish?.(
    Response.json({
      imageKey: "tablecast/uploads/old.webp",
      imageKind: "photograph",
      imageSource: original.imageSource,
      url: "/media/tablecast/uploads/old.webp",
    }),
  );
  await expect.poll(() => client.isMutating()).toBe(0);
  await expect
    .element(page.getByRole("status", { name: "編集した参照" }))
    .toHaveTextContent(original.imageKey);
  await expect
    .element(page.getByRole("textbox", { name: "商品名", exact: true }))
    .toHaveValue("別の商品");
});
