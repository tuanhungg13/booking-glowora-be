// k6 load test: 100 users creating a booking (POST /bookings) at the same time.
//
// Usage:
//   k6 run load-tests/book-appointments-100-users.js
//   k6 run -e BASE_URL=http://localhost:8080 -e VUS=100 load-tests/book-appointments-100-users.js
//
// Prerequisites:
//   - booking-business API running (default http://localhost:8080)
//   - DB seeded with prisma/seed_200_stores.sql (60 demo stores, staff) AND
//     prisma/seed_customers.sql (200 demo CUSTOMER accounts, password
//     Customer@123456 - see prisma/seed_customers_accounts.md). Customer
//     accounts hold a global CUSTOMER role (storeId = NULL), so
//     BookingsService's "can't book at your own store" check never blocks
//     them - unlike owner/staff accounts, they can book ANY store with no
//     swap juggling needed.
//
// setup() discovers real bookable data from the running API itself (no
// hardcoded IDs): every active store (GET /stores), an active service+variant
// per store (GET /services/explore), and ALL active staff per store
// (GET /store-staff) - then logs in `VUS` distinct demo customer accounts.
//
// Only 60 demo stores exist, so 100 VUs can't each get a fully unique store -
// but every VU still gets a unique (store, staff, scheduledAt) combination:
// VUs are round-robin assigned across stores first (1 store + its 1st staff
// member per VU, e.g. 60 VUs -> 60 different stores, 60 different staff, same
// scheduledAt). Only once every store already has a booking does a store get
// reused, and reuse ALWAYS pairs it with a DIFFERENT staff member at that
// store (never the one already booked there) and a scheduledAt pushed 3h
// later (09:30, 12:30, 15:30, 18:30 VN time) - so no two VUs ever collide on
// store+staff+time.
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { loginCustomerPool } from './lib/accounts.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const VUS = Number(__ENV.VUS || 100);
// Cho phép đẩy ngày đặt lịch xa hơn khi chạy lại script nhiều lần trong cùng 1 ngày
// (mặc định +9 ngày kể từ hôm nay, xem scheduledAtForRound) - tránh toàn bộ request
// bị 409 do trùng scheduledAt với lần chạy trước, để đo đúng latency của nhánh 201.
const DAY_OFFSET = Number(__ENV.DAY_OFFSET || 9);

const bookingCreated = new Counter('booking_created');
const bookingConflict = new Counter('booking_conflict_409');
const bookingFailed = new Counter('booking_failed');
const bookingDuration = new Trend('booking_duration_ms', true);

export const options = {
  scenarios: {
    book_appointments: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: '3m',
    },
  },
  setupTimeout: '180s',
  thresholds: {
    // 201 = booked, 409 = slot conflict (only possible if this same test ran
    // earlier today and reused a scheduledAt - see scheduledAtForRound()).
    // Anything else (500, 400, 403, timeout...) is a real failure.
    booking_failed: ['count==0'],
  },
};

function json(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

// Discovers, purely via public API calls, one bookable
// {storeId, serviceId, variantId} plus every active staff id per active store.
function discoverStoreTargets() {
  const stores = [];
  for (let page = 1; page <= 2; page++) {
    const res = http.get(`${BASE_URL}/stores?page=${page}&limit=50`, { tags: { name: 'ListStores' } });
    const body = json(res);
    const items = (body && body.data) || [];
    for (const s of items) stores.push({ id: s.id, name: s.name });
    if (items.length < 50) break;
  }

  if (stores.length === 0) {
    throw new Error('GET /stores trả về rỗng - kiểm tra API đang chạy và DB đã seed (prisma/seed_200_stores.sql) chưa.');
  }

  const targets = [];
  for (const store of stores) {
    const svcRes = http.get(`${BASE_URL}/services/explore?storeId=${store.id}&limit=5`, {
      tags: { name: 'ExploreServices' },
    });
    const svcItems = (json(svcRes) || {}).data || [];
    const svc = svcItems.find((it) => Array.isArray(it.variants) && it.variants.length > 0);
    if (!svc) continue;

    const staffRes = http.get(`${BASE_URL}/store-staff`, {
      headers: { 'x-store-id': store.id },
      tags: { name: 'ListStoreStaff' },
    });
    const staffList = (json(staffRes) || {}).data || [];
    const staffIds = staffList.filter((st) => st.status === 'ACTIVE').map((st) => st.id);
    if (staffIds.length === 0) continue;

    targets.push({
      storeId: store.id,
      serviceId: svc.id,
      variantId: svc.variants[0].id,
      staffIds,
    });
  }

  if (targets.length === 0) {
    throw new Error('Không dựng được target đặt lịch nào (thiếu service/staff ACTIVE) - kiểm tra seed data.');
  }

  return targets;
}

// Round N of the same store is booked 3h later than round N-1: 09:30,
// 12:30, 15:30, 18:30 VN time (Asia/Ho_Chi_Minh, UTC+7), all inside the
// seeded 08:30-20:30 store hours / 09:00-19:00 staff hours. Once round 4
// is exhausted the 5th round wraps to the next day at 09:30 again.
function scheduledAtForRound(round) {
  const SLOTS_PER_DAY = 4;
  const SLOT_START_MIN = 9 * 60 + 30; // 09:30
  const SLOT_GAP_MIN = 3 * 60; // 3h
  const VN_UTC_OFFSET_HOURS = 7;

  const dayOffset = Math.floor(round / SLOTS_PER_DAY);
  const slotIndex = round % SLOTS_PER_DAY;
  const localMinutes = SLOT_START_MIN + slotIndex * SLOT_GAP_MIN;

  const date = new Date();
  date.setUTCDate(date.getUTCDate() + DAY_OFFSET + dayOffset);
  date.setUTCHours(Math.floor(localMinutes / 60) - VN_UTC_OFFSET_HOURS, localMinutes % 60, 0, 0);
  return date;
}

// Builds one bookable slot per (store, staff) pair, ordered round-major:
// round 0 = every store's 1st staff, round 1 = every store's 2nd staff, etc.
// Because it's round-major (not store-major), the first `targets.length`
// slots alone already cover every store exactly once, each with a distinct
// staff member - e.g. 60 stores -> the first 60 slots are 60 different
// stores AND 60 different staff, all at round 0's scheduledAt. Slot 61+
// reuses a store, but always with the NEXT staff member there (never one
// already used for that store) and round+1's scheduledAt (3h later), so no
// two slots ever share the same store+staff+time combination. A store with
// fewer staff than another simply runs out of rounds sooner and stops
// contributing further slots.
function buildBookingSlots(targets) {
  const maxStaffPerStore = Math.max(...targets.map((t) => t.staffIds.length));
  const slots = [];
  for (let round = 0; round < maxStaffPerStore; round++) {
    for (const t of targets) {
      if (round < t.staffIds.length) {
        slots.push({
          storeId: t.storeId,
          serviceId: t.serviceId,
          variantId: t.variantId,
          staffId: t.staffIds[round],
          round,
        });
      }
    }
  }
  return slots;
}

export function setup() {
  const targets = discoverStoreTargets();
  const slots = buildBookingSlots(targets);

  const pool = loginCustomerPool(BASE_URL, VUS);
  if (pool.length === 0) {
    throw new Error('Không đăng nhập được tài khoản customer demo nào (customerNNN@glowora.local, mật khẩu Customer@123456).');
  }
  if (pool.length < VUS) {
    console.warn(`Chỉ đăng nhập được ${pool.length}/${VUS} tài khoản customer demo - một số VU sẽ dùng lại tài khoản.`);
  }
  if (pool.length > slots.length) {
    console.warn(`Chỉ dựng được ${slots.length} cặp (cửa hàng, nhân viên) khả dụng cho ${pool.length} VU - một số VU sẽ dùng lại cặp store+staff (nhưng ở thời điểm khác).`);
  }

  const assignments = pool.map((acc, i) => ({
    token: acc.token,
    ...slots[i % slots.length],
  }));

  console.log(`Setup xong: ${targets.length} cửa hàng, ${slots.length} cặp (cửa hàng, nhân viên) khả dụng, ${assignments.length} tài khoản customer đã đăng nhập.`);
  return { assignments };
}

export default function (data) {
  const assignment = data.assignments[(__VU - 1) % data.assignments.length];

  const scheduledAt = scheduledAtForRound(assignment.round).toISOString();

  const payload = JSON.stringify({
    storeId: assignment.storeId,
    scheduledAt,
    services: [
      {
        serviceId: assignment.serviceId,
        variantId: assignment.variantId,
        staffId: assignment.staffId,
      },
    ],
    notes: 'k6 load test - 100 concurrent bookings',
  });

  const res = http.post(`${BASE_URL}/bookings`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${assignment.token}`,
    },
    tags: { name: 'CreateBooking' },
  });

  bookingDuration.add(res.timings.duration);

  if (res.status === 201) {
    bookingCreated.add(1);
  } else if (res.status === 409) {
    bookingConflict.add(1);
  } else {
    bookingFailed.add(1);
    console.error(`VU ${__VU} booking thất bại: status=${res.status} body=${res.body}`);
  }

  check(res, {
    'status 201 (created) hoặc 409 (slot conflict - chấp nhận được)': (r) => r.status === 201 || r.status === 409,
  });
}
