# Repository Guidelines

## Project Overview

uni-backend: NestJS + PostgreSQL backend for a university Research Data Management platform. Researchers author DMP drafts (maDMP v3.0), submit versions for committee review, approved plans auto-generate lifecycle tasks; files are uploaded/extracted (docx)/embedded for RAG; notifications via SSE. Serves a separate React 19 frontend; the API contract lives in `docs/frontend-api/dmps.md`.

## Architecture & Data Flow

- NestJS 12 + Express, Drizzle ORM on Postgres, Zod contracts, ESM, tsx runtime (no build step).
- Request flow: `AuthGuard` (global, `@Public()` opt-out) → thin controller (`@CurrentUser()` claims) → service (use cases: Zod validation, role checks, 404-to-hide-existence) → repository (plain Drizzle functions taking `Db`) → Postgres.
- Layering: controller → service → domain pure functions → repository (ports/adapters in `src/shared/ports/` + `src/shared/adapters/`).
- DMP lifecycle: draft autosave with `draft_revision` optimistic concurrency → submit version (diff/classify major/minor) → committee approve/reject → approve triggers `generateTasks` + notifications.
- All errors funnel through one global filter (`ErrorEnvelopeFilter`) into a Stripe-style envelope `{error:{type,code,message,param?}}` (ADR-0014); lists use `ListEnvelope<T>` `{object:"list",data,has_more,total_count}` (ADR-0015).
- IDs are backend-minted UUID v7 (CON-5); date-only values stored as `YYYY-MM-DD` (CON-4).

## Key Directories

- `src/features/<noun>/` — 9 feature modules (users, auth, projects, files, dmps, reviews, tasks, notifications, meta); each follows a fixed `<name>.module/service/repository/controller.ts` quartet (CON-1).
- `src/shared/contracts/` — Zod schemas per resource; single source of truth for API shapes (CON-3).
- `src/shared/domain-engine/` — pure, deterministic domain logic (classify, diff, validate, fold, carry, task-generator). MUST NOT import `@nestjs/*`, DB drivers, or HTTP clients — lint-enforced boundary ("CON-2"); violation fixtures in `__fixtures__/` are intentionally excluded from tsconfig/lint.
- `src/shared/domain-profiles/`, `src/shared/config/`, `src/shared/http/` — FE ported profiles, config loader, error envelope/filter.
- `src/database/` — `schema/index.ts` (13 tables, constraints pushed into Postgres), `migrations/`, `migrate.ts` (up/seed).
- `tests/unit | integration | e2e` — see Testing & QA.
- `docs/specs/` (spec-first workflow), `docs/plans/`, `docs/decisions/` (ADRs), `docs/architecture/arc42.md`, `docs/frontend-api/dmps.md` (API source of truth).

## Development Commands

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres 18 + MailPit (SMTP 1025, UI 8025)
pnpm install
pnpm db:migrate                                  # tsx src/database/migrate.ts up (requires .env)
pnpm db:seed
pnpm db:generate                                 # drizzle-kit after schema changes
pnpm dev                                         # tsx --env-file=.env src/main.ts → :3000, Swagger at /api-docs
pnpm lint          # eslint .
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm test -- tests/unit    # run a subset (CI does this)
```

Env: `.env` holds `DATABASE_URL`, `JWT_SECRET` (required, fail-fast), `OPENROUTER_KEY`, `SMTP_URL`, `PORT` (3000). Tunables live in `config.toml` (smol-toml, zod-validated, loaded once in `src/shared/config/`).

## Code Conventions & Common Patterns

- **Naming**: features lowercase nouns in `src/features/`; DB snake_case, TS camelCase, API responses snake_case (FE contract). Files: `<name>.service.ts` etc.
- **Errors**: throw `ApiError(status, code, message, param?)` or `HttpException`; never format errors at the throw site — the global filter normalizes. Codes are machine strings (`not_signed_in`, `token_expired`, `draft_conflict`, `field_invalid`).
- **Validation**: Zod at every boundary; first issue becomes 400 `field_invalid` with JSON-pointer `param` via `fieldInvalid()`.
- **DI**: Nest constructor injection; DB provided via `@Inject(DB)` symbol token from the `@Global` `DatabaseModule`; repositories are DI-free plain functions taking `Db`.
- **Async**: plain async/await; no RxJS streams except SSE (discriminated union in `src/shared/contracts/envelope.ts`).
- **Domain logic**: keep deterministic logic in `shared/domain-engine/` as pure functions; services orchestrate, repositories query.
- Comments and docs are mostly Thai; architecture comments reference ADR numbers and arc42 sections (e.g. `ADR-0020`, arc42 §5.3).

## Important Files

- `src/main.ts` — bootstrap: config load (fail-fast), Swagger merged with zod-to-openapi registry, bearer default, `/api-docs` + `/openapi-json`.
- `src/app.module.ts` — root module, global filter + guard.
- `src/database/schema/index.ts` — all tables; constraints/enums/pgEnums live in Postgres, JSONB for nested draft data.
- `src/shared/http/error-envelope.ts` — error contract.
- `drizzle.config.ts`, `config.toml`, `docker-compose.dev.yml`, `.github/workflows/ci.yml`.

## Runtime/Tooling Preferences

- Node ≥24 (engines), pnpm (workspace declares single package), tsx to run TS directly — never introduce a build step.
- Strict TS, `NodeNext`/ESM, decorators enabled for Nest DI, `verbatimModuleSyntax`. Aliases: `@/*` → `src/*`, `@shared/*` → `src/shared/*`.
- typescript-eslint `strictTypeChecked` with projectService; e2e tests and domain-engine fixtures are `disableTypeChecked`.

## Testing & QA

- Vitest 3; three tiers: `tests/unit` (pure, no DB), `tests/integration` (schema constraints, services via moduleRef), `tests/e2e` (supertest against `Test.createTestingModule({ imports: [AppModule] })`).
- No mocking: tests hit real Postgres and the real domain-engine registry. DB suites gate with `describe.skipIf(!dbReady)` after a `select 1` probe; DB URL defaults to `postgres://postgres:postgres@localhost:5432/uni`.
- Prerequisite for integration/e2e: `docker compose -f docker-compose.dev.yml up -d && pnpm db:migrate`.
- Isolation: per-file shared pool (`createDb`), `beforeAll`/`afterAll` cleanup, `pool.end()` + `app.close()`. `maxWorkers: 3` in `vitest.config.ts` (Postgres constraint — don't raise).
- Conventions: suites named by numbered API flows; top-of-file scope banner (spec id + tier); binary fixtures in `tests/fixtures/`.
- Workflow: spec-first — behavior changes edit `docs/specs/SPEC-*.md` first; architecture decisions add an ADR in `docs/decisions/`; plans in `docs/plans/` define slices with verify commands; milestone gate = e2e green.
- CI: stage 1 = lint + typecheck + unit; stage 2 = e2e against a Postgres 16 service after migrate. No coverage tooling configured.
