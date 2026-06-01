export function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID?.trim() || '';
}

export function getGoogleClientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
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
