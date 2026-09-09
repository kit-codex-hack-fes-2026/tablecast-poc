import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { z } from "zod";
import { setupFixture } from "./fixture";
const origin = "http://localhost:3000";
it("プロフィール画像はログインを要求し、画像以外を拒否する", async () => {
  const { cookie } = await setupFixture();
  const body = new FormData();
  body.set(
    "image",
    new File(["<svg onload='alert(1)'/>"], "tablecast.svg", { type: "image/svg+xml" }),
  );
  const denied = await exports.default.fetch(
    new Request(`${origin}/api/account/avatar`, {
      method: "POST",
      headers: { Origin: origin },
      body,
    }),
  );
  expect(denied.status).toBe(401);
  const invalid = await exports.default.fetch(
    new Request(`${origin}/api/account/avatar`, {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie },
      body,
    }),
  );
  expect(invalid.status).toBe(422);
});
it("アップロードした画像が本人のプロフィールと配信URLへ反映される", async () => {
  const { cookie } = await setupFixture();
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG9sAAAAASUVORK5CYII=",
    ),
    (char) => char.charCodeAt(0),
  );
  const body = new FormData();
  body.set("image", new File([png], "tablecast.png", { type: "image/png" }));
  const uploaded = await exports.default.fetch(
    new Request(`${origin}/api/account/avatar`, {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie },
      body,
    }),
  );
  expect(uploaded.status).toBe(200);
  const session = z
    .object({ user: z.object({ image: z.string() }) })
    .parse(
      await (
        await exports.default.fetch(
          new Request(`${origin}/api/auth/get-session`, { headers: { Cookie: cookie } }),
        )
      ).json(),
    );
  const image = await exports.default.fetch(new Request(session.user.image));
  expect(image.headers.get("content-type")).toBe("image/png");
  expect(image.headers.get("x-content-type-options")).toBe("nosniff");
  expect(new Uint8Array(await image.arrayBuffer())).toEqual(png);
});
