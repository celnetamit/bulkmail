import { requireUserFromCookies } from '@/lib/auth';
import { ok } from '@/lib/http';

export async function GET() {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  return ok({
    user: {
      userId: auth.user.userId,
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.role,
      isActive: auth.user.isActive,
    },
  });
}
