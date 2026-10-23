import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PasskeySetup } from "../features/account/passkey-setup";
export const Route = createFileRoute("/passkey-setup")({
  validateSearch: z.object({ returnTo: z.string().optional() }),
  component: PasskeySetup,
});
