import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { ensure } from "../../platform/errors";
import { requireManagerRead } from "../auth/policy";
import { activeConnectionCheckout, requirePosStaff } from "./connections";
import { connectedAdapter } from "./credentials";
import { findPosConnection } from "./queries";

async function deviceAdapter(services: ApiServices, actor: Actor) {
  requireManagerRead(actor);
  const connection = await findPosConnection(services, actor.storeId);
  ensure(connection?.status === "connected", "POS_CONNECTION_REQUIRED", 422);
  const adapter = await connectedAdapter(services, connection);
  ensure(adapter.devices, "POS_UNSUPPORTED", 422);
  return { connection, devices: adapter.devices };
}
export async function getPosDevices(services: ApiServices, actor: Actor, locationId?: string) {
  const { connection, devices } = await deviceAdapter(services, actor);
  const location = locationId ?? connection.locationId;
  ensure(location, "POS_LOCATION_REQUIRED", 422);
  return { devices: await devices.list(location), canPair: connection.mode === "live" };
}
export async function createPosDeviceCode(
  services: ApiServices,
  actor: Actor,
  input: {
    idempotencyKey: string;
    locationId: string;
    name: string;
  },
) {
  requirePosStaff(actor, true);
  const { connection, devices } = await deviceAdapter(services, actor);
  ensure(connection.mode === "live", "POS_UNSUPPORTED", 422);
  ensure(
    (await activeConnectionCheckout(services, connection.id).limit(1)).length === 0,
    "POS_CHECKOUT_LOCKED",
  );
  return devices.createCode(input.locationId, input.name, input.idempotencyKey);
}
export async function getPosDeviceCode(services: ApiServices, actor: Actor, id: string) {
  requirePosStaff(actor, true);
  const { connection, devices } = await deviceAdapter(services, actor);
  ensure(connection.mode === "live", "POS_UNSUPPORTED", 422);
  return devices.getCode(id);
}
