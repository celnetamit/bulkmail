import { requireAdminFromCookies } from '@/lib/auth';
import { listAllOverlapRows, normalizeOverlapFilter, normalizeOverlapSort } from '@/lib/admin-overlap';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function csvEscape(value: string | number) {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export async function GET(request: Request) {
  const auth = await requireAdminFromCookies();
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const filter = normalizeOverlapFilter(searchParams.get('overlapFilter'));
  const sort = normalizeOverlapSort(searchParams.get('overlapSort'));
  const rows = listAllOverlapRows({
    filter,
    sort,
    scope: {
      from: searchParams.get('overlapFrom')?.trim() || null,
      to: searchParams.get('overlapTo')?.trim() || null,
      teamId: searchParams.get('overlapTeamId')?.trim() || null,
      userId: searchParams.get('overlapUserId')?.trim() || null,
    },
  });

  const csv = [
    ['email', 'userCount', 'recordCount', 'subscribedCount', 'unsubscribedCount', 'bouncedCount'].join(','),
    ...rows.map((row) =>
      [
        csvEscape(row.email),
        csvEscape(row.userCount),
        csvEscape(row.recordCount),
        csvEscape(row.subscribedCount),
        csvEscape(row.unsubscribedCount),
        csvEscape(row.bouncedCount),
      ].join(','),
    ),
  ].join('\n');

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="shared-email-overlaps-${filter}-${sort}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
