import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { z } from "zod";
import ja from "../../messages/ja.json" with { type: "json" };
import { credentials } from "./runtime";

const mailpitOrigins = new Map<string, string>();
const usedMessages = new Set<string>();
export function registerTestMailpit(origin: string, mailpit: string) {
  mailpitOrigins.set(origin, mailpit);
}
async function readMagicLink(
  request: APIRequestContext,
  origin: string | undefined,
  email: string,
) {
  const mailpit = origin && mailpitOrigins.get(origin);
  if (!mailpit) throw new Error("runtimeのMailpitが未登録です。");
  let id: string | undefined;
  await expect
    .poll(async () => {
      const messages = z
        .object({
          messages: z.array(
            z.object({
              ID: z.string(),
              Subject: z.string(),
              To: z.array(z.object({ Address: z.string() })),
            }),
          ),
        })
        .parse(await (await request.get(`${mailpit}/api/v1/messages`)).json());
      id = messages.messages.find(
        (mail) =>
          !usedMessages.has(`${origin}:${mail.ID}`) &&
          mail.To.some((to) => to.Address === email) &&
          (mail.Subject.includes("ログイン") || mail.Subject.includes("Sign in")),
      )?.ID;
      return id;
    })
    .toBeTruthy();
  const mail = z
    .object({ HTML: z.string() })
    .parse(await (await request.get(`${mailpit}/api/v1/message/${id}`)).json());
  const url = mail.HTML.match(
    /href="([^"]*\/api\/auth\/magic-link\/verify[^"]+)"/,
  )?.[1]?.replaceAll("&amp;", "&");
  if (!url) throw new Error("ログインリンクがありません。");
  usedMessages.add(`${origin}:${id}`);
  return url;
}
// 認証がGivenの試験は実配送・実リンク検証でCookieを取得する。
export async function signInStaff(
  request: APIRequestContext,
  origin: string | undefined,
  email = credentials.email,
) {
  if (!origin) throw new Error("runtime fixtureの専用originが必要です。");
  const response = await request.post("/api/auth/sign-in/magic-link", {
    headers: { Origin: origin },
    data: { email, callbackURL: "/account" },
  });
  expect(response.status()).toBe(200);
  const verified = await request.get(await readMagicLink(request, origin, email), {
    maxRedirects: 0,
  });
  expect(verified.status()).toBe(302);
}

// 認証画面がWhenのjourneyは実フォーム・配送・Cookie・document遷移を通す。
export async function signInFromLogin(
  page: Page,
  origin: string | undefined,
  email = credentials.email,
) {
  await page.getByLabel(ja.auth_email, { exact: true }).fill(email);
  await page.getByRole("button", { name: ja.auth_send_magic_link }).click();
  await page.goto(await readMagicLink(page.request, origin, email));
}

// 端末承認がGivenの試験用。実HTTPとguest自身のCookieを使い、代表journeyはUI操作を残す。
export async function approveGuestDevice(
  guest: APIRequestContext,
  staff: APIRequestContext,
  options: { origin: string | undefined; storeId: string; tableId: string },
) {
  if (!options.origin) throw new Error("runtime fixtureの専用originが必要です。");
  const headers = { Origin: options.origin };
  const requested = await guest.post("/api/devices/request", { headers });
  expect(requested.status(), "客自身の端末コードを発行する").toBe(200);
  const codes = z
    .object({ user_code: z.string(), device_code: z.string() })
    .parse(await requested.json());
  const approved = await staff.post(`/api/admin/stores/${options.storeId}/devices/approve`, {
    headers,
    data: { userCode: codes.user_code, tableId: options.tableId },
  });
  expect(approved.status(), "スタッフが対象卓への端末接続を承認する").toBe(200);
  const polled = await guest.post("/api/devices/poll", {
    headers,
    data: { device_code: codes.device_code },
  });
  expect(polled.status(), "客自身のHTTP応答で端末Cookieを受け取る").toBe(200);
  expect(await polled.json(), "承認待ちの200を接続完了と扱わない").toEqual({ ready: true });
}
