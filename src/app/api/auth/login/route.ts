import { fail } from '@/lib/http';

export async function POST() {
  return fail('Password login is disabled. Use Google sign-in.', 410);
}
