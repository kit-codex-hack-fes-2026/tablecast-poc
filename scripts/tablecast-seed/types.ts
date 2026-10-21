import type { demoStores } from "../tablecast-fixtures.ts";

export type Store = ReturnType<typeof demoStores>[number] & { configVersion?: number };

export type Owner = { id: string; userId: string };

export type SeedEvent = {
  at: number;
  data: string;
  kind: string;
  sessionId: string;
  storeId: string;
};

export type SeedEnv = Pick<
  TablecastEnv,
  | "TABLECAST_AUTH_SECRET"
  | "TABLECAST_DB"
  | "TABLECAST_ENV"
  | "TABLECAST_MEDIA"
  | "TABLECAST_PUBLIC_ORIGIN"
>;
