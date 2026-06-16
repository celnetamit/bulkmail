import { APP_ROUTES } from '@/lib/routes';

export function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID?.trim() || '';
}

export function getGoogleClientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
}

export function getAppOrigin(request: Request) {
  const envOrigin =
    process.env.APP_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.COOLIFY_URL?.trim() ||
    '';

  if (envOrigin) {
    try {
      return new URL(envOrigin).origin;
    } catch {
      // fall through to request-derived origin
    }
  }

  // In production we must NOT trust attacker-controllable forwarding headers
  // (x-forwarded-host / host) to build OAuth redirect_uris or post-login
  // redirects, since that enables host-header injection / open redirect.
  // Configure APP_URL/PUBLIC_APP_URL instead; otherwise fall back to the
  // framework-parsed request origin.
  if (process.env.NODE_ENV === 'production') {
    return new URL(request.url).origin;
  }

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
  const forwardedHost =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host')?.trim() ||
    '';

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export function sanitizeNextPath(nextPath: string | null) {
  if (!nextPath) return APP_ROUTES.DASHBOARD;
  if (!nextPath.startsWith('/')) return APP_ROUTES.DASHBOARD;
  if (nextPath.startsWith('//')) return APP_ROUTES.DASHBOARD;
  return nextPath;
}

export function getGoogleRedirectUri(origin: string) {
  return `${origin}/api/auth/google/callback`;
}
