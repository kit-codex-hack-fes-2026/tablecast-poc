import { expect, it } from "vitest";
import { createSquareAdapter } from "../src/modules/pos/square";
import { transport } from "./pos-square-fixture";

it("本番の選択店舗にpairedした端末を全pageから取得し、Terminal用deviceIdを返す", async () => {
  const wire = transport([
    {
      body: {
        cursor: "next-device",
        device_codes: [
          {
            id: "code-a",
            name: "レジ1",
            status: "PAIRED",
            product_type: "TERMINAL_API",
            device_id: "serial-a",
            location_id: "location",
          },
          {
            id: "code-pending",
            status: "UNPAIRED",
            product_type: "TERMINAL_API",
            location_id: "location",
          },
          {
            id: "other-location",
            status: "PAIRED",
            product_type: "TERMINAL_API",
            device_id: "serial-other",
            location_id: "elsewhere",
          },
        ],
      },
    },
    {
      body: {
        device_codes: [
          {
            id: "code-b",
            name: "レジ2",
            status: "PAIRED",
            product_type: "TERMINAL_API",
            device_id: "serial-b",
            location_id: "location",
          },
          {
            id: "code-again",
            name: "レジ1",
            status: "PAIRED",
            product_type: "TERMINAL_API",
            device_id: "serial-a",
            location_id: "location",
          },
        ],
      },
    },
  ]);
  await expect(
    createSquareAdapter("token", { fetch: wire.fetch }).devices.list("location"),
  ).resolves.toEqual([
    { id: "serial-a", name: "レジ1", locationId: "location" },
    { id: "serial-b", name: "レジ2", locationId: "location" },
  ]);
  expect(wire.calls[0]?.url.origin).toBe("https://connect.squareup.com");
  expect(wire.calls[0]?.url.pathname).toBe("/v2/devices/codes");
  expect(wire.calls[0]?.url.searchParams.get("location_id")).toBe("location");
  expect(wire.calls[0]?.url.searchParams.get("status")).toBe("PAIRED");
  expect(wire.calls[0]?.url.searchParams.get("product_type")).toBe("TERMINAL_API");
  expect(wire.calls[1]?.url.searchParams.get("cursor")).toBe("next-device");
});

it("本番のpairing codeを正規wireで作り、有効期限とpaired deviceを再照会する", async () => {
  const pairBy = "2026-10-29T01:05:00Z";
  const base = {
    id: "code",
    code: "ABCDEF",
    product_type: "TERMINAL_API",
    location_id: "location",
    pair_by: pairBy,
  };
  const wire = transport([
    { body: { device_code: { ...base, status: "UNPAIRED" } } },
    { body: { device_code: { ...base, status: "PAIRED", device_id: "serial-a" } } },
  ]);
  const adapter = createSquareAdapter("token", { fetch: wire.fetch });
  await expect(adapter.devices.createCode("location", "レジ1", "pairing-key")).resolves.toEqual({
    id: "code",
    code: "ABCDEF",
    status: "pending",
    deviceId: null,
    expiresAt: Date.parse(pairBy),
  });
  expect(wire.calls[0]?.body).toEqual({
    idempotency_key: "pairing-key",
    device_code: { name: "レジ1", product_type: "TERMINAL_API", location_id: "location" },
  });
  await expect(adapter.devices.getCode("code")).resolves.toMatchObject({
    id: "code",
    status: "paired",
    deviceId: "serial-a",
  });
  expect(wire.calls[1]?.url.pathname).toBe("/v2/devices/codes/code");
});

it("テスト環境では固定端末1台だけを返し、実機pairing codeの作成・照会を拒否する", async () => {
  const wire = transport([]);
  const adapter = createSquareAdapter("token", { environment: "sandbox", fetch: wire.fetch });
  await expect(adapter.devices.list("location")).resolves.toEqual([
    { id: "9fa747a2-25ff-48ee-b078-04381f7c828f", name: "レジ端末", locationId: "location" },
  ]);
  await expect(adapter.devices.createCode("location", "レジ1", "key")).rejects.toMatchObject({
    code: "POS_UNSUPPORTED",
    status: 422,
  });
  await expect(adapter.devices.getCode("code")).rejects.toMatchObject({
    code: "POS_UNSUPPORTED",
    status: 422,
  });
  expect(wire.fetch).not.toHaveBeenCalled();
});
