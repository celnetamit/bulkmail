import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { APP_ROUTES } from '@/lib/routes';
import { ListDetailClient } from './list-detail-client';

export default async function ListDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect(APP_ROUTES.LOGIN);

  const { id } = params;

  return <ListDetailClient listId={id} />;
}
