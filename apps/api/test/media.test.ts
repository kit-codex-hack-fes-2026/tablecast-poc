import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("R2の商品画像を公式Images binding経由のWebPとして配信する", async () => {
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    ),
    (character) => character.charCodeAt(0),
  );
  await env.TABLECAST_MEDIA.put("tablecast/demo/tablecast-test.png", png, {
    httpMetadata: { contentType: "image/png" },
  });
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/media/tablecast/demo/tablecast-test.png"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/webp");
  expect(response.headers.get("ETag")).toContain("640-webp");
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect(
    (
      await exports.default.fetch(
        new Request("http://localhost:3000/media/tablecast/demo/missing.png"),
      )
    ).status,
  ).toBe(404);
});
