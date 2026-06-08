export const APP_ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  ADMIN_DASHBOARD: '/dashboard/admin',
} as const;

export const API_ROUTES = {
  AUTH_GOOGLE_START: '/api/auth/google/start',
  AUTH_LOGOUT: '/api/auth/logout',
  ADMIN_IMPERSONATION_START: '/api/admin/impersonation/start',
  ADMIN_IMPERSONATION_END: '/api/admin/impersonation/end',
} as const;
