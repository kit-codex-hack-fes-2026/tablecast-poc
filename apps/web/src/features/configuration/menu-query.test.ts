import type { ConfigDraft } from "@tablecast/api/schema";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import { apiFetch } from "../../lib/api-fetch";
import { draftChoicesOptions, draftOptions, receiveDraft, saveDraftOptions } from "./menu-query";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
const storeId = "tablecast-draft-query";
const draft: ConfigDraft = {
  id: "tablecast-draft",
  storeId,
  baseVersion: 1,
  version: 3,
  status: "draft",
  configuration: catalog.configuration,
  errors: [],
  changes: [],
  createdAt: 1,
  updatedAt: 2,
};
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});
afterEach(() => {
  client.clear();
  vi.clearAllMocks();
});

it("受信した下書きだけを保存し、同じ店舗の一覧と選択肢を更新対象にする", () => {
  const otherStoreId = "tablecast-other-store";
  for (const id of [storeId, otherStoreId]) {
    client.setQueryData(["tablecast-drafts", id], { drafts: [] });
    client.setQueryData(draftChoicesOptions(id).queryKey, { pages: [], pageParams: [] });
  }
  receiveDraft(client, storeId, draft);
  expect(client.getQueryData(draftOptions(storeId, draft.id).queryKey)).toEqual(draft);
  expect(client.getQueryData(draftOptions(otherStoreId, draft.id).queryKey)).toBeUndefined();
  for (const key of ["tablecast-drafts", "tablecast-draft-choices"]) {
    expect(client.getQueryState([key, storeId])?.isInvalidated).toBe(true);
    expect(client.getQueryState([key, otherStoreId])?.isInvalidated).toBe(false);
  }
});

it("保存した版と検証済み入力を送り、画面のresetより前にcacheへ応答を反映する", async () => {
  const next = { ...draft, version: 4 };
  const validated = { ...draft.configuration, products: [] };
  const validate = vi.fn<() => typeof validated>(() => validated);
  const onSaved = vi.fn<(received: ConfigDraft) => void>((received) => {
    expect(client.getQueryData(draftOptions(storeId, draft.id).queryKey)).toEqual(received);
  });
  vi.mocked(apiFetch).mockImplementation(async (input, init) => {
    const request = new Request(
      input instanceof Request ? input : new URL(input, "http://tablecast.test"),
      init,
    );
    expect(request.method).toBe("PUT");
    expect(new URL(request.url).pathname).toBe(`/api/admin/stores/${storeId}/drafts/${draft.id}`);
    expect(await request.json()).toEqual({
      expectedVersion: 3,
      configuration: validated,
      instructionFormatVersion: 1,
    });
    return Response.json(next);
  });
  const mutation = new MutationObserver(
    client,
    saveDraftOptions(client, { storeId, id: draft.id, expectedVersion: 3, validate, onSaved }),
  );
  await expect(mutation.mutate(draft.configuration)).resolves.toEqual(next);
  expect(validate).toHaveBeenCalledExactlyOnceWith(draft.configuration);
  expect(onSaved).toHaveBeenCalledExactlyOnceWith(next);
});

it("画面の検証失敗と409はcacheと保存後の入力resetを変更しない", async () => {
  client.setQueryData(draftOptions(storeId, draft.id).queryKey, draft);
  const onSaved = vi.fn<(received: ConfigDraft) => void>();
  const invalid = new Error("CONFIGURATION_INVALID");
  const validation = new MutationObserver(
    client,
    saveDraftOptions(client, {
      storeId,
      id: draft.id,
      expectedVersion: 3,
      validate: () => {
        throw invalid;
      },
      onSaved,
    }),
  );
  await expect(validation.mutate(draft.configuration)).rejects.toBe(invalid);
  expect(apiFetch).not.toHaveBeenCalled();
  vi.mocked(apiFetch).mockResolvedValue(
    Response.json(
      { error: { code: "CONFLICT", message: "版が更新されています" } },
      { status: 409 },
    ),
  );
  const conflict = new MutationObserver(
    client,
    saveDraftOptions(client, { storeId, id: draft.id, expectedVersion: 3, onSaved }),
  );
  await expect(conflict.mutate(draft.configuration)).rejects.toMatchObject({ statusCode: 409 });
  expect(client.getQueryData(draftOptions(storeId, draft.id).queryKey)).toEqual(draft);
  expect(onSaved).not.toHaveBeenCalled();
});
