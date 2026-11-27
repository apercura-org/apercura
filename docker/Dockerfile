# syntax=docker/dockerfile:1
#
# Production image of Apercura: one image for the web app, the scheduler, the open data import
# and the migrations (see docs/self-hosting.md).
#
#   docker build -f docker/Dockerfile --build-arg APP_URL=https://annuaire.example.org -t apercura .
#
#   docker run … apercura                    the web app (Next.js standalone server, port 3000)
#   docker run … apercura migrate            apply pending migrations (DATABASE_URL_MIGRATE)
#   docker run … apercura jobs:tick [job]    one run of the scheduled jobs
#   docker run … apercura etl:fr [flags]     open data import (e.g. --department 75)
#   docker run … apercura etl:gb [flags]     UK NHS open data import (etl:at for Austria)
#   docker run … apercura etl:cz [flags]     Czech NRPZS open data import
#   docker run … apercura etl:es [flags]     Spanish REGCESS open data import
#   docker run … apercura etl:it [flags]     Italian Ministry of Health open data import
#   docker run … apercura etl:de [flags]     German Destatis and Länder pharmacy open data import
#   docker run … apercura etl:ch [flags]     Swiss FOPH and cantonal open data import
#   docker run … apercura scheduler          supercronic: jobs and cache warm-up every 5 minutes,
#                                            weekly and monthly imports
#
# APP_URL, PUBLIC_HDS_HOST, NEXT_PUBLIC_MAP_STYLE_URL, the LEGAL_* facts of the legal pages,
# the search engine verification tokens and HSTS_PRELOAD are read at build time: static pages
# and headers bake them. Rebuild the image when they change.

ARG NODE_VERSION=26.13.1
ARG BUN_VERSION=1.4.5

FROM oven/bun:${BUN_VERSION}-slim AS bun

# Build stages: Node.js runs `next build`, Bun installs the workspace and bundles the CLIs.
FROM node:${NODE_VERSION}-trixie-slim AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/etl/package.json packages/etl/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

FROM deps AS build
COPY . .
ARG APP_URL=http://localhost:3000
ARG PUBLIC_HDS_HOST=
ARG NEXT_PUBLIC_MAP_STYLE_URL=
ARG LEGAL_PUBLISHER_NAME=
ARG LEGAL_PUBLISHER_LEGAL_FORM=
ARG LEGAL_PUBLISHER_ADDRESS=
ARG LEGAL_PUBLISHER_PHONE=
ARG LEGAL_PUBLISHER_REGISTRATION=
ARG LEGAL_PUBLICATION_DIRECTOR=
ARG LEGAL_PUBLISHER_VAT_ID=
ARG LEGAL_CONTACT_EMAIL=
ARG LEGAL_DPO_CONTACT=
ARG LEGAL_HOST_NAME=
ARG LEGAL_HOST_ADDRESS=
ARG LEGAL_HOST_PHONE=
ARG LEGAL_SMTP_PROVIDER=
ARG LEGAL_EFFECTIVE_DATE=
ARG GOOGLE_SITE_VERIFICATION=
ARG BING_SITE_VERIFICATION=
ARG HSTS_PRELOAD=
# No database and no secrets at build time: pages that read data render on their first request.
ENV NODE_ENV=production \
    SKIP_ENV_VALIDATION=1 \
    APP_URL=${APP_URL} \
    PUBLIC_HDS_HOST=${PUBLIC_HDS_HOST} \
    NEXT_PUBLIC_MAP_STYLE_URL=${NEXT_PUBLIC_MAP_STYLE_URL} \
    LEGAL_PUBLISHER_NAME=${LEGAL_PUBLISHER_NAME} \
    LEGAL_PUBLISHER_LEGAL_FORM=${LEGAL_PUBLISHER_LEGAL_FORM} \
    LEGAL_PUBLISHER_ADDRESS=${LEGAL_PUBLISHER_ADDRESS} \
    LEGAL_PUBLISHER_PHONE=${LEGAL_PUBLISHER_PHONE} \
    LEGAL_PUBLISHER_REGISTRATION=${LEGAL_PUBLISHER_REGISTRATION} \
    LEGAL_PUBLICATION_DIRECTOR=${LEGAL_PUBLICATION_DIRECTOR} \
    LEGAL_PUBLISHER_VAT_ID=${LEGAL_PUBLISHER_VAT_ID} \
    LEGAL_CONTACT_EMAIL=${LEGAL_CONTACT_EMAIL} \
    LEGAL_DPO_CONTACT=${LEGAL_DPO_CONTACT} \
    LEGAL_HOST_NAME=${LEGAL_HOST_NAME} \
    LEGAL_HOST_ADDRESS=${LEGAL_HOST_ADDRESS} \
    LEGAL_HOST_PHONE=${LEGAL_HOST_PHONE} \
    LEGAL_SMTP_PROVIDER=${LEGAL_SMTP_PROVIDER} \
    LEGAL_EFFECTIVE_DATE=${LEGAL_EFFECTIVE_DATE} \
    GOOGLE_SITE_VERIFICATION=${GOOGLE_SITE_VERIFICATION} \
    BING_SITE_VERIFICATION=${BING_SITE_VERIFICATION} \
    HSTS_PRELOAD=${HSTS_PRELOAD}
RUN bun run --cwd apps/web build
RUN bun docker/build-cli.ts /out/cli

# supercronic (cron for containers), pinned by checksum; the runtime keeps its architecture's.
FROM scratch AS supercronic
ADD --chmod=755 --checksum=sha256:cc232108374e8e2b537045f2d5eaa1229f619db314c3ba6a14d38b35dc0aa123 \
    https://github.com/aptible/supercronic/releases/download/v0.2.51/supercronic-linux-amd64 /supercronic-linux-amd64
ADD --chmod=755 --checksum=sha256:4ae22576a78223d8ccdf5f3b3660a5cbb5288416bf0ca96afc4a36d195932b94 \
    https://github.com/aptible/supercronic/releases/download/v0.2.51/supercronic-linux-arm64 /supercronic-linux-arm64

# Runtime, non-root: Node.js serves the app, Bun runs the bundled CLIs (the runtime they are
# developed and tested with). No sources, no workspace node_modules.
FROM node:${NODE_VERSION}-trixie-slim AS runtime
LABEL org.opencontainers.image.title="Apercura" \
      org.opencontainers.image.description="Open directory and free booking tool for health practitioners" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.source="https://github.com/apercura-org/apercura"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
ARG TARGETARCH
RUN --mount=type=bind,from=supercronic,target=/mnt/supercronic \
    install -m 755 "/mnt/supercronic/supercronic-linux-${TARGETARCH}" /usr/local/bin/supercronic
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --chmod=755 docker/apercura.sh /usr/local/bin/apercura
COPY docker/crontab /app/crontab
# The Next.js server writes regenerated pages next to its build and its cache in .next/cache.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /out/cli ./cli
COPY --from=build /repo/packages/db/drizzle ./drizzle
RUN mkdir -p /app/apps/web/.next/cache && chown node:node /app/apps/web/.next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["apercura"]
CMD ["serve"]
