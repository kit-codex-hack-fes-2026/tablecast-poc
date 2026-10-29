import type { InferEnv, UnwrapConfig } from "cf/config";
import type config from "../cloudflare.config";
import type * as workerModule from "./worker";
import type { StoreEvents, TablecastEmulate, TablecastVoiceUsage } from "./worker";

// Bindingの型はTypeScript設定から推論し、実行時に与える追加varsとDOクラスを具体化する。
type TablecastConfiguredEnv = InferEnv<UnwrapConfig<typeof config>["worker"]>;

declare global {
interface __BaseEnv_TablecastEnv extends TablecastConfiguredEnv {
	TABLECAST_MEDIA: R2Bucket;
	TABLECAST_DB: D1Database;
	TABLECAST_EMAIL: SendEmail;
	TABLECAST_IMAGES: ImagesBinding;
	TABLECAST_PUBLIC_ORIGIN: string;
	TABLECAST_ENV: string;
	TABLECAST_RELEASE_SHA: string;
	TABLECAST_AUTH_SECRET: string;
	TABLECAST_BETTER_AUTH_API_KEY: string;
	TABLECAST_VOICE_ENABLED: string;
	TABLECAST_GOOGLE_CLIENT_ID: string;
	TABLECAST_GOOGLE_CLIENT_SECRET: string;
	TABLECAST_MODEL_API_KEY: string;
	TABLECAST_ORGANIZATION_AI_ENABLED: string;
	TABLECAST_OPENAI_ADMIN_API_KEY: string;
	TABLECAST_OPENAI_PROJECT_ID: string;
	TABLECAST_OPENAI_KEY_ENCRYPTION_SECRET: string;
	TABLECAST_BILLING_ENABLED: string;
	TABLECAST_BILLING_RATES: string;
 TABLECAST_BILLING_OPERATOR_USER_IDS: string;
	TABLECAST_STRIPE_SECRET_KEY: string;
	TABLECAST_STRIPE_WEBHOOK_SECRET: string;
 TABLECAST_SQUARE_APPLICATION_ID: string;
 TABLECAST_SQUARE_ENVIRONMENT: "production" | "sandbox";
 TABLECAST_SQUARE_APPLICATION_SECRET?: string;
 TABLECAST_SQUARE_WEBHOOK_SIGNATURE_KEY?: string;
 TABLECAST_POS_ENCRYPTION_SECRET?: string;
	TABLECAST_VOICE_USAGE: DurableObjectNamespace<TablecastVoiceUsage>;
	TABLECAST_MODEL: string;
	TABLECAST_GOOGLE_EMULATOR_URL: string;
	TABLECAST_EMAIL_FROM: string;
	TABLECAST_MAILPIT_URL: string;
	TABLECAST_GOOGLE_AUTHORIZE_URL: string;
	CF_ACCESS_CLIENT_ID: string;
	CF_ACCESS_CLIENT_SECRET: string;
	TABLECAST_OTEL_CAPTURE_CONTENT: string;
	TABLECAST_PR_NUMBER: string;
	TABLECAST_OTEL_ENDPOINT: string;
 TABLECAST_WORKTREE_ID: string;
 TABLECAST_WORKTREE_NAME: string;
 TABLECAST_LANGFUSE_BASE_URL: string;
 TABLECAST_LANGFUSE_PUBLIC_KEY: string;
 TABLECAST_LANGFUSE_SECRET_KEY: string;
	TABLECAST_OTEL_AUTHORIZATION: string;
	TABLECAST_CLOUDFLARE_ACCOUNT_ID: string;
	TABLECAST_CONTAINER_METRICS_TOKEN: string;
	TABLECAST_CONTAINER_METRICS_APPLICATIONS: string;
	TABLECAST_EVENTS: DurableObjectNamespace<StoreEvents>;
	TABLECAST_EMULATE: DurableObjectNamespace<TablecastEmulate>;
}
namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof workerModule;
		durableNamespaces: "StoreEvents" | "TablecastEmulate" | "TablecastVoiceUsage";
	}
	interface Env extends __BaseEnv_TablecastEnv {}
}
interface TablecastEnv extends __BaseEnv_TablecastEnv {}

}
