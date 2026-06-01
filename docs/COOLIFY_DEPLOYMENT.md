# Coolify Deployment Guide

This app is ready to deploy from GitHub on Coolify with the included `Dockerfile`.

## What Coolify should use

- **Build pack:** `Dockerfile`
- **Exposed port:** `3000`
- **Deploy source:** GitHub repository
- **Auto deploy:** enabled on push to your production branch

## Storage

This app stores its live database in SQLite at `prisma/dev.db`.

In Coolify, add persistent storage for:

- **Destination path:** `/app/prisma/dev.db`

Do not mount the whole `/app/prisma` directory, because that would hide the migrations and schema files that live in the image.

## Environment variables

Set these in Coolify for production:

```env
AUTH_SECRET=replace-with-a-long-random-secret
MAIL_PROVIDER=aws-ses
AWS_REGION=ap-south-1
AWS_SES_FROM_EMAIL=no-reply@yourdomain.com
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=... # optional
RESEND_API_KEY=... # only if using Resend
RESEND_FROM_EMAIL=... # only if using Resend
WEBHOOK_SHARED_SECRET=...
```

`NODE_ENV=production` and `PORT=3000` are already handled in the container image, but Coolify can still override `PORT` if needed.

## Deploy flow

1. Push the repo to GitHub.
2. Create a new Coolify application from that repository.
3. Choose the `Dockerfile` build pack.
4. Set the exposed port to `3000`.
5. Add the persistent storage mount for `/app/prisma/dev.db`.
6. Add the production environment variables.
7. Deploy.
8. On each new release, Coolify will rebuild from GitHub and run `prisma migrate deploy` before starting Next.js.

## Post-deploy checks

- Open `/api/health`
- Log in with your admin account
- Send a test campaign
- Confirm analytics and webhook events are updating

## Notes

- The image runs `prisma migrate deploy` at startup so schema changes are applied before the app serves traffic.
- If you later move to Postgres, the app should be updated to use a proper database URL and external database service. For now, SQLite works well as long as the database file is persisted.
