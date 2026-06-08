import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { APP_ROUTES } from '@/lib/routes';
import { TemplateCreateClient } from './template-create-client';

export const dynamic = 'force-dynamic';

export default async function TemplateCreatePage({
  searchParams,
}: {
  searchParams?: { templateId?: string };
}) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect(APP_ROUTES.LOGIN);

  return <TemplateCreateClient templateId={searchParams?.templateId} />;
}
