# Deployment Checklist

For Coolify deployment, follow [docs/COOLIFY_DEPLOYMENT.md](./COOLIFY_DEPLOYMENT.md).

Quick checklist:

1. Push the repo to GitHub.
2. In Coolify, create an application from that GitHub repo.
3. Use the `Dockerfile` build pack.
4. Expose port `3000`.
5. Add a Postgres database service and set `DATABASE_URL`.
6. Set production environment variables in Coolify.
7. Deploy and confirm `/api/health` returns `200`.
8. Log in, send a test campaign, and verify analytics / webhook tracking.
