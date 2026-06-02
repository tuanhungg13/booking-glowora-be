const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Chuyển chuỗi ngày "YYYY-MM-DD" thành khoảng [start, end] theo giờ Việt Nam (UTC+7). */
export function vnDateRange(from: string, to: string): { fromDate: Date; toDate: Date } {
  return {
    fromDate: new Date(`${from}T00:00:00+07:00`),
    toDate: new Date(`${to}T23:59:59.999+07:00`),
  };
}

/** Trả về chuỗi "YYYY-MM-DD" của ngày hôm nay theo giờ Việt Nam (UTC+7). */
export function vnTodayStr(): string {
  const vn = new Date(Date.now() + VN_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())}`;
}
