import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { ListDetailClient } from './list-detail-client';

export default async function ListDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');

  const { id } = params;

  return <ListDetailClient listId={id} />;
}
