# SQLite to Postgres Migration Path

## 1) Update datasource
- In `prisma/schema.prisma`, change:
  - `provider = "sqlite"` -> `provider = "postgresql"`
  - `url = env("DATABASE_URL")`

## 2) Set environment
- Add `DATABASE_URL=postgresql://user:pass@host:5432/dbname?schema=public`

## 3) Generate migration for Postgres
- `pnpm exec prisma migrate dev --name postgres_init`

## 4) Apply in production
- `pnpm exec prisma migrate deploy`

## 5) Data transfer options
- For fresh environments: deploy without historical SQLite data.
- For existing data: export SQLite rows and import to Postgres via ETL script (table order: User -> List -> Contact -> Template -> Campaign -> Event).

## 6) Verification
- Run API smoke script and confirm analytics counts.
