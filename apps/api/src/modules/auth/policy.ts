import { ensure } from "../../platform/errors";
import type { Actor } from "./model";
export function requireManagerRead(actor: Actor) {
  ensure(
    (actor.kind === "staff" || actor.kind === "mcp") &&
      ["owner", "admin"].includes(actor.role ?? ""),
    "ADMIN_REQUIRED",
    403,
  );
}
export function requireManager(actor: Actor) {
  requireManagerRead(actor);
  if (actor.kind === "mcp") ensure(actor.canWrite, "WRITE_SCOPE_REQUIRED", 403);
}
