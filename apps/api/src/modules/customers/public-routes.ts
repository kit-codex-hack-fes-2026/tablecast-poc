import { ensure } from "../../platform/errors";
import { apiFactory } from "../../platform/http";
import { imageResponse } from "../media/routes";
import { getMemberStoreBranding } from "./queries";

export const memberStorePublicRoutes = apiFactory
  .createApp()
  .get("/:storeId/identity", async (c) => {
    const store = await getMemberStoreBranding(c.var.services, c.req.param("storeId"));
    c.header("Cache-Control", "public, max-age=300");
    return c.json(
      { storeId: store.id, storeName: store.name, logo: store.branding?.logo ?? null },
      200,
    );
  })
  .get("/:storeId/icon", async (c) => {
    const store = await getMemberStoreBranding(c.var.services, c.req.param("storeId"));
    const width = Number(c.req.query("width"));
    ensure([152, 167, 180, 192, 512].includes(width), "INVALID_INPUT", 400);
    if (!store.branding?.memberIcon) return c.redirect(`/icons/tablecast-${width}.png`, 302);
    const response = await imageResponse(
      c,
      store.id,
      store.branding.memberIcon.imageKey,
      "image/png",
    );
    response.headers.set("Cache-Control", "public, max-age=300");
    return response;
  })
  .get("/:storeId/manifest.webmanifest", async (c) => {
    const store = await getMemberStoreBranding(c.var.services, c.req.param("storeId"));
    const start = `/member/${encodeURIComponent(store.id)}`;
    const icon = store.branding?.memberIcon;
    const manifest = {
      id: start,
      name: store.name,
      short_name: store.name,
      start_url: start,
      scope: "/member/",
      display: "standalone",
      theme_color: "#f7f7f2",
      background_color: "#f7f7f2",
      icons: icon
        ? [192, 512].map((size) => ({
            src: `/api/member-stores/${encodeURIComponent(store.id)}/images/${icon.imageKey}?width=${size}`,
            sizes: `${size}x${size}`,
            type: "image/webp",
            purpose: "any",
          }))
        : [192, 512].map((size) => ({
            src: `/icons/tablecast-${size}.png`,
            sizes: `${size}x${size}`,
            type: "image/png",
            purpose: "any maskable",
          })),
    };
    return c.body(JSON.stringify(manifest), 200, {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
  })
  .get("/:storeId/images/:key{.+}", async (c) => {
    const store = await getMemberStoreBranding(c.var.services, c.req.param("storeId"));
    const key = c.req.param("key");
    ensure(
      [
        store.branding?.logo?.imageKey,
        store.branding?.memberIcon?.imageKey,
        store.branding?.membershipCard?.image?.imageKey,
      ].includes(key),
      "MEDIA_NOT_FOUND",
      404,
    );
    const response = await imageResponse(c, store.id, key);
    response.headers.set("Cache-Control", "public, max-age=300");
    return response;
  });
