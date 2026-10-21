import { describe, expect, it } from "vitest";
import { readDeviceQrCode } from "./device-qr-code";

describe("端末登録QRの受け入れ境界", () => {
  const origin = "https://tablecast.example.test";
  it("同じ環境の登録URLからコードだけを取り出す", () => {
    expect(readDeviceQrCode(`${origin}/device?user_code=abcd-1234&tableId=other`, origin)).toBe(
      "ABCD-1234",
    );
  });
  it.each([
    "https://other.example.test/device?user_code=ABCD1234",
    `${origin}/login?user_code=ABCD1234`,
    `${origin}/device?user_code=ABCD1234&user_code=EFGH5678`,
    `${origin}/device?user_code=`,
    `${origin}/device?user_code=%3Cscript%3E`,
    "https://user:password@tablecast.example.test/device?user_code=ABCD1234",
    "ABCD1234",
  ])("無関係または曖昧なQRを拒否する: %s", (value) => {
    expect(readDeviceQrCode(value, origin)).toBeNull();
  });
});
