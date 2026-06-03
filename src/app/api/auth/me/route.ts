import { requireUserFromCookies } from '@/lib/auth';
import { getCapabilities } from '@/lib/permissions';
import { ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

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
      imageUploadLimitKb: auth.user.imageUploadLimitKb,
      senderFromEmail: auth.user.senderFromEmail,
      senderReplyToEmail: auth.user.senderReplyToEmail,
      capabilities: getCapabilities(auth.user.role),
    },
  });
}
