export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export function api(path: string, options?: RequestInit): Promise<unknown>;
export function api<T>(
  path: string,
  options: RequestInit,
  schema: { parse: (input: unknown) => T },
): Promise<T>;
export async function api(
  path: string,
  options: RequestInit = {},
  schema?: { parse: (input: unknown) => unknown },
): Promise<unknown> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...options, credentials: "same-origin", headers });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = typeof body === "object" && body !== null && "error" in body ? body.error : null;
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "request_failed";
    throw new ApiFailure(response.status, code);
  }
  const value: unknown = await response.json();
  return schema ? schema.parse(value) : value;
}

export function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}
