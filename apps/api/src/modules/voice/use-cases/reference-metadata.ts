import { Resolver } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { DomainError, ensure } from "../../../platform/errors";

// 不変のアドレス分類。リクエストや資格情報はmoduleへ保持しない。
const privateAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  privateAddresses.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  privateAddresses.addSubnet(network, prefix, "ipv6");
const globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");

function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !privateAddresses.check(address, "ipv4")
    : family === 6 && globalIpv6.check(address, "ipv6") && !privateAddresses.check(address, "ipv6");
}
function publicUrl(value: string, base?: URL) {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new DomainError("REFERENCE_URL_INVALID", 422, "REFERENCE_URL_INVALID");
  }
  const host = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  ensure(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.href.length <= 2048,
    "REFERENCE_URL_INVALID",
    422,
  );
  ensure(
    isIP(host)
      ? publicAddress(host)
      : host.includes(".") &&
          !/(^|\.)(localhost|local|internal|lan|home|test|invalid|example)$/.test(host),
    "REFERENCE_URL_INVALID",
    422,
  );
  return url;
}
async function resolvePublicHost(url: URL, signal: AbortSignal) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return;
  const resolver = new Resolver();
  const aborted = Promise.withResolvers<never>();
  const cancel = () => aborted.reject(signal.reason);
  signal.throwIfAborted();
  signal.addEventListener("abort", cancel, { once: true });
  let results: PromiseSettledResult<string[]>[];
  try {
    // Workers未実装のResolver.cancelは使わず、期限後のDNS結果を破棄する。
    results = await Promise.race([
      Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)]),
      aborted.promise,
    ]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
  const addresses = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (!addresses.length) throw new Error("Reference DNS is unavailable");
  ensure(addresses.every(publicAddress), "REFERENCE_URL_INVALID", 422);
}
async function boundedHtml(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = "";
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      const value: unknown = chunk.value;
      if (!(value instanceof Uint8Array)) throw new Error("Invalid reference body");
      bytes += value.byteLength;
      if (bytes > 256 * 1024) throw new Error("Reference HTML exceeds its limit");
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
const cleanText = (text: string, limit: number) => text.replace(/\s+/g, " ").trim().slice(0, limit);
function imageUrl(value: string | undefined, base: URL) {
  if (!value) return undefined;
  try {
    return publicUrl(value, base).href;
  } catch {
    return undefined;
  }
}

export async function referenceMetadata(
  input: { title?: string; url: string },
  requestSignal: AbortSignal,
) {
  const original = publicUrl(input.url);
  ensure(new TextEncoder().encode(original.href).byteLength <= 1000, "REFERENCE_URL_INVALID", 422);
  const fallback = {
    url: original.href,
    title: cleanText(input.title ?? "", 200) || original.hostname,
    faviconUrl: `${original.origin}/favicon.ico`,
  };
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(3000)]);
  try {
    let url = original;
    for (let redirects = 0; redirects <= 3; redirects++) {
      signal.throwIfAborted();
      await resolvePublicHost(url, signal);
      signal.throwIfAborted();
      const response = await fetch(url.href, {
        redirect: "manual",
        signal,
        headers: { Accept: "text/html" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || redirects === 3) return fallback;
        url = publicUrl(location, url);
        continue;
      }
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("text/html") ||
        Number(response.headers.get("content-length")) > 256 * 1024
      ) {
        await response.body?.cancel();
        return fallback;
      }
      const html = await boundedHtml(response, signal);
      if (new TextEncoder().encode(url.href).byteLength > 1000) return fallback;
      const values = new Map<string, string>();
      let title = "";
      let favicon: string | undefined;
      const parsed = new HTMLRewriter()
        .on("title", {
          text: (chunk) => {
            title = (title + chunk.text).slice(0, 500);
          },
        })
        .on("meta", {
          element: (element) => {
            const name = (
              element.getAttribute("property") ?? element.getAttribute("name")
            )?.toLowerCase();
            const content = element.getAttribute("content");
            if (
              name &&
              content &&
              ["og:title", "og:description", "og:image", "description"].includes(name) &&
              !values.has(name)
            )
              values.set(name, content);
          },
        })
        .on("link", {
          element: (element) => {
            if (element.getAttribute("rel")?.split(/\s+/).includes("icon"))
              favicon ??= element.getAttribute("href") ?? undefined;
          },
        })
        .transform(new Response(html));
      await parsed.text();
      signal.throwIfAborted();
      return {
        url: url.href,
        title: cleanText(values.get("og:title") || title || fallback.title, 200) || fallback.title,
        description: cleanText(
          values.get("og:description") || values.get("description") || "",
          300,
        ),
        imageUrl: imageUrl(values.get("og:image"), url),
        faviconUrl: imageUrl(favicon, url) ?? `${url.origin}/favicon.ico`,
      };
    }
    return fallback;
  } catch (error) {
    requestSignal.throwIfAborted();
    if (error instanceof DomainError && error.code === "REFERENCE_URL_INVALID") throw error;
    return fallback;
  }
}
