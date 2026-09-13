FROM oven/bun:1.3.13 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY patches/*.patch patches/
COPY apps/emulate/package.json apps/emulate/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY livekit/package.json livekit/package.json
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/emulate/src apps/emulate/src
RUN bun build apps/emulate/src/index.ts --target=bun --outfile=tablecast-emulate.js

FROM oven/bun:1.3.13-slim
WORKDIR /app
COPY --from=build --chown=bun:bun /app/tablecast-emulate.js ./
COPY --from=build --chown=bun:bun /app/apps/emulate/node_modules/emulate/dist/fonts ./fonts
USER bun
ENV TABLECAST_OAUTH_PORT=8080
EXPOSE 8080
CMD ["bun", "--no-env-file", "tablecast-emulate.js"]
