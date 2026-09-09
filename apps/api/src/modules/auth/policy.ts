import { ensure } from "../../platform/errors";
import type { Actor } from "./model";
export function requireManager(actor: Actor) {
  ensure(
    (actor.kind === "staff" || actor.kind === "mcp") &&
      ["owner", "admin"].includes(actor.role ?? ""),
    "ADMIN_REQUIRED",
    403,
  );
  if (actor.kind === "mcp") ensure(actor.canWrite, "WRITE_SCOPE_REQUIRED", 403);
}
