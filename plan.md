# Bulk Email Platform - Execution Plan

## Build Goal
Ship a full-stack bulk email platform where users can manage lists and contacts, create/send campaigns, and monitor delivery analytics (sent, delivered, bounced, blocked, unsubscribed).

## Project Decisions (Current)
- Framework: Next.js (App Router, full-stack)
- ORM/DB modeling: Prisma
- Local DB for now: SQLite (`prisma/dev.db`)
- Styling: Vanilla CSS
- Auth and provider integrations: deferred to upcoming phases

## Phase-by-Phase Implementation Checklist

## Phase 1 - Foundation and Core Data Plumbing
- [x] Define relational schema for `User`, `List`, `Contact`, `Campaign`, `Event`.
- [x] Add Prisma runtime dependencies (`prisma`, `@prisma/client`).
- [x] Add Prisma singleton client for server routes.
- [x] Add baseline API utilities for consistent JSON success/error responses.
- [x] Add `GET /api/health` endpoint.
- [x] Add `GET /api/lists` endpoint (scoped to current dev user).
- [x] Add `POST /api/lists` endpoint with validation.
- [x] Add dashboard lists page wired to data endpoint for smoke testing.
- [x] Run Prisma generation/migration and confirm APIs locally.

Exit criteria:
- Health endpoint responds with `status: ok`.
- Lists endpoint can create and read list records from DB.

## Phase 1 Status Snapshot (June 1, 2026)
Status: Completed

Delivered:
- Data schema finalized in `prisma/schema.prisma` for `User`, `List`, `Contact`, `Campaign`, `Event`.
- Prisma runtime and client integration added (`prisma`, `@prisma/client`).
- Shared server utilities added:
  - `src/lib/prisma.ts`
  - `src/lib/http.ts`
  - `src/lib/auth.ts` (temporary dev-user resolver to be replaced in Phase 2)
- Working API endpoints added:
  - `GET /api/health`
  - `GET /api/lists`
  - `POST /api/lists`
- Dashboard data wiring added for list view:
  - `src/app/dashboard/lists/page.tsx`
- Initial DB migration created and applied:
  - `prisma/migrations/20260601064002_init/migration.sql`

Verification completed:
- Type safety/build:
  - `pnpm exec tsc --noEmit` passed
  - `pnpm exec next build` passed
- Prisma:
  - `pnpm exec prisma validate` passed
  - `pnpm exec prisma migrate dev` passed
- API smoke flow:
  - `GET /api/health` returns `status: ok`
  - `POST /api/lists` creates a list successfully
  - `GET /api/lists` returns created data

Notes for future work:
- Current auth is intentionally temporary for development (`x-user-email` header fallback + auto-upsert user). Replace with real session auth in Phase 2.
- Local database is SQLite at `prisma/dev.db`.

## Phase 2 - Authentication and User Ownership
- [x] Implement auth (email/password baseline).
- [x] Replace temporary dev user resolution with authenticated session user.
- [x] Add protected route handling for `/dashboard/*` and `/api/*` (currently enforced for implemented protected APIs).

Exit criteria:
- Users can register/login and only access their own data.

Phase 2 implementation notes:
- Added auth endpoints:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
- Session model:
  - HTTP-only cookie `mailflow_session`
  - Signed token payload includes `userId` and `email`
- Protected surfaces:
  - Middleware guard for `/dashboard/*` and `/api/lists/*`
  - Server-side ownership checks in route handlers and dashboard pages
- Production env requirement:
  - Set `AUTH_SECRET` to a strong secret (current fallback is for local development only)

## Phase 3 - Contacts and List Operations
- [x] Build `/api/contacts` CRUD and list import (CSV).
- [x] Build `/dashboard/lists` UI for create/edit/delete/import.
- [x] Add unsubscribe and bounce status transitions at contact level.

Exit criteria:
- End-to-end list + contact management works from dashboard.

Phase 3 implementation notes:
- Added list management endpoints for update/delete:
  - `PATCH /api/lists/[id]`
  - `DELETE /api/lists/[id]`
- Added contacts endpoints:
  - `GET /api/contacts?listId=...`
  - `POST /api/contacts` (single contact create)
  - `PUT /api/contacts` (CSV import)
  - `PATCH /api/contacts/[id]` (including `status` transitions)
  - `DELETE /api/contacts/[id]`
- Expanded dashboard lists workspace to support:
  - list create/select/edit/delete
  - single contact add
  - CSV import
  - contact status updates (`SUBSCRIBED`, `UNSUBSCRIBED`, `BOUNCED`)
  - contact delete
- Extended middleware protection to include `/api/contacts/*`.

## Phase 4 - Templates and Campaign Authoring
- [x] Build template storage and template editor (MVP: rich text/HTML).
- [x] Build `/api/campaigns` create/edit/schedule/send flow (drafting + status lifecycle in app).
- [x] Add campaign states (`DRAFT`, `SCHEDULED`, `SENDING`, `SENT`, `FAILED`).

Exit criteria:
- User can compose a campaign and trigger send job.

Phase 4 implementation notes:
- Added `Template` model and campaign-template relation in Prisma schema.
- Added templates APIs:
  - `GET /api/templates`
  - `POST /api/templates`
  - `PATCH /api/templates/[id]`
  - `DELETE /api/templates/[id]`
- Added campaigns APIs:
  - `GET /api/campaigns`
  - `POST /api/campaigns`
  - `PATCH /api/campaigns/[id]`
  - `DELETE /api/campaigns/[id]`
- Added dashboard pages:
  - `/dashboard/templates`
  - `/dashboard/campaigns`
- Added Phase 4 migration:
  - `prisma/migrations/20260601065248_phase4_templates_campaigns/migration.sql`
- Current scope note:
  - Campaign status transitions are implemented in-app (including `SCHEDULED`), but provider-backed dispatch workers are planned for Phase 5 integration.

## Phase 5 - Provider Integration and Webhooks
- [x] Integrate selected provider (SendGrid/AWS SES/Resend/Mailgun).
- [x] Add `/api/webhooks/[provider]` endpoint(s).
- [x] Map provider events to internal `Event` records.
- [x] Implement idempotent webhook handling.

Exit criteria:
- Provider delivery events are reliably persisted.

Phase 5 implementation notes:
- Provider dispatch layer added:
  - `src/lib/providers/email.ts`
  - Supports `MAIL_PROVIDER=mock` (default), `MAIL_PROVIDER=resend`, and `MAIL_PROVIDER=aws-ses`.
  - Resend send path uses `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
  - AWS SES send path uses `AWS_REGION` and `AWS_SES_FROM_EMAIL`, with AWS credentials resolved by the default SDK provider chain.
- Dashboard mail settings added:
  - `/dashboard/settings`
  - Persists provider configuration and credentials encrypted in `MailSettings`
  - Includes a live test email action using the currently selected provider
- Campaign send trigger endpoint added:
  - `POST /api/campaigns/[id]/send`
  - Transitions campaign `DRAFT|SCHEDULED -> SENDING -> SENT|FAILED`.
  - Creates `SENT` event rows per sent contact.
- Webhook ingestion endpoint added:
  - `POST /api/webhooks/[provider]`
  - Accepts `events` array or single payload object.
  - Maps provider event labels to internal event types.
  - Updates contact status for `BOUNCED` and `UNSUBSCRIBED`.
- Idempotency implemented with unique provider event key:
  - `Event.providerEventId` is unique and webhook writes use `upsert`.
- Prisma schema updates:
  - `Campaign.provider`
  - `Event.provider`, `Event.providerEventId`, `Event.providerMessageId`
- Phase 5 migration:
  - `prisma/migrations/20260601070000_phase5_provider_events/migration.sql`

## Phase 6 - Analytics and Reporting
- [x] Build `/dashboard/analytics` with KPI cards + trends.
- [x] Add campaign-level metrics (sent/opened/clicked/bounced/unsubscribed).
- [x] Add filtering by campaign/date/list.

Exit criteria:
- Dashboard reflects real event data from webhooks.

Phase 6 implementation notes:
- Added analytics aggregation helper:
  - `src/lib/analytics.ts`
- Added analytics API endpoint:
  - `GET /api/analytics/summary`
  - Supports filters: `campaignId`, `listId`, `from`, `to`
  - Returns KPI counts + derived rates (`openRate`, `clickRate`, `bounceRate`, `unsubscribeRate`)
- Added analytics dashboard page:
  - `/dashboard/analytics`
  - Includes filter controls and KPI/rate rendering
- Updated dashboard overview (`/dashboard`) to use live analytics metrics instead of static placeholders.
- Extended middleware protection for `/api/analytics/*`.

## Phase 7 - Quality, Ops, and Release Hardening
- [x] Add API tests for lists/contacts/campaign flows.
- [x] Add validation, error boundaries, and logging.
- [x] Add env docs and deployment checklist.
- [x] Prepare production DB migration path (SQLite -> Postgres if required).

Exit criteria:
- Core flows covered by tests and deploy-ready documentation.

Phase 7 implementation notes:
- Added repeatable API smoke test coverage:
  - `scripts/run_api_smoke.sh`
  - Covers auth, lists, contacts, campaign send, webhook ingestion, analytics assertions.
  - Added script command: `pnpm run smoke:api`
- Added validation and operational hardening:
  - Added optional webhook shared-secret verification (`x-webhook-secret`) in `/api/webhooks/[provider]`.
  - Added campaign send failure logging (`campaign_send_failed`) with campaign context.
  - Added script command: `pnpm run type-check`
- Added environment and deployment docs:
  - `.env.example`
  - `docs/DEPLOYMENT_CHECKLIST.md`
- Added production DB migration guide:
  - `docs/DB_MIGRATION_SQLITE_TO_POSTGRES.md`
- Verification completed for Phase 7:
  - `pnpm run type-check` passed
  - `pnpm exec next build` passed
  - `pnpm run smoke:api` passed

## Outstanding Product Choices
- Email provider (must support event webhooks).
- Auth mode (email/password only vs social login).
- Template editor complexity (simple HTML/RTE vs drag-and-drop).
- Production database hosting target.
