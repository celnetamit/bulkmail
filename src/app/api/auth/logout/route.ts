import { clearSessionCookie } from '@/lib/auth';
import { ok } from '@/lib/http';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const nextPath = url.searchParams.get('next');

  if (nextPath) {
    const response = NextResponse.redirect(new URL(nextPath, request.url));
    clearSessionCookie(response);
    return response;
  }

  const response = ok({ success: true });
  clearSessionCookie(response);
  return response;
}
