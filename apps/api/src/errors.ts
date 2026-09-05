export class DomainError extends Error {
  constructor(
    public code: string,
    public status: 400 | 401 | 403 | 404 | 409 | 422 | 503,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  code: string,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 503 = 409,
  details?: unknown,
): asserts condition {
  if (!condition) throw new DomainError(code, status, code, details);
}
