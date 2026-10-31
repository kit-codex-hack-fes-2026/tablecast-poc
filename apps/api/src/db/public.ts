export * as identity from "./auth-schema";
// 管理CLIはこの入口から同じschemaとD1 clientを利用する。
export * as business from "./business-schema";
export { createDatabase, type Database } from "./client";
