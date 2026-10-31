import { expect, it, vi } from "vitest";
import ja from "../../../messages/ja.json";
import "../../styles.css";
import {
  base,
  draftId,
  fixture,
  open,
  otherStoreId,
  storeId,
} from "./test-support/configuration-workflow-fixture";

it.each(["閉じて開き直す", "店舗を切り替える"])(
  "新規下書きの作成中に%sと、遅延応答で元の編集先へ移動しない",
  async (action) => {
    const pending = Promise.withResolvers<void>();
    fixture.waitForCreate = pending.promise;
    const { screen, router } = await open(`${base}/products`);
    await screen.getByRole("button", { name: ja.menu_start_editing, exact: true }).click();
    const choice = screen.getByRole("dialog", { name: ja.workflow_choose_title, exact: true });
    await choice.getByRole("button", { name: ja.editor_create_draft, exact: true }).click();
    await expect
      .element(choice.getByRole("button", { name: ja.workflow_saving, exact: true }))
      .toBeDisabled();
    await choice.getByRole("button", { name: ja.common_close, exact: true }).click();
    const destination =
      action === "店舗を切り替える"
        ? `/admin/stores/${otherStoreId}/menu/products`
        : `${base}/products`;
    if (action === "店舗を切り替える") {
      await router.navigate({
        to: "/admin/stores/$storeId/menu/$section",
        params: { storeId: otherStoreId, section: "products" },
      });
    } else {
      await screen.getByRole("button", { name: ja.menu_start_editing, exact: true }).click();
    }
    pending.resolve();
    await expect.poll(() => fixture.client.isMutating()).toBe(0);
    expect(router.state.location.pathname).toBe(destination);
    expect(
      fixture.client.getQueryData(["tablecast-draft", storeId, "tablecast-created-draft"]),
    ).toMatchObject({ id: "tablecast-created-draft" });
    expect(fixture.requests.filter((request) => request.method === "POST")).toHaveLength(1);
  },
);

it.each([
  { action: "取消", label: ja.workflow_revert },
  { action: "再読込", label: ja.workflow_conflict_reload },
])(
  "画像取込中の$actionを待機し、取込完了後に保存値へ戻して古い入力を再適用しない",
  async ({ action, label }) => {
    const product = fixture.current.configuration.products[0];
    if (!product) throw new Error("商品fixtureが必要です");
    product.imageKey = null;
    const originalPrice = product.price;
    const pending = Promise.withResolvers<void>();
    fixture.waitForImage = pending.promise;
    const { screen, router } = await open(`${base}/changes/${draftId}/products/${product.id}`);
    const price = screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true });
    if (action === "再読込") {
      await price.fill("777");
      fixture.saveFailure = 409;
      await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
    }
    const restore = screen.getByRole("button", { name: label, exact: true });
    const writesBeforeUpload = fixture.requests.filter(
      (request) => request.method === "PUT",
    ).length;
    const imageField = screen
      .getByRole("group", { name: ja.editor_image_settings, exact: true })
      .first();
    await imageField
      .getByLabelText(ja.editor_image_choose)
      .upload(
        new File(
          [
            Uint8Array.fromBase64(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
            ),
          ],
          "tablecast-dish.png",
          { type: "image/png" },
        ),
      );
    await imageField
      .getByRole("textbox", { name: ja.editor_image_source, exact: true })
      .fill("店舗の料理写真");
    await imageField.getByRole("button", { name: ja.editor_image_upload, exact: true }).click();
    await expect
      .element(imageField.getByRole("status").filter({ hasText: ja.form_submitting }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: ja.workflow_review, exact: true }))
      .toBeDisabled();
    await price.fill("777");
    await expect.element(restore).toBeDisabled();
    await expect
      .element(screen.getByRole("button", { name: ja.common_save, exact: true }))
      .toBeDisabled();

    const formElement = price.element().closest("form");
    if (!formElement) throw new Error("商品の実フォームが必要です");
    formElement.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await screen
      .getByRole("main")
      .getByRole("link", { name: ja.editor_products, exact: true })
      .click();
    expect(confirm).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe(
      `${base}/changes/${draftId}/products/${product.id}`,
    );
    pending.resolve();
    await expect.poll(() => fixture.client.isMutating()).toBe(0);
    await expect.element(price).toHaveValue(777);
    expect(fixture.requests.filter((request) => request.method === "PUT")).toHaveLength(
      writesBeforeUpload,
    );
    await restore.click();
    await screen.getByRole("alertdialog").getByRole("button", { name: label, exact: true }).click();
    await expect.element(price).toHaveValue(originalPrice);
    await expect
      .element(imageField.getByText(ja.editor_image_empty, { exact: true }))
      .toBeVisible();
  },
);

it("再読込の失敗時は画像候補を保持し、GET待機中は編集を止め、成功後に候補を破棄して再開できる", async () => {
  const product = fixture.current.configuration.products[0];
  if (!product) throw new Error("商品fixtureが必要です");
  product.imageKey = null;
  const { screen } = await open(`${base}/changes/${draftId}/products/${product.id}`);
  const price = screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true });
  const save = screen.getByRole("button", { name: ja.common_save, exact: true });
  const imageField = screen
    .getByRole("group", { name: ja.editor_image_settings, exact: true })
    .first();
  const imageFile = imageField.getByLabelText(ja.editor_image_choose);
  await imageFile.upload(
    new File(
      [
        Uint8Array.fromBase64(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
        ),
      ],
      "tablecast-reload.png",
      { type: "image/png" },
    ),
  );
  await imageField
    .getByRole("textbox", { name: ja.editor_image_source, exact: true })
    .fill("店舗の料理写真");
  const upload = imageField.getByRole("button", { name: ja.editor_image_upload, exact: true });
  await price.fill("777");
  fixture.saveFailure = 409;
  await save.click();
  await screen.getByRole("button", { name: ja.workflow_conflict_reload, exact: true }).click();
  fixture.draftReadFailure = 503;
  await screen
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.workflow_conflict_reload, exact: true })
    .click();
  await expect.poll(() => fixture.client.isMutating()).toBe(0);
  await expect.element(price).toHaveValue(777);
  await expect.element(upload).toBeEnabled();
  await expect.element(imageField.getByText("tablecast-reload.png", { exact: true })).toBeVisible();
  fixture.draftReadFailure = 0;
  await screen.getByRole("button", { name: ja.workflow_conflict_reload, exact: true }).click();
  const pending = Promise.withResolvers<void>();
  fixture.waitForDraftRead = pending.promise;
  fixture.current = {
    ...fixture.current,
    version: 8,
    configuration: {
      ...fixture.current.configuration,
      products: fixture.current.configuration.products.map((item) =>
        item.id === product.id ? { ...item, price: 900 } : item,
      ),
    },
  };
  await screen
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.workflow_conflict_reload, exact: true })
    .click();
  await expect
    .poll(
      () =>
        fixture.requests.filter(
          (request) => request.method === "GET" && request.url.endsWith(`/drafts/${draftId}`),
        ).length,
    )
    .toBe(3);
  await expect.element(imageFile).toBeDisabled();
  await expect.element(upload).toBeDisabled();
  await expect.element(price).toBeDisabled();
  await expect.element(save).toBeDisabled();
  const formElement = price.element().closest("form");
  if (!formElement) throw new Error("商品の実フォームが必要です");
  formElement.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  pending.resolve();
  await expect.element(price).toHaveValue(900);
  await expect.element(price).toBeEnabled();
  await expect.element(imageFile).toBeEnabled();
  await expect.element(upload).not.toBeInTheDocument();
  await expect
    .element(imageField.getByText("tablecast-reload.png", { exact: true }))
    .not.toBeInTheDocument();
  expect(fixture.requests.filter((request) => request.url.endsWith("/images"))).toHaveLength(0);
  expect(fixture.requests.filter((request) => request.method === "PUT")).toHaveLength(1);
  await imageFile.upload(
    new File(
      [
        Uint8Array.fromBase64(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
        ),
      ],
      "tablecast-after-reload.png",
      { type: "image/png" },
    ),
  );
  await imageField
    .getByRole("textbox", { name: ja.editor_image_source, exact: true })
    .fill("店舗の料理写真");
  await upload.click();
  await expect
    .element(imageField.getByRole("status").filter({ hasText: ja.editor_image_uploaded }))
    .toBeVisible();
  await price.fill("901");
  fixture.saveFailure = 0;
  await save.click();
  await expect.element(screen.getByText(ja.account_saved, { exact: true })).toBeVisible();
  expect(
    fixture.current.configuration.products.find((item) => item.id === product.id),
  ).toMatchObject({
    price: 901,
    imageKey: "tablecast/uploads/workflow-upload.png",
  });
});

it.each(["ファイル候補", "既存参照と出典"])(
  "未適用の%sだけでも変更確認を止め、取消の承認後に画像内の入力も破棄する",
  async (input) => {
    const product = fixture.current.configuration.products[0];
    if (!product) throw new Error("商品fixtureが必要です");
    product.imageKey = null;
    product.imageSource = undefined;
    const { screen } = await open(`${base}/changes/${draftId}/products/${product.id}`);
    const imageField = screen
      .getByRole("group", { name: ja.editor_image_settings, exact: true })
      .first();
    const review = screen.getByRole("link", { name: ja.workflow_review, exact: true });
    const save = screen.getByRole("button", { name: ja.common_save, exact: true });
    if (input === "ファイル候補") {
      await imageField
        .getByLabelText(ja.editor_image_choose)
        .upload(
          new File(
            [
              Uint8Array.fromBase64(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
              ),
            ],
            "tablecast-staged.png",
            { type: "image/png" },
          ),
        );
    } else {
      await imageField
        .getByRole("combobox", { name: ja.editor_image_method, exact: true })
        .selectOptions("existing");
      await imageField
        .getByRole("textbox", { name: ja.editor_image, exact: true })
        .fill("tablecast/uploads/staged.webp");
    }
    await imageField
      .getByRole("textbox", { name: ja.editor_image_source, exact: true })
      .fill("未適用の出典");
    await expect.element(review).toBeDisabled();
    await expect.element(save).toBeDisabled();
    await expect.element(save).toHaveAttribute("data-pwa-blocked", "true");
    await expect.element(screen.getByText(ja.editor_image_staged, { exact: true })).toBeVisible();
    const restore = screen.getByRole("button", { name: ja.workflow_revert, exact: true });
    await restore.click();
    await screen
      .getByRole("alertdialog")
      .getByRole("button", { name: ja.common_cancel, exact: true })
      .click();
    await expect
      .element(imageField.getByRole("textbox", { name: ja.editor_image_source, exact: true }))
      .toHaveValue("未適用の出典");
    await expect.element(review).toBeDisabled();
    await restore.click();
    await screen
      .getByRole("alertdialog")
      .getByRole("button", { name: ja.workflow_revert, exact: true })
      .click();
    await expect.element(restore).not.toBeInTheDocument();
    await expect.element(review).toBeEnabled();
    await expect.element(save).toHaveAttribute("data-pwa-blocked", "false");
    await expect
      .element(imageField.getByText("tablecast-staged.png", { exact: true }))
      .not.toBeInTheDocument();
    await imageField
      .getByRole("combobox", { name: ja.editor_image_method, exact: true })
      .selectOptions("existing");
    await expect
      .element(imageField.getByRole("textbox", { name: ja.editor_image, exact: true }))
      .toHaveValue("");
    await expect
      .element(imageField.getByRole("textbox", { name: ja.editor_image_source, exact: true }))
      .toHaveValue("");
    expect(fixture.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
  },
);
