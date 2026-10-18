import { stripe } from "@better-auth/stripe";
import { Stripe } from "stripe";
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
  plugins: [
    stripe({
      stripeClient: new Stripe("sk_test_tablecast_schema_only"),
      stripeWebhookSecret: "whsec_tablecast_schema_only",
      organization: { enabled: true },
      subscription: { enabled: true, plans: [] },
    }),
    ...options.plugins,
    dash({ activityTracking: { enabled: true } }),
  ],
});
