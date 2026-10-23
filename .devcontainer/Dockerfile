FROM oven/bun:1.4.4 AS tablecast-bun
FROM axllent/mailpit:v1.32.0 AS tablecast-mailpit
FROM caddy:2.11.7 AS tablecast-caddy
FROM grafana/mcp-grafana:2.1.1 AS tablecast-grafana-mcp
FROM node:24.22.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git procps curl ffmpeg libatomic1 libnss3 libatk1.0-0 libatk-bridge2.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libasound2 && rm -rf /var/lib/apt/lists/*
COPY --from=tablecast-bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
COPY --from=tablecast-mailpit /mailpit /usr/local/bin/mailpit
COPY --from=tablecast-caddy /usr/bin/caddy /usr/local/bin/caddy
COPY --from=tablecast-grafana-mcp /app/mcp-grafana /usr/local/bin/mcp-grafana
WORKDIR /workspaces/tablecast
