import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { ListDetailClient } from './list-detail-client';

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');

  const { id } = await params;

  return <ListDetailClient listId={id} />;
}
