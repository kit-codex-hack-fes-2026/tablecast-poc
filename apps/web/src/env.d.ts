declare module "cloudflare:workers" {
  export const env: { TABLECAST_API: { fetch: typeof fetch } };
}
