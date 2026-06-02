import { fail } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  return fail('Password login is disabled. Use Google sign-in.', 410);
}
