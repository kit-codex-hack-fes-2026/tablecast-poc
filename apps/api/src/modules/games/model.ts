import { z } from "zod";
const gameTextSchema = z
  .object({ ja: z.string().min(1).max(3000), en: z.string().min(1).max(3000) })
  .strict();

export const gameIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,59}$/);
export const gameManifestSchema = z
  .object({
    apiVersion: z.literal(1),
    name: gameTextSchema,
    description: gameTextSchema,
    rules: gameTextSchema,
    minPlayers: z.number().int().min(1).max(12),
    maxPlayers: z.number().int().min(1).max(12),
    capabilities: z.array(z.literal("state")).max(1),
  })
  .strict()
  .refine((value) => value.minPlayers <= value.maxPlayers);

// 依存ライブラリと画像も同梱し、実行中の外部CDNを必要にしない。
export const gamePackageSchema = z
  .object({
    manifest: gameManifestSchema,
    html: z.string().min(1).max(200_000),
    css: z.string().max(200_000),
    javascript: z.string().min(1).max(1_500_000),
  })
  .strict()
  .refine((value) => new TextEncoder().encode(JSON.stringify(value)).length <= 2_000_000);
export const registerGameSchema = z
  .object({
    gameId: gameIdSchema,
    package: gamePackageSchema,
  })
  .strict();
// ゲーム固有の内部構造はゲーム側が所有し、公開RPC型へ再帰的なJSON型を展開しない。
export const gameStateSchema: z.ZodType<Record<string, unknown>> = z
  .record(z.string().max(100), z.json())
  .refine((value) => new TextEncoder().encode(JSON.stringify(value)).length <= 16_384);
export const saveGameStateSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    state: gameStateSchema,
  })
  .strict();
export const publishGameSchema = z
  .object({
    versionId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    approved: z.literal(true),
  })
  .strict();
export const gameMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tablecast.game.ready"), protocol: z.literal(1) }).strict(),
  z.object({ type: z.literal("tablecast.game.exit") }).strict(),
  z
    .object({
      type: z.literal("tablecast.game.save"),
      requestId: z.string().min(1).max(80),
      state: gameStateSchema,
    })
    .strict(),
]);
export type GamePackage = z.infer<typeof gamePackageSchema>;
export type GameManifest = z.infer<typeof gameManifestSchema>;
export type GameState = z.infer<typeof gameStateSchema>;
