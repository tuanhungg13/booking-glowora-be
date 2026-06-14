export const SKIP_DB_ERROR_LOG: Array<{ method: string; path: string }> = [
  { method: 'POST', path: '/auth/refresh' },
];

// NestJS throws "Cannot GET /path" when no route matches — always from scanners/bots against a NestJS server
const UNMATCHED_ROUTE_PATTERN = /^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /;

export function shouldSkipDbErrorLog(
  method?: string,
  url?: string,
  statusCode?: number,
  message?: string,
): boolean {
  if (!method || !url) return false;

  if (statusCode === 404 && message && UNMATCHED_ROUTE_PATTERN.test(message)) {
    return true;
  }

  const path = url.split('?')[0];
  return SKIP_DB_ERROR_LOG.some((r) => r.method === method && r.path === path);
}
