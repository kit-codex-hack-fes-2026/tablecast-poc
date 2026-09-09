import { z } from "zod";
type PreviewEnv = Pick<TablecastEnv, "TABLECAST_ENV" | "TABLECAST_PUBLIC_ORIGIN"> &
  Partial<Pick<TablecastEnv, "TABLECAST_EMULATE">>;

export function previewOAuthFetch(env: PreviewEnv, path: string, init?: RequestInit) {
  if (env.TABLECAST_ENV !== "preview" || !env.TABLECAST_EMULATE)
    throw new Error("PR専用OAuthの設定がありません。");
  return env.TABLECAST_EMULATE.getByName("tablecast-emulate").fetch(
    new Request(`http://tablecast-emulate${path}`, init),
  );
}

export function previewGoogleToken(env: PreviewEnv) {
  return async (data: { code: string; redirectURI: string; codeVerifier?: string }) => {
    const response = await previewOAuthFetch(env, "/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: data.code,
        redirect_uri: data.redirectURI,
        client_id: "tablecast-local-google",
        client_secret: "tablecast-local-google-secret",
        ...(data.codeVerifier ? { code_verifier: data.codeVerifier } : {}),
      }),
    });
    if (!response.ok) throw new Error("PR専用OAuthのコード交換に失敗しました。");
    const token = z
      .object({ access_token: z.string(), expires_in: z.number() })
      .parse(await response.json());
    return {
      accessToken: token.access_token,
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
    };
  };
}
