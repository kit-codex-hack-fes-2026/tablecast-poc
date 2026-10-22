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
