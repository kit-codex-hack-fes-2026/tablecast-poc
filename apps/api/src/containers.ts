import { Container } from "@cloudflare/containers";

export class TablecastEmulate extends Container<TablecastEnv> {
  override defaultPort = 8080;
  override sleepAfter = "5m";
  override envVars: Record<string, string> = {
    TABLECAST_PUBLIC_ORIGIN: this.env.TABLECAST_PUBLIC_ORIGIN,
    TABLECAST_ENV: "preview",
    TABLECAST_OAUTH_PORT: "8080",
  };
}
