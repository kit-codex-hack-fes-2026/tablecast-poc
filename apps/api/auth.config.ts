import { dash } from "@better-auth/infra";
import { betterAuth } from "better-auth";
import { authOptions } from "./src/modules/auth/options";

// schema生成のCLIだけが読み込み、Workerの公開入口からは参照しない。
const options = authOptions(
  "http://localhost:3000",
  "tablecast-schema-generation-only-secret-not-for-runtime",
);
export const auth = betterAuth({
  ...options,
  plugins: [...options.plugins, dash({ activityTracking: { enabled: true } })],
});
