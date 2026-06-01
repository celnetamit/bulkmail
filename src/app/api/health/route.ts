import { ok } from '@/lib/http';

export async function GET() {
  return ok({
    status: 'ok',
    service: 'mailflow-api',
    timestamp: new Date().toISOString(),
  });
}
