import * as crypto from 'crypto';

export function buildVnpayUrl(
  params: {
    amount: number;
    orderInfo: string;
    txnRef: string;
    clientIp: string;
    returnUrl: string;
  },
  config: {
    tmnCode: string;
    hashSecret: string;
    paymentUrl: string;
  },
): string {
  const vnpParams: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: config.tmnCode,
    vnp_Amount: String(Math.round(params.amount * 100)),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: params.txnRef,
    vnp_OrderInfo: params.orderInfo,
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: params.returnUrl,
    vnp_IpAddr: params.clientIp,
    vnp_CreateDate: formatVnpayDate(new Date()),
  };

  const sortedKeys = Object.keys(vnpParams).sort();
  const signData = sortedKeys
    .map((k) => `${k}=${encodeURIComponent(vnpParams[k]).replace(/%20/g, '+')}`)
    .join('&');

  const secureHash = crypto
    .createHmac('sha512', config.hashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  return `${config.paymentUrl}?${signData}&vnp_SecureHash=${secureHash}`;
}

export function verifyVnpaySignature(
  rawParams: Record<string, string>,
  hashSecret: string,
): boolean {
  const { vnp_SecureHash, vnp_SecureHashType, ...dataParams } = rawParams;
  if (!vnp_SecureHash) return false;

  const signData = Object.keys(dataParams)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(dataParams[k]).replace(/%20/g, '+')}`)
    .join('&');

  const calculatedHash = crypto
    .createHmac('sha512', hashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  return calculatedHash.toLowerCase() === vnp_SecureHash.toLowerCase();
}

export function formatVnpayDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

export function getClientIp(req: Record<string, unknown>): string {
  const headers = req.headers as Record<string, string | string[]> | undefined;
  if (headers) {
    const forwarded = headers['x-forwarded-for'];
    if (forwarded) {
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return first.split(',')[0].trim();
    }
  }
  return (req.ip as string) || '127.0.0.1';
}

export function mapVnpayErrorCode(code: string): string {
  const messages: Record<string, string> = {
    '07': 'Giao dịch bị nghi ngờ (fraud)',
    '09': 'Chưa đăng ký Internet Banking',
    '10': 'Xác thực thẻ thất bại quá 3 lần',
    '11': 'Hết hạn chờ thanh toán',
    '12': 'Thẻ/tài khoản bị khóa',
    '24': 'Bạn đã hủy giao dịch',
    '51': 'Tài khoản không đủ số dư',
    '65': 'Vượt hạn mức giao dịch trong ngày',
    '75': 'Ngân hàng đang bảo trì',
  };
  return messages[code] ?? `Giao dịch thất bại (mã ${code})`;
}
