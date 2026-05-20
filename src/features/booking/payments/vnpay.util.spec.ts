import * as crypto from 'crypto';
import {
  buildVnpayUrl,
  formatVnpayDate,
  getClientIp,
  mapVnpayErrorCode,
  verifyVnpaySignature,
} from './vnpay.util';

describe('vnpay.util — Phase 5', () => {
  const cfg = {
    tmnCode: 'TESTCODE',
    hashSecret: 'test-secret-key',
    paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  };

  const params = {
    amount: 500000,
    orderInfo: 'Thanh toan dich vu Facial tai Glowora',
    txnRef: 'apt-001-1700000000000',
    clientIp: '127.0.0.1',
    returnUrl: 'http://localhost:8080/payments/vnpay/return',
  };

  // ─── buildVnpayUrl ────────────────────────────────────────────────────────

  describe('buildVnpayUrl', () => {
    it('starts with the VNPAY payment gateway URL', () => {
      const url = buildVnpayUrl(params, cfg);
      expect(url).toMatch(/^https:\/\/sandbox\.vnpayment\.vn/);
    });

    it('includes vnp_Amount = amount × 100', () => {
      const url = buildVnpayUrl(params, cfg);
      expect(url).toContain('vnp_Amount=50000000');
    });

    it('includes vnp_TxnRef in query string', () => {
      const url = buildVnpayUrl(params, cfg);
      expect(url).toContain('vnp_TxnRef=apt-001-1700000000000');
    });

    it('includes vnp_SecureHash at the end', () => {
      const url = buildVnpayUrl(params, cfg);
      expect(url).toContain('vnp_SecureHash=');
    });

    it('generated URL passes its own signature verification', () => {
      const url = buildVnpayUrl(params, cfg);
      const qs = url.split('?')[1];
      const raw: Record<string, string> = {};
      new URLSearchParams(qs).forEach((v, k) => { raw[k] = v; });

      expect(verifyVnpaySignature(raw, cfg.hashSecret)).toBe(true);
    });
  });

  // ─── verifyVnpaySignature ─────────────────────────────────────────────────

  describe('verifyVnpaySignature', () => {
    const buildSignedParams = (base: Record<string, string> = {}): Record<string, string> => {
      const p: Record<string, string> = {
        vnp_Amount: '50000000',
        vnp_TxnRef: 'test-ref',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        ...base,
      };
      const signData = Object.keys(p)
        .sort()
        .map((k) => `${k}=${encodeURIComponent(p[k]).replace(/%20/g, '+')}`)
        .join('&');
      const hash = crypto
        .createHmac('sha512', cfg.hashSecret)
        .update(Buffer.from(signData, 'utf-8'))
        .digest('hex');
      return { ...p, vnp_SecureHash: hash };
    };

    it('returns true for valid HMAC-SHA512 signature', () => {
      expect(verifyVnpaySignature(buildSignedParams(), cfg.hashSecret)).toBe(true);
    });

    it('returns false when vnp_SecureHash is absent', () => {
      const p = buildSignedParams();
      const { vnp_SecureHash, ...rest } = p;
      expect(verifyVnpaySignature(rest, cfg.hashSecret)).toBe(false);
    });

    it('returns false when a parameter is tampered with after signing', () => {
      const p = buildSignedParams();
      p['vnp_Amount'] = '1'; // tamper
      expect(verifyVnpaySignature(p, cfg.hashSecret)).toBe(false);
    });

    it('returns false when wrong hash secret is used', () => {
      expect(verifyVnpaySignature(buildSignedParams(), 'wrong-secret')).toBe(false);
    });

    it('is case-insensitive for the hash comparison', () => {
      const p = buildSignedParams();
      p['vnp_SecureHash'] = p['vnp_SecureHash'].toUpperCase();
      expect(verifyVnpaySignature(p, cfg.hashSecret)).toBe(true);
    });
  });

  // ─── mapVnpayErrorCode ────────────────────────────────────────────────────

  describe('mapVnpayErrorCode', () => {
    it.each([
      ['24', 'Bạn đã hủy giao dịch'],
      ['51', 'Tài khoản không đủ số dư'],
      ['11', 'Hết hạn chờ thanh toán'],
      ['12', 'Thẻ/tài khoản bị khóa'],
      ['75', 'Ngân hàng đang bảo trì'],
    ])('maps code %s correctly', (code, expected) => {
      expect(mapVnpayErrorCode(code)).toBe(expected);
    });

    it('returns a fallback message containing the unknown code', () => {
      const msg = mapVnpayErrorCode('99');
      expect(msg).toContain('99');
    });
  });

  // ─── formatVnpayDate ──────────────────────────────────────────────────────

  describe('formatVnpayDate', () => {
    it('produces exactly 14 numeric characters', () => {
      const result = formatVnpayDate(new Date('2026-05-19T10:30:45'));
      expect(result).toHaveLength(14);
      expect(result).toMatch(/^\d{14}$/);
    });

    it('pads single-digit month and day with leading zero', () => {
      const result = formatVnpayDate(new Date('2026-01-05T09:05:03'));
      expect(result.substring(0, 8)).toBe('20260105');
    });
  });

  // ─── getClientIp ──────────────────────────────────────────────────────────

  describe('getClientIp', () => {
    it('returns the first IP from x-forwarded-for header', () => {
      const req = { headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } };
      expect(getClientIp(req)).toBe('203.0.113.1');
    });

    it('handles array x-forwarded-for header', () => {
      const req = { headers: { 'x-forwarded-for': ['10.1.2.3', '10.4.5.6'] } };
      expect(getClientIp(req)).toBe('10.1.2.3');
    });

    it('falls back to req.ip when no x-forwarded-for', () => {
      expect(getClientIp({ ip: '192.168.1.10', headers: {} })).toBe('192.168.1.10');
    });

    it('returns 127.0.0.1 when no headers and no ip', () => {
      expect(getClientIp({})).toBe('127.0.0.1');
    });
  });
});
