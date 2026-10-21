import { createFileRoute } from "@tanstack/react-router";
import { Games } from "../features/store/games";
import { gamesOptions } from "../features/store/game-query";

export const Route = createFileRoute("/admin/stores/$storeId/games")({
  staticData: { document: { title: "games_title", description: "head_games_description" } },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(gamesOptions(params.storeId));
  },
  component: Games,
});
