import { createFileRoute } from "@tanstack/react-router";
import { Consent } from "../features/account/consent";

export const Route = createFileRoute("/consent")({
  // 署名付きOAuth queryを再構築しない。表示条件はuseCollectionSearchで検証する。
  staticData: { document: { title: "oauth_title", description: "head_consent_description" } },
  component: () => <Consent />,
});
