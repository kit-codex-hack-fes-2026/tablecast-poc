import { type ConfigDraft, configurationSchema } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { z } from "zod";
import { catalog } from "../../../../.storybook/tablecast-fixtures";
import { MotionProvider } from "../../../components/motion-provider";
import { LocaleProvider } from "../../../i18n/locale";
import "../../../styles.css";
import { MenuCollection } from "../../catalog/menu-collection";
import { MenuItem } from "../../catalog/menu-item";
import { StoreShell } from "../../store/store-shell";
import { DraftPage } from "../configuration-draft-page";
import { menuSectionSchema } from "../menu-model";

let client: QueryClient;

let current: ConfigDraft;

let unexpected: string[];

let requests: Request[];

let saveFailure = 0;

let publishFailure = 0;

let draftReadFailure = 0;

let waitForSave: Promise<void> | undefined;

let waitForCreate: Promise<void> | undefined;

let waitForImage: Promise<void> | undefined;

let waitForDraftRead: Promise<void> | undefined;

let publishedVersion = 1;

export const storeId = "tablecast-workflow-store";

export const otherStoreId = "tablecast-workflow-other-store";

export const draftId = "tablecast-workflow-draft";

export const base = `/admin/stores/${storeId}/menu`;

const api = `/api/admin/stores/${storeId}`;

const inputSchema = z.object({ expectedVersion: z.number(), configuration: configurationSchema });

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["tablecast-session"], null);
  client.setQueryData(["tablecast-stores"], {
    stores: [
      { id: storeId, name: "試験店舗", logo: null, role: "owner", organizationId: "tablecast-org" },
      {
        id: otherStoreId,
        name: "切替先店舗",
        logo: null,
        role: "owner",
        organizationId: "tablecast-org",
      },
    ],
  });
  current = {
    id: draftId,
    storeId,
    baseVersion: 1,
    version: 2,
    status: "draft",
    configuration: structuredClone(catalog.configuration),
    errors: [],
    changes: [{ path: "cast.proactive", before: false, after: true, sensitive: false }],
    createdAt: 1,
    updatedAt: 2,
  };
  requests = [];
  unexpected = [];
  saveFailure = 0;
  publishFailure = 0;
  draftReadFailure = 0;
  waitForSave = undefined;
  waitForCreate = undefined;
  waitForImage = undefined;
  waitForDraftRead = undefined;
  publishedVersion = 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path === "/api/auth/organization/get-full-organization") return Response.json(null);
      if (path === `${api}/voices`)
        return Response.json({
          voices: [
            { voiceId: "marin", displayName: "Marin", langCode: "ja" },
            { voiceId: "cedar", displayName: "Cedar", langCode: "en" },
          ],
          nextPageToken: null,
        });
      if (path === `/api/admin/stores/${otherStoreId}/catalog`)
        return Response.json({ ...catalog, storeId: otherStoreId });
      if (path === `${api}/catalog`)
        return Response.json({
          ...catalog,
          storeId,
          version: current.status === "published" ? 2 : publishedVersion,
        });
      if (path === "/api/admin/stores")
        return Response.json(client.getQueryData(["tablecast-stores"]));
      if (path === `${api}/images` && request.method === "POST") {
        await waitForImage;
        return Response.json({
          imageKey: "tablecast/uploads/workflow-upload.png",
          imageKind: "photograph",
          imageSource: { generated: false, description: "店舗の料理写真" },
          url: "/media/tablecast/uploads/workflow-upload.png",
        });
      }
      if (path === `${api}/drafts/choices`)
        return Response.json({
          drafts: [
            {
              id: draftId,
              baseVersion: 1,
              version: 2,
              status: "draft",
              updatedAt: 2,
              sections: ["products"],
              changeCount: 1,
            },
          ],
          publishedVersion: 1,
          nextCursor: null,
        });
      if (path === `${api}/drafts` && request.method === "POST") {
        await waitForCreate;
        current = { ...current, id: "tablecast-created-draft" };
        return Response.json(current);
      }
      if (path === `${api}/drafts` && request.method === "GET")
        return Response.json({ drafts: [current] });
      if (path === `${api}/drafts/${current.id}` && request.method === "GET") {
        await waitForDraftRead;
        if (draftReadFailure)
          return Response.json({ error: { code: "UNAVAILABLE" } }, { status: draftReadFailure });
        return Response.json(current);
      }
      if (path === `${api}/drafts/${current.id}` && request.method === "PUT") {
        await waitForSave;
        if (saveFailure)
          return Response.json(
            { error: { code: saveFailure === 409 ? "DRAFT_CONFLICT" : "UNAVAILABLE" } },
            { status: saveFailure },
          );
        const saved = inputSchema.parse(await request.json());
        current = {
          ...current,
          version: saved.expectedVersion + 1,
          configuration: saved.configuration,
          status: "draft",
        };
        return Response.json(current);
      }
      if (path === `${api}/drafts/${current.id}/validate`) {
        current = { ...current, status: "ready", version: current.version + 1 };
        return Response.json(current);
      }
      if (path === `${api}/drafts/${current.id}/publish`) {
        if (publishFailure)
          return Response.json({ error: { code: "DRAFT_CONFLICT" } }, { status: publishFailure });
        current = { ...current, status: "published" };
        return Response.json(current);
      }
      if (path === `${api}/drafts/${current.id}/discard`) {
        current = { ...current, status: "discarded" };
        return Response.json(current);
      }
      unexpected.push(`${request.method} ${path}`);
      return Response.json({ error: { code: "UNEXPECTED_REQUEST" } }, { status: 500 });
    }),
  );
});

afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});

export async function open(path: string, locale: "en" | "ja" = "ja") {
  const root = createRootRoute({ component: Outlet });
  const store = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId",
  });
  store.update({
    component: () => <StoreShell storeId={store.useParams<typeof router>().storeId} />,
  });
  const item = createRoute({
    getParentRoute: () => store,
    path: "menu/changes/$draftId/$section/$itemId",
  });
  item.update({
    component: () => {
      const params = item.useParams<typeof router>();
      return (
        <MenuItem
          section={menuSectionSchema.parse(params.section)}
          itemId={params.itemId}
          draftId={params.draftId}
        />
      );
    },
  });
  const review = createRoute({ getParentRoute: () => store, path: "menu/changes/$draftId" });
  review.update({
    component: () => (
      <DraftPage
        search={{}}
        key={review.useParams<typeof router>().draftId}
        draftId={review.useParams<typeof router>().draftId}
      />
    ),
  });
  const collection = createRoute({ getParentRoute: () => store, path: "menu/$section" });
  collection.update({
    component: () => (
      <MenuCollection
        section={menuSectionSchema.parse(collection.useParams<typeof router>().section)}
      />
    ),
  });
  const draftCollection = createRoute({
    getParentRoute: () => store,
    path: "menu/changes/$draftId/$section",
  });
  draftCollection.update({
    component: () => (
      <MenuCollection
        section={menuSectionSchema.parse(draftCollection.useParams<typeof router>().section)}
        draftId={draftCollection.useParams<typeof router>().draftId}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([store.addChildren([item, review, collection, draftCollection])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  const screen = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { screen, router };
}

export const fixture = {
  get current() {
    return current;
  },
  set current(value: typeof current) {
    current = value;
  },
  get saveFailure() {
    return saveFailure;
  },
  set saveFailure(value: typeof saveFailure) {
    saveFailure = value;
  },
  get waitForSave() {
    return waitForSave;
  },
  set waitForSave(value: typeof waitForSave) {
    waitForSave = value;
  },
  get client() {
    return client;
  },
  set client(value: typeof client) {
    client = value;
  },
  get requests() {
    return requests;
  },
  set requests(value: typeof requests) {
    requests = value;
  },
  get publishedVersion() {
    return publishedVersion;
  },
  set publishedVersion(value: typeof publishedVersion) {
    publishedVersion = value;
  },
  get publishFailure() {
    return publishFailure;
  },
  set publishFailure(value: typeof publishFailure) {
    publishFailure = value;
  },
  get waitForCreate() {
    return waitForCreate;
  },
  set waitForCreate(value: typeof waitForCreate) {
    waitForCreate = value;
  },
  get waitForImage() {
    return waitForImage;
  },
  set waitForImage(value: typeof waitForImage) {
    waitForImage = value;
  },
  get draftReadFailure() {
    return draftReadFailure;
  },
  set draftReadFailure(value: typeof draftReadFailure) {
    draftReadFailure = value;
  },
  get waitForDraftRead() {
    return waitForDraftRead;
  },
  set waitForDraftRead(value: typeof waitForDraftRead) {
    waitForDraftRead = value;
  },
};
