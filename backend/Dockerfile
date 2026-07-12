# Build context must be this directory (.../backend) so package.json + package-lock.json match.
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

# Migrations run on container start via CMD below (needs DATABASE_URL or DATABASE_URL_ADMIN).

FROM node:20-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
# Onboarding HTML->PDF (Playwright). Browsers live here so we can chown for USER node.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
RUN npx playwright install --with-deps chromium \
    && chown -R node:node "${PLAYWRIGHT_BROWSERS_PATH}"
COPY --from=builder /app/dist ./dist
EXPOSE 3000
USER node
CMD ["sh", "-c", "node dist/scripts/migrate.js && exec node dist/main.js"]
