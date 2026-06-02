import { clearSessionCookie } from '@/lib/auth';
import { getAppOrigin } from '@/lib/google-oauth';
import { ok } from '@/lib/http';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const nextPath = url.searchParams.get('next');
  const origin = getAppOrigin(request);

  if (nextPath) {
    const response = NextResponse.redirect(new URL(nextPath, origin));
    clearSessionCookie(response);
    return response;
  }

  const response = ok({ success: true });
  clearSessionCookie(response);
  return response;
}
