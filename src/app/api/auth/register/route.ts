import { fail } from '@/lib/http';

export async function POST() {
  return fail('Public registration is disabled. Ask an admin to create your access.', 410);
}
