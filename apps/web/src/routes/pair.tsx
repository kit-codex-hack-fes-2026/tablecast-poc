import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback } from "react";
import { Pairing } from "../features/kiosk/pairing";
import { tableOptions } from "../features/kiosk/table-query";

export const Route = createFileRoute("/pair")({
  staticData: { document: { title: "pair_title", description: "head_pair_description" } },
  loader: async ({ context }) => {
    const table = await context.queryClient.fetchQuery(tableOptions(context.queryClient));
    if (table) throw redirect({ to: "/" });
  },
  component: PairPage,
});

function PairPage() {
  const client = useQueryClient();
  const navigate = Route.useNavigate();
  const onReady = useCallback(() => {
    client.removeQueries({ queryKey: tableOptions(client).queryKey, exact: true });
    void navigate({ to: "/", replace: true });
  }, [client, navigate]);
  return <Pairing onReady={onReady} />;
}
