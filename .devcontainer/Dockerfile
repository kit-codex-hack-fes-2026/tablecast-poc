FROM oven/bun:1.3.13 AS tablecast-bun
FROM ghcr.io/astral-sh/uv:0.10.9 AS tablecast-uv
FROM livekit/livekit-server:v1.13.6 AS tablecast-livekit
FROM axllent/mailpit:v1.29.2 AS tablecast-mailpit
FROM caddy:2.10.2 AS tablecast-caddy
FROM node:24.7.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git procps libatomic1 libnss3 libatk1.0-0 libatk-bridge2.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libasound2 && rm -rf /var/lib/apt/lists/*
COPY --from=tablecast-bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
COPY --from=tablecast-uv /uv /uvx /usr/local/bin/
COPY --from=tablecast-livekit /livekit-server /usr/local/bin/livekit-server
COPY --from=tablecast-mailpit /mailpit /usr/local/bin/mailpit
COPY --from=tablecast-caddy /usr/bin/caddy /usr/local/bin/caddy
ENV UV_PYTHON_INSTALL_DIR=/opt/tablecast-python
RUN uv python install 3.13.12
WORKDIR /workspaces/tablecast
