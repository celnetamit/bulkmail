import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasCapability } from '@/lib/permissions';
import HousekeepingClient from './housekeeping-client';

export const dynamic = 'force-dynamic';

export default async function AdminHousekeepingPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');
  if (!hasCapability(user.role, 'manage_users')) redirect('/dashboard');

  return <HousekeepingClient />;
}
