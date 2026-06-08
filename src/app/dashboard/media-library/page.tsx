import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { APP_ROUTES } from '@/lib/routes';
import MediaLibraryClient from './media-library-client';

export const dynamic = 'force-dynamic';

export default async function MediaLibraryPage({
  searchParams,
}: {
  searchParams?: { pick?: string };
}) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect(APP_ROUTES.LOGIN);

  return <MediaLibraryClient pickMode={searchParams?.pick === '1'} />;
}
