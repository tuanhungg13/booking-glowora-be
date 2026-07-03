// k6 load test: 500 users viewing their appointments (GET /bookings/my) at
// the same time.
//
// Usage:
//   k6 run load-tests/view-appointments-500-users.js
//   k6 run -e BASE_URL=http://localhost:8080 -e VUS=500 load-tests/view-appointments-500-users.js
//
// Prerequisites: same as book-appointments-100-users.js (API running, DB
// seeded with prisma/seed_200_stores.sql).
//
// There are only ~325 pre-seeded demo accounts (60 owners + ~265 staff), so
// for 500 VUs some accounts are reused across VUs - harmless for a read-only
// GET, since access tokens are stateless JWTs and concurrent reads on the
// same account don't conflict.
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { loginPool } from './lib/accounts.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const VUS = Number(__ENV.VUS || 500);

const viewDuration = new Trend('view_bookings_duration_ms', true);

export const options = {
  scenarios: {
    view_appointments: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: '3m',
    },
  },
  setupTimeout: '180s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    view_bookings_duration_ms: ['p(95)<1000'],
  },
};

export function setup() {
  const pool = loginPool(BASE_URL, VUS);
  if (pool.length === 0) {
    throw new Error('Không đăng nhập được tài khoản demo nào (owner.sNNN@glowora.local, mật khẩu Owner@123456).');
  }
  if (pool.length < VUS) {
    console.warn(`Chỉ có ${pool.length}/${VUS} tài khoản demo - một số VU sẽ dùng chung tài khoản (bình thường với GET).`);
  }
  console.log(`Setup xong: ${pool.length} tài khoản đã đăng nhập.`);
  return { tokens: pool.map((a) => a.token) };
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];

  const res = http.get(`${BASE_URL}/bookings/my?page=1&limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: 'ViewMyBookings' },
  });

  viewDuration.add(res.timings.duration);

  check(res, {
    'status là 200': (r) => r.status === 200,
    'response có field data': (r) => {
      const body = (() => {
        try {
          return r.json();
        } catch {
          return null;
        }
      })();
      return !!body && 'data' in body;
    },
  });
}
