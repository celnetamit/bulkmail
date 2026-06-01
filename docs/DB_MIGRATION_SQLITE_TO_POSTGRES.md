# SQLite to Postgres Migration Note

This repo now runs on Postgres in production.

The app still keeps a local SQLite fallback for development when `DATABASE_URL` is not set, but the deployment path in Coolify should use a Postgres service and set `DATABASE_URL`.

## Production setup

- Set `provider = "postgresql"` in `prisma/schema.prisma`
- Provide `DATABASE_URL` in Coolify
- Let `scripts/init-postgres.js` create the schema on startup

## If you are migrating old SQLite data

- Fresh deployments can start empty on Postgres
- Existing SQLite data would need a one-time export/import into the new Postgres database
- Table order for a manual import is: `User -> List -> Contact -> Template -> Campaign -> Event`

## Verification

- Run the build
- Open `/api/health`
- Log in and send a test campaign
