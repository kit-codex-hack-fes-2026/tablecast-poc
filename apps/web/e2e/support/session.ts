import { type APIRequestContext, expect } from "@playwright/test";
import { z } from "zod";
import { credentials } from "./runtime";

// 認証がGivenの試験だけで使う。ログイン画面・OAuthそのものの試験は公開操作を本体へ残す。
export async function signInStaff(request: APIRequestContext, origin: string | undefined) {
  if (!origin) throw new Error("runtime fixtureの専用originが必要です。");
  const response = await request.post("/api/auth/sign-in/email", {
    headers: { Origin: origin },
    data: { email: credentials.email, password: credentials.password },
  });
  expect(response.status(), "専用fixtureのスタッフで認証する").toBe(200);
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
