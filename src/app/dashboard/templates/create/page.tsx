import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { TemplateCreateClient } from './template-create-client';

export default async function TemplateCreatePage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');

  return <TemplateCreateClient />;
}
