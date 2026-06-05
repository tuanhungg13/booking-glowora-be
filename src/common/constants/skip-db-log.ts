export const SKIP_DB_ERROR_LOG: Array<{ method: string; path: string }> = [
  { method: 'POST', path: '/auth/refresh' },
];

export function shouldSkipDbErrorLog(method?: string, url?: string): boolean {
  if (!method || !url) return false;
  const path = url.split('?')[0];
  return SKIP_DB_ERROR_LOG.some((r) => r.method === method && r.path === path);
}
