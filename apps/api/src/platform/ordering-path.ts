export function isOrderingRequest(path: string) {
  const match = path.match(/^\/api\/(?:table|admin\/stores\/[^/]+\/demo\/[^/]+\/table)(\/.*)?$/);
  if (!match) return false;
  const suffix = match[1] ?? "";
  return suffix === "/voice/speed" || !/^\/(?:games|voice)(?:\/|$)/.test(suffix);
}
