export function memberVisitLoginCode(returnTo: unknown) {
  if (typeof returnTo !== "string" || !returnTo.startsWith("/member/join?")) return undefined;
  const code = new URL(returnTo, "https://tablecast.invalid").searchParams.get("code");
  return code && /^[a-f0-9]{64}$/.test(code) ? code : undefined;
}

export function memberStoreLoginId(returnTo: unknown) {
  if (typeof returnTo !== "string" || !returnTo.startsWith("/member/")) return undefined;
  const segment = /^\/member\/([^/]+)/.exec(
    new URL(returnTo, "https://tablecast.invalid").pathname,
  )?.[1];
  if (!segment || segment === "join") return undefined;
  try {
    const storeId = decodeURIComponent(segment);
    return storeId.length <= 128 && !/[\\/]/.test(storeId) ? storeId : undefined;
  } catch {
    return undefined;
  }
}

export function loginReturnUrl(search: string, origin: string) {
  const query = new URLSearchParams(search);
  if (query.has("sig")) return `/consent${search}`;
  const requested = query.get("returnTo");
  if (!requested?.startsWith("/")) {
    const storeId = query.get("returnStoreId");
    const draftId = query.get("returnDraftId");
    return storeId
      ? `/admin/live?${new URLSearchParams({ storeId, ...(draftId ? { draftId } : {}) })}`
      : undefined;
  }
  try {
    const resolved = new URL(requested, origin);
    // 正規化後の//をprotocol-relativeとして再解釈させない。
    if (resolved.origin === origin) return resolved.href;
    const storeId = query.get("returnStoreId"),
      draftId = query.get("returnDraftId");
    return storeId
      ? `/admin/live?${new URLSearchParams({ storeId, ...(draftId ? { draftId } : {}) })}`
      : undefined;
  } catch {
    return undefined;
  }
}
