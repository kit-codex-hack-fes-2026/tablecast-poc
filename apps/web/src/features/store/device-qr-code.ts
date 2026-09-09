export function readDeviceQrCode(value: string, origin: string): string | null {
  try {
    const url = new URL(value);
    const codes = url.searchParams.getAll("user_code");
    if (
      url.origin !== origin ||
      url.pathname !== "/device" ||
      url.username ||
      url.password ||
      codes.length !== 1
    )
      return null;
    const code = codes[0];
    return code && /^[a-z0-9-]{1,30}$/i.test(code) ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}
