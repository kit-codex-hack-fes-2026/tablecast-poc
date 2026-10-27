import { createFileRoute, redirect } from "@tanstack/react-router";
import { getLocale } from "../paraglide/runtime.js";

export const Route = createFileRoute("/help/")({
  beforeLoad: () => {
    throw redirect({ to: "/help/$lang/$", params: { lang: getLocale(), _splat: "" } });
  },
});
