export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (import.meta.env.SSR) {
    const { serverApiFetch } = await import("./api-fetch.server");
    return serverApiFetch(input, init);
  }
  return fetch(input, { ...init, credentials: "same-origin" });
}
