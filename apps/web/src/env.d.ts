declare namespace Cloudflare {
  interface Env {
    TABLECAST_API: { fetch: typeof fetch };
  }
}
