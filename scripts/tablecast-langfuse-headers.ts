import { langfuseTarget } from "./tablecast-observability-config.ts";

// Codexのheader helper専用。標準出力には認証情報が含まれるため手動表示しない。
const target = await langfuseTarget(process.argv[2] ?? "");
process.stdout.write(
  JSON.stringify({
    Authorization: `Basic ${btoa(`${target.publicKey}:${target.secretKey}`)}`,
  }),
);
