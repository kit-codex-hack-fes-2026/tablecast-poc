import { expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { createApiServices } from "../src/platform/context";
import { notifyStore } from "../src/modules/tables/mutations";
import { diagnosticSecrets, errorAttributes } from "../src/platform/diagnostics";
import { DomainError } from "../src/platform/errors";

it("原因に資格情報があるとき、診断メッセージを残し秘密値と絶対パスを除く", () => {
  // Given: 既知の環境secret、認証、個人情報、URLを含むエラー。
  const error = new Error(
    'connection failed env-private Bearer request-private user@example.com https://private.example/?token=hidden "private-name"',
  );
  error.stack = `${error.name}: ${error.message}\n    at send (/Users/private/request.ts:12:8)`;
  // When: 要求・環境のsecretを指定して診断へ変換する。
  const attributes = errorAttributes(
    error,
    diagnosticSecrets({ TABLECAST_AUTH_SECRET: "env-private" }),
  );
  // Then: 発生位置と非秘密の説明を残す。
  expect(attributes["exception.message"]).toContain("connection failed");
  expect(attributes["exception.stacktrace"]).toContain("request.ts:12:8");
  expect(JSON.stringify(attributes)).not.toMatch(/private|user@example|\/Users/);
});

it.each([
  {
    label: "JSONの引用符とエスケープ",
    message: `Provider failed: ${JSON.stringify({
      access_token: 'private-access with "quotes" and \\slashes',
      refresh_token: "private-refresh",
      api_key: "private-api",
      password: "private-password with spaces, commas; and newlines\nend",
      authorization: "private-authorization",
      cookie: "private-cookie; another=private-second",
      status: "failed",
    })}`,
  },
  {
    label: "一重引用符と代入形式",
    message:
      "Provider failed: {'token': 'private-token with spaces', 'secret': 'private-secret'} code=private-code status=failed",
  },
])("本文収集ONでも$label内の資格をcauseとstackから除く", ({ message }) => {
  // Given: 環境bindingに含まれないprovider資格が説明付きpayloadに入っている。
  const error = new Error(message, { cause: new Error(message) });
  // When: 本文収集を有効にして診断を作る。
  const attributes = errorAttributes(error, [], true);
  // Then: 説明と非秘密の状態を残し、例外・stack・causeのすべてから資格を除く。
  expect(attributes["exception.message"]).toContain("Provider failed:");
  expect(attributes["exception.message"]).toContain("failed");
  expect(attributes["tablecast.error.causes"]).toBeDefined();
  expect(JSON.stringify(attributes)).not.toMatch(/private-|quotes|slashes|spaces|commas|newlines/);
});

it("provider例外をcauseに持つ場合、会話を含み得るメッセージを送信しない", () => {
  const provider = new TypeError("お客様の会話を含む外部エラー");
  const error = new DomainError("VOICE_MODEL_FAILED", 503, "VOICE_MODEL_FAILED", undefined, {
    cause: provider,
  });
  const attributes = errorAttributes(error);
  expect(attributes["exception.message"]).toBe("VOICE_MODEL_FAILED");
  expect(attributes["tablecast.error.causes"]).toContain("TypeError");
  expect(attributes["tablecast.error.causes"]).toContain("REDACTED_PROVIDER_MESSAGE");
  expect(JSON.stringify(attributes)).not.toContain("お客様");
});

it("循環するcauseやError以外のthrowでも診断を終了する", () => {
  const error = new Error("cyclic failure");
  error.cause = error;
  expect(errorAttributes(error)["exception.message"]).toBe("cyclic failure");
  expect(errorAttributes(error)).not.toHaveProperty("tablecast.error.causes");
  expect(errorAttributes({ password: "private" })).toMatchObject({
    "exception.type": "NonError",
    "exception.message": "[REDACTED_NON_ERROR]",
  });
});

it("通知用DBの読取が失敗しても確定済み業務結果を取り消さず要求IDと原因を記録する", async () => {
  const services = createApiServices(env, "tablecast-notification-request");
  const logged = vi.spyOn(console, "warn").mockImplementation(() => {});
  const read = vi.spyOn(services.db, "get").mockRejectedValueOnce(new Error("D1 unavailable"));
  try {
    await expect(notifyStore(services, "tablecast-store")).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]?.[0])).toContain("tablecast-notification-request");
    expect(String(logged.mock.calls[0]?.[0])).toContain("D1 unavailable");
  } finally {
    read.mockRestore();
    logged.mockRestore();
  }
});
