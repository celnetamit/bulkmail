import { fail, ok } from '@/lib/http';
import { runHousekeeping } from '@/lib/housekeeping';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function readSecret(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return (
    request.headers.get('x-housekeeping-secret') ||
    new URL(request.url).searchParams.get('secret') ||
    ''
  ).trim();
}

async function handleCron(request: Request) {
  const expectedSecret = (process.env.HOUSEKEEPING_CRON_SECRET || '').trim();
  if (!expectedSecret) {
    return fail('HOUSEKEEPING_CRON_SECRET is not configured.', 503);
  }

  if (readSecret(request) !== expectedSecret) {
    return fail('Unauthorized', 401);
  }

  const result = await runHousekeeping({
    triggeredBy: 'cron',
    mode: 'cron',
  });

  return ok(result);
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
