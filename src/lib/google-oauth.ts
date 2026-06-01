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
  if (!nextPath) return '/dashboard';
  if (!nextPath.startsWith('/')) return '/dashboard';
  if (nextPath.startsWith('//')) return '/dashboard';
  return nextPath;
}

export function getGoogleRedirectUri(origin: string) {
  return `${origin}/api/auth/google/callback`;
}
