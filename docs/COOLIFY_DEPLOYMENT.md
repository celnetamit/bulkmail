# Coolify Deployment Guide

This app is ready to deploy from GitHub on Coolify with the included `Dockerfile`.

## What Coolify should use

- **Build pack:** `Dockerfile`
- **Exposed port:** `3000`
- **Deploy source:** GitHub repository
- **Auto deploy:** enabled on push to your production branch

## Storage

This app now uses Postgres.

In Coolify, add a Postgres database service and copy its connection string into `DATABASE_URL`.

## Environment variables

Set these in Coolify for production:

```env
DATABASE_URL=postgresql://postgres:password@your-postgres-host:5432/bulkmail?schema=public
AUTH_SECRET=replace-with-a-long-random-secret
APP_URL=https://bemail.panoptical.org
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ADMIN_EMAIL_ALLOWLIST=amit.rai@celnet.in,puneet.mehrotra@celnet.in
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
5. Add the Postgres service and set `DATABASE_URL` in the app environment.
6. Add the production environment variables, including Google OAuth.
7. Deploy.
8. On each new release, Coolify will rebuild from GitHub, initialize the Postgres schema, and then start Next.js.

## Post-deploy checks

- Open `/api/health`
- Sign in with Google using an admin-provisioned email
- Send a test campaign
- Confirm analytics and webhook events are updating

## Notes

- The image runs `scripts/init-postgres.js` at startup so schema objects exist before the app serves traffic.
- The runtime connects directly to `DATABASE_URL` through the database helper layer.
- Public self-registration is disabled; admins create user access from the dashboard, and users sign in through Google only.
- Google OAuth must use the public app URL, not an internal host like `0.0.0.0:3000`.
