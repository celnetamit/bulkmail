import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import MediaLibraryClient from './media-library-client';

export const dynamic = 'force-dynamic';

export default async function MediaLibraryPage({
  searchParams,
}: {
  searchParams?: { pick?: string };
}) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');

  return <MediaLibraryClient pickMode={searchParams?.pick === '1'} />;
}
