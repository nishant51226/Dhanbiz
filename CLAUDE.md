# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Monorepo (no root `package.json`) with two independent npm projects deployed together via Docker Compose:

- `backend/` — NestJS 10 + TypeORM 0.3 + Postgres. Compiles to `dist/` (CommonJS, ES2021). Source root is `src/`.
- `frontend/` — React 19 + Vite 6 + MUI 9 + Tailwind 3. Type-check only (`tsc --noEmit`), Vite builds the bundle.
- `docs/` — End-user / admin guides (roles, permissions, onboarding, plan catalogs as JSON seeds).
- `docker/` — Per-service Dockerfiles (`nginx/`, `ollama/`).
- `docker-compose.yml` — Bundles the full stack (postgres + ollama + backend + nginx serving the UI). `docker-compose.ollama.yml` and `docker-compose-without-olama.yml` are deployment variants. `.env.compose.example` lists every supported env var.

Install dependencies per project (`cd backend && npm install`, `cd frontend && npm install`). The backend has a `postinstall` hook that applies `patches/@nestjsx+crud+4.6.2.patch` via `patch-package` — do not skip install scripts.

## Common commands

### Backend (`cd backend`)

| Task | Command |
|---|---|
| Dev server with watch + ts-node | `npm run dev` (Nest CLI `start --watch --tsc`, port 3000) |
| Production build | `npm run build` (Nest CLI → `dist/`) |
| Run compiled server | `npm start` |
| Run migrations | `npm run migrate` — builds first, then runs `dist/scripts/migrate.js` against `DATABASE_URL_ADMIN` (falls back to `DATABASE_URL`) |
| Export OpenAPI spec | `npm run openapi:export` — writes `openapi/openapi.json` |
| Smoke-test RBAC seed | `npm run test:rbac` (`scripts/test-rbac.js`) |
| Raw TypeORM CLI | `npm run typeorm -- <args>` (uses `typeorm-ts-node-commonjs`) |

There is no Jest/Vitest harness configured in `backend/package.json`; do not assume `npm test` exists.

### Frontend (`cd frontend`)

| Task | Command |
|---|---|
| Dev server | `npm run dev` (Vite on port 5173, proxies `/api` → `VITE_API_BASE` or `http://127.0.0.1:3000`) |
| Type-check + build | `npm run build` (`tsc --noEmit && vite build`) |
| Preview built bundle | `npm run preview` |
| Regenerate client-registration PDF template | `npm run generate:pdf-template` |

The frontend is **type-check only** (`noEmit: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`). Run `npm run build` to verify type correctness end-to-end.

### Docker stack

```
docker compose up -d --build           # full stack incl. local Ollama
docker compose -f docker-compose-without-olama.yml up -d --build   # external LLM gateway only
```

The nginx container serves the built UI on `${DOC_PUBLISH_PORT:-80}` and proxies `/api/` to the backend. The Ollama image pulls models listed in `OLLAMA_MODELS` at start (qwen2.5vl:3b + qwen2.5:3b by default); set `OLLAMA_SKIP_PULL=1` to skip.

## Architecture

### Backend — NestJS module graph

`AppModule` (`backend/src/app.module.ts`) wires every feature module. Each domain area is its own `*Module` under `src/<domain>/`:

- `auth/` — JWT issuance, login/register, `JwtAuthGuard`, `PermissionsGuard`, `PermissionsService`, `RlsTenantInterceptor` (global).
- `customers/`, `customer-portal/` — Staff-facing customer CRUD and the portal where customers sign in to their own workspace. Two distinct surfaces with different permission keys (`customer:*` vs `portal:*`).
- `documents/`, `files/`, `extract/`, `extraction/` — Document upload, storage, OCR/structure extraction pipeline.
- `ai/` — Provider factory and adapters (`bedrock`, `huggingface`, `ollama`, `openai`) selected via `AI_PROVIDER_DEFAULT`. Vision and structure models are configured separately per provider.
- `queue/` — `pg-boss` worker bound to the same Postgres for jobs (extraction, onboarding follow-ups). The `customer_app` Postgres role is granted pg-boss schema access by migration `1743600001000`.
- `docuseal/` — DocuSeal webhook ingress at `/api/webhooks/docuseal` (also accepted bare at `/webhooks/docuseal`, rewritten in `main.ts`). Verified via timing-safe `x-docuseal-webhook-secret`.
- `subscription/`, `subscription-plans/` — Plan catalogue (services, addons, pricing matrix, limits, rules) seeded from `docs/*.json` files.
- `mail/`, `s3/`, `notification/`, `cron/`, `companies-house/`, `admin/`, `legacy/`, `enquiry/`, `jobs/`, `tenant/`, `health.controller.ts` — Supporting integrations.

Global prefix is `/api` (except `GET /health`). Swagger UI is mounted at `/api/docs` (JSON at `/api/docs-json`).

### Multi-tenancy via Postgres RLS

Tenant isolation is enforced **in the database**, not in application code:

1. `RlsTenantInterceptor` (registered as `APP_INTERCEPTOR` in `AppModule`) runs every request inside `typeorm-transactional`'s `runInTransaction`, sets `app.is_admin` / `app.customer_id` / `app.user_id` via `SELECT set_config(..., true)`, then forwards to the handler.
2. RLS policies (introduced in migration `1733159400000-EnableRlsPolicies` and extended by later `*RlsWritePolicies` migrations) read those GUCs to scope SELECT/INSERT/UPDATE/DELETE.
3. The backend connects as the limited `customer_app` Postgres role (created in migration `1743600000000-CreateCustomerAppRole`) so RLS actually applies. Migrations run as the admin role (`DATABASE_URL_ADMIN`) because policy/role DDL requires elevated privileges.

When adding new tables, you must add matching RLS policies in a migration — otherwise the `customer_app` role will see nothing (or, worse, everything if you forget `ENABLE ROW LEVEL SECURITY`).

`main.ts` initializes `typeorm-transactional` with `StorageDriver.AUTO` (AsyncLocalStorage). This is load-bearing: `cls-hooked` was dropping the transactional EntityManager across RxJS `firstValueFrom`, causing the GUCs and the actual INSERT to land on different pooled connections.

### Migrations

There is no glob/auto-discovery: every migration must be imported into `backend/src/typeorm-migrations.registry.ts` (the `typeormMigrations` array) to run. The same registry is used both at runtime (`AppModule` data source config, although `migrationsRun: false`) and by `src/scripts/migrate.ts`. Adding a migration file without registering it is a silent no-op.

Filename pattern: `<unix-ms-timestamp>-<PascalCaseName>.ts`. There are ~60 migrations covering schema, RLS policies, seeded roles/permissions, and subscription catalogue data.

### Permissions model

Two parallel permission namespaces gate every protected route:

- **Staff/admin** keys like `customer:read`, `job:create`, `subscription_plan:write`, `settings:write`.
- **Portal/customer-user** keys prefixed `portal:*` (e.g. `portal:file:read`).

Superadmin is a **boolean flag on `users.is_admin`**, not a role row. It bypasses `PermissionsGuard`. The full reference lives in `docs/permissions-reference.md` and the higher-level role narrative in `docs/roles-and-permissions-guide.md` — consult these before adding new permission keys or roles. Seed/baseline permissions are inserted by migrations (`SeedDefaultAdminUser`, `SeedCustomerPortalRole`, `StaffRoleAndSubscriptionPermissions`, etc.).

### Extraction pipeline

`extract/extract-pipeline.service.ts` orchestrates PDF → page images → vision model → structure LLM → persisted `FinancialDocumentEntity` + `ExtractionSegmentEntity` + `InvoiceEntity` / `StatementEntity` (+ lines). Concurrency knobs: `EXTRACTION_PDF_VISION_CONCURRENCY`, `EXTRACTION_LLM_CONCURRENCY`. Page limits: `PDF_MAX_PAGES`, `PDF_PAGE_MIN_TEXT_CHARS`, `STRUCTURE_MAX_CHARS`. Pricing/usage is captured per call into `AiExecutionEntity` (joined to `AiPricingEntity`).

### Frontend

- Entry: `src/main.tsx` → `App.tsx` → React Router v7 routes under `src/pages/`.
- Auth context: `src/auth/AuthContext.tsx`, JWT decoding in `jwtClaims.ts`, route gating via `RequireAuth.tsx` and `<Can />` for permission-conditional UI.
- API client: `src/api/client.ts` is the single typed wrapper around `fetch` — add new endpoints there rather than scattering `fetch` calls.
- Workspace navigation is split between staff (`staffLanding.ts`) and customer portal (`portalNav.ts`, `customerWorkspaceNav.ts`).
- Styling uses MUI + Tailwind together. PDF preview/generation uses `pdfjs-dist`, `pdf-lib`, `html2pdf.js`, plus `@docuseal/signature-maker-react` for signing UI.

### Body size and CORS quirks

- `main.ts` raises the JSON/urlencoded body limit to 5 MB because the onboarding autosave PATCH carries up to four base64 signature data URLs (~30–60 kB each) before they're uploaded as files. Don't lower this without re-checking onboarding.
- CORS allow-list is `localhost:5173`, `127.0.0.1:5173`, `localhost:3000`, `127.0.0.1:3000` plus anything in `CORS_ORIGINS` (comma-separated). Requests without an `Origin` header (curl/Postman) are allowed.

## Conventions worth knowing

- Backend uses CommonJS output but source files frequently use `.js` extensions in imports (e.g. `from "./extract-pipeline.service.js"`) — this is intentional for ESM-style compatibility through the Nest TypeScript build; don't "fix" them to bare specifiers.
- TypeORM entities are individually listed in `AppModule`'s `entities: [...]` array (no glob). New entities must be added there **and** added to any `TypeOrmModule.forFeature([...])` in the relevant feature module.
- DocuSeal webhook secret is checked with `crypto.timingSafeEqual` against `DOCUSEAL_WEBHOOK_SECRET`; the header name is overridable via `DOCUSEAL_WEBHOOK_SECRET_HEADER` (default `x-docuseal-webhook-secret`).
- No test framework is wired up in either project; verify changes by running the dev servers (`backend: npm run dev`, `frontend: npm run dev`) and exercising flows manually, or by running `npm run build` for type safety.
