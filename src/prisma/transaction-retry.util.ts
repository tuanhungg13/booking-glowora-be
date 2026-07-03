import { Prisma } from '@prisma/client';

// P2034: write conflict/deadlock dưới Serializable isolation.
// P2028: transaction timeout khi chờ lock quá lâu.
// Cả 2 đều là lỗi thoáng qua, retry lại thường thành công ngay.
const RETRYABLE_CODES = new Set(['P2034', 'P2028']);

export async function retryTransaction<T>(
  fn: () => Promise<T>,
  options?: { retries?: number; baseDelayMs?: number },
): Promise<T> {
  const retries = options?.retries ?? 4;
  const baseDelayMs = options?.baseDelayMs ?? 50;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        RETRYABLE_CODES.has(err.code);
      if (!isRetryable || attempt >= retries) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
