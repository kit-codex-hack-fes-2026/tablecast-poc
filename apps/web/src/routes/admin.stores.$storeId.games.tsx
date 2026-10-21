import { createFileRoute } from "@tanstack/react-router";
import { gamesOptions } from "../features/games/game-query";
import { Games } from "../features/games/games";

export const Route = createFileRoute("/admin/stores/$storeId/games")({
  staticData: { document: { title: "games_title", description: "head_games_description" } },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(gamesOptions(params.storeId));
  },
  component: Games,
});
