import * as crypto from 'crypto';

export function buildVietQrUrl(params: {
  bankBin: string;
  accountNo: string;
  accountName: string;
  amount: number;
  content: string;
}): string {
  const base = `https://img.vietqr.io/image/${params.bankBin}-${params.accountNo}-compact2.jpg`;
  const qs = new URLSearchParams({
    amount: String(Math.round(params.amount)),
    addInfo: params.content,
    accountName: params.accountName,
  });
  return `${base}?${qs.toString()}`;
}

export function generateSepayCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GWR';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function extractSepayCode(content: string): string | null {
  const match = content.toUpperCase().match(/GWR[A-Z2-9]{8}/);
  return match?.[0] ?? null;
}

// Dùng hash để so sánh an toàn (timingSafeEqual yêu cầu cùng độ dài)
export function verifySepayWebhook(authHeader: string | undefined, secret: string): boolean {
  if (!authHeader || !secret) return false;
  const token = authHeader.replace(/^Apikey\s+/i, '').trim();
  const a = crypto.createHash('sha256').update(token).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}
