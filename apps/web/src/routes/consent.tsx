import { createFileRoute } from "@tanstack/react-router";
import { Consent } from "../features/account/consent";

export const Route = createFileRoute("/consent")({
  staticData: { document: { title: "oauth_title", description: "head_consent_description" } },
  component: () => <Consent />,
});
