import { createIsomorphicFn } from "@tanstack/react-start";

export const readEvaluationEnvironment = createIsomorphicFn()
  .server(async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    return new URL(getRequest().url).origin === "https://tablecast-staging.kit-codex.workers.dev";
  })
  .client(async () => window.location.origin === "https://tablecast-staging.kit-codex.workers.dev");
