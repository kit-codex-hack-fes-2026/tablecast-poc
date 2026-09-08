# syntax=docker/dockerfile:1
FROM ghcr.io/astral-sh/uv:0.11.26-python3.13-trixie-slim@sha256:d8a45a30929a5bfedd8b09d630538ca1ab30041154d2a6cb2e4fee3cffd3ea4c AS base

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

FROM base AS build
# SHA固定の公式plugin forkを取得する。実行用imageへGitは含めない。
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev --no-editable
RUN .venv/bin/python -m livekit.agents download-files
# 固定版Sileroのモデルはwheelに同梱される。外部接続なしで読み込めることを確かめる。
RUN --network=none .venv/bin/python -c "from livekit.plugins import silero; silero.VAD.load()"

FROM base AS runtime
RUN useradd --create-home --uid 10001 --user-group tablecast
WORKDIR /app
COPY --from=build --chown=tablecast:tablecast /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:${PATH}" \
    TABLECAST_AGENT_HEALTH_PORT=8081
USER tablecast
EXPOSE 8081
ENTRYPOINT ["tablecast-voice"]
CMD ["start"]
