import { betterAuth } from "better-auth";
import { authOptions } from "./src/auth-options";

// schema生成のCLIだけが読み込み、Workerの公開入口からは参照しない。
export const auth = betterAuth(
  authOptions("http://localhost:3000", "tablecast-schema-generation-only-secret-not-for-runtime"),
);
