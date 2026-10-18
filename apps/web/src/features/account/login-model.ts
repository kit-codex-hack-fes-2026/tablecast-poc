export function loginReturnUrl(search: string, origin: string) {
  const query = new URLSearchParams(search);
  if (query.has("sig")) return `/consent${search}`;
  const requested = query.get("returnTo");
  if (!requested?.startsWith("/")) return undefined;
  try {
    const resolved = new URL(requested, origin);
    // 正規化後の//をprotocol-relativeとして再解釈させない。
    return resolved.origin === origin ? resolved.href : undefined;
  } catch {
    return undefined;
  }
}
