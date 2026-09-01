# syntax=docker/dockerfile:1

# Debian rather than Alpine: the Typst compiler is a native binding and the
# glibc build is the better-tested one. The image is larger; the PDF path is
# the whole product, so that trade is worth making.
FROM node:24.19.0-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# No BuildKit cache mount for the pnpm store. It only ever helped repeated
# local builds — no CI runner persists it between runs — and it made the image
# unbuildable by any builder without BuildKit, which is what plain
# `docker build` on a hosted builder gives you. Layer caching still applies.
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
# Next traces the server and its real dependencies into standalone, including
# the native binding, the bundled fonts and the Typst templates.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000

# Proves the compiler works, not just that the process is alive: a PDF route
# that returns 200 means the native binding loaded and the fonts resolved.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
