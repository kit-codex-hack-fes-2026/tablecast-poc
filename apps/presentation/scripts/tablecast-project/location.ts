import { resolve } from "node:path";

export const root = resolve(import.meta.dirname, "../..");

export const defaultProjectPath = resolve(root, "projects/tablecast-main-rerecord.json");

export const projectPath = () =>
  resolve(root, process.env.TABLECAST_PRESENTATION_PROJECT ?? defaultProjectPath);
