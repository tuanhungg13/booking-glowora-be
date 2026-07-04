// k6 load test: 4 người CÙNG LÚC cố chiếm ĐÚNG 1 SLOT duy nhất (cùng storeId, cùng
// staffId, cùng scheduledAt) - NHƯNG trộn 2 LOẠI luồng tạo lịch khác nhau thay vì cả 4
// đều tự đặt như race-single-slot-3-users.js:
//   - VU 1, 2: khách hàng TỰ đặt qua POST /bookings (giống race-single-slot-3-users.js).
//   - VU 3, 4: nhân viên/chủ cửa hàng tạo lịch VÃNG LAI (walk-in) qua
//     POST /store-bookings/walk-in cho khách không có tài khoản.
// Hai luồng này là 2 method riêng trong bookings.service.ts (create() và createWalkIn())
// nhưng dùng CHUNG cơ chế chống double-booking (SELECT ... FOR UPDATE trên bảng staff +
// retry P2034/P2028) - bài test này kiểm tra khoá đó có serialize đúng CẢ KHI tranh chấp
// xảy ra XUYÊN 2 luồng khác nhau, không chỉ riêng luồng tự đặt.
//
// Kỳ vọng đúng: đúng 1/4 request nhận 201 (đặt được, không phân biệt luồng nào thắng),
// 3 request còn lại nhận 409 (ConflictException('Slot này vừa được đặt')). Nếu có >1
// request 201 -> BUG double-booking xuyên luồng. Nếu có status khác 201/409 -> lỗi hệ
// thống thật sự cần điều tra.
//
// Usage:
//   k6 run load-tests/race-single-slot-4-users-mixed.js
//   k6 run -e BASE_URL=http://localhost:8080 load-tests/race-single-slot-4-users-mixed.js
//   # Giống race-single-slot-3-users.js: mỗi lần chạy tự nhắm 1 slot MỚI (DAY_OFFSET tự
//   # sinh). Chỉ tự truyền DAY_OFFSET khi cần TÁI HIỆN đúng 1 slot cố định:
//   k6 run -e DAY_OFFSET=10 load-tests/race-single-slot-4-users-mixed.js
//
// Số người mỗi luồng CỐ ĐỊNH 2 tự đặt + 2 walk-in (không có -e VUS= như file 3-user,
// vì bài test này cố tình cố định đúng tỉ lệ 2+2 để so 2 luồng, không phải tăng số người).
//
// Prerequisites: giống race-single-slot-3-users.js - API đang chạy (mặc định
// http://localhost:8080), DB đã seed prisma/seed_200_stores.sql (cửa hàng + owner + nhân
// viên) và prisma/seed_customers.sql (200 tài khoản CUSTOMER). Owner của cửa hàng được
// chọn (owner.sXXX@glowora.local, mật khẩu Owner@123456) đóng vai actor gọi walk-in, vì
// role SHOP_STAFF không có quyền CREATE_APPOINTMENT (xem prisma/seed.ts).
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { loginCustomerPool, login, ownerCandidateEmails, OWNER_PASSWORD } from './lib/accounts.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const NUM_USERS = 4; // cố định 2 tự đặt (VU 1-2) + 2 walk-in (VU 3-4)
// Xem giải thích DAY_OFFSET trong race-single-slot-3-users.js - tự sinh theo giây hiện
// tại để mỗi lần chạy nhắm 1 slot mới, tránh phải tự đổi tay.
const DAY_OFFSET = 1

const raceWinner = new Counter('race_winner_201'); // Người thắng - đặt được slot
const raceConflict = new Counter('race_conflict_409'); // Người thua - bị chặn đúng như kỳ vọng
const raceUnexpected = new Counter('race_unexpected'); // Status khác 201/409 - lỗi thật sự
const raceDuration = new Trend('race_request_duration_ms', true);

export const options = {
  scenarios: {
    race_single_slot_mixed: {
      executor: 'per-vu-iterations',
      vus: NUM_USERS,
      iterations: 1,
      maxDuration: '1m',
    },
  },
  setupTimeout: '180s',
  thresholds: {
    race_winner_201: ['count==1'],
    race_unexpected: ['count==0'],
  },
};

function json(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

const COLUMNS = [
  { title: 'type', width: 10 },
  { title: 'actor', width: 36 },
  { title: 'createdAt', width: 24 },
  { title: 'scheduledAt', width: 24 },
  { title: 'staffId', width: 36 },
  { title: 'response', width: 30 },
];

function tableRow(values) {
  return COLUMNS.map((col, i) => String(values[i]).padEnd(col.width)).join(' | ');
}

function printTableHeader() {
  console.log(tableRow(COLUMNS.map((c) => c.title)));
  console.log(COLUMNS.map((c) => '-'.repeat(c.width)).join('-+-'));
}

// Khác discoverSingleTarget() của race-single-slot-3-users.js (dò qua GET /stores công
// khai): ở đây phải dò bắt đầu TỪ tài khoản owner, vì walk-in cần actor là đúng owner của
// cửa hàng được chọn (owner mới có quyền CREATE_APPOINTMENT - xem prisma/seed.ts). Đăng
// nhập lần lượt owner.sXXX, lấy cửa hàng của họ qua GET /stores/mine, kiểm tra ACTIVE +
// có dịch vụ/biến thể/nhân viên ACTIVE - cửa hàng đầu tiên thoả điều kiện được chọn.
function discoverTargetWithOwner() {
  for (const ownerEmail of ownerCandidateEmails()) {
    const account = login(BASE_URL, ownerEmail, OWNER_PASSWORD);
    if (!account) continue; // tài khoản không tồn tại - thử owner tiếp theo

    const storesRes = http.get(`${BASE_URL}/stores/mine`, {
      headers: { Authorization: `Bearer ${account.token}` },
      tags: { name: 'FindMyStores' },
    });
    const stores = (json(storesRes) || {}).data || [];

    for (const store of stores) {
      if (store.status !== 'ACTIVE') continue;

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
      const staff = staffList.find((st) => st.status === 'ACTIVE');
      if (!staff) continue;

      return {
        storeId: store.id,
        storeName: store.name,
        serviceId: svc.id,
        serviceName: svc.name,
        variantId: svc.variants[0].id,
        variantName: svc.variants[0].name,
        staffId: staff.id,
        staffName: (staff.user && staff.user.fullName) || staff.id,
        ownerEmail,
        ownerToken: account.token,
      };
    }
  }
  throw new Error(
    'Không tìm được owner nào có cửa hàng đủ dịch vụ + biến thể + nhân viên ACTIVE - kiểm tra API đang chạy và DB đã seed (prisma/seed_200_stores.sql) chưa.',
  );
}

// Giống fixedScheduledAt() của race-single-slot-3-users.js: 10:00 giờ VN, DAY_OFFSET
// ngày kể từ hôm nay - nằm trong khung giờ hoạt động đã seed sẵn.
function fixedScheduledAt(dayOffset) {
  const VN_UTC_OFFSET_HOURS = 7;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(10 - VN_UTC_OFFSET_HOURS, 0, 0, 0);
  return date;
}

export function setup() {
  const target = discoverTargetWithOwner();
  const scheduledAt = fixedScheduledAt(DAY_OFFSET).toISOString();

  // 2 khách hàng KHÁC NHAU cho VU 1-2 (tự đặt) - bắt buộc khác nhau, lý do xem
  // race-single-slot-3-users.js (tránh bị chặn bởi lỗi "khách đã có lịch trùng giờ").
  const customers = loginCustomerPool(BASE_URL, 2);
  if (customers.length < 2) {
    throw new Error(
      `Chỉ đăng nhập được ${customers.length}/2 tài khoản customer demo - cần seed thêm qua prisma/seed_customers.sql.`,
    );
  }

  console.log('='.repeat(90));
  console.log('SETUP xong - 4 người tranh 1 slot duy nhất (2 tự đặt + 2 walk-in):');
  console.log(`  storeId     = ${target.storeId}  (cửa hàng: ${target.storeName})`);
  console.log(`  serviceId   = ${target.serviceId}  (dịch vụ: ${target.serviceName})`);
  console.log(`  variantId   = ${target.variantId}  (biến thể: ${target.variantName})`);
  console.log(`  staffId     = ${target.staffId}  (nhân viên: ${target.staffName})  <== CÙNG 1 NHÂN VIÊN`);
  console.log(`  scheduledAt = ${scheduledAt}  <== CÙNG 1 THỜI ĐIỂM`);
  console.log(`  owner (actor walk-in) = ${target.ownerEmail}`);
  console.log(`  khách tự đặt (VU 1-2) = ${customers.map((a) => a.email).join(', ')}`);
  console.log('  khách walk-in (VU 3-4) = Khach vang lai 1, Khach vang lai 2 (không có tài khoản)');
  console.log('='.repeat(90));
  printTableHeader();

  return {
    target,
    scheduledAt,
    customers: customers.map((a) => ({ email: a.email, token: a.token })),
  };
}

export default function (data) {
  const { target, scheduledAt } = data;
  const isWalkIn = __VU > 2; // VU 1-2 = tự đặt, VU 3-4 = walk-in

  const services = [
    {
      serviceId: target.serviceId,
      variantId: target.variantId,
      staffId: target.staffId,
    },
  ];

  let url;
  let headers;
  let actorLabel;
  let type;

  if (!isWalkIn) {
    const customer = data.customers[__VU - 1];
    url = `${BASE_URL}/bookings`;
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customer.token}`,
    };
    actorLabel = customer.email;
    type = 'SELF_BOOK';
  } else {
    const walkInIndex = __VU - 2; // 1 hoặc 2
    url = `${BASE_URL}/store-bookings/walk-in`;
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${target.ownerToken}`,
      'x-store-id': target.storeId,
    };
    actorLabel = `walk-in guest ${walkInIndex} (owner: ${target.ownerEmail})`;
    type = 'WALK_IN';
  }

  const payload = !isWalkIn
    ? JSON.stringify({
      storeId: target.storeId,
      scheduledAt,
      services,
      notes: `k6 race test (mixed) - VU ${__VU} tu dat, tranh slot duy nhat`,
    })
    : JSON.stringify({
      scheduledAt,
      services,
      guestName: `Khach vang lai ${__VU - 2}`,
      guestPhone: `090000000${__VU - 2}`,
      notes: `k6 race test (mixed) - VU ${__VU} walk-in, tranh slot duy nhat`,
    });

  const createdAt = new Date();

  const res = http.post(url, payload, {
    headers,
    tags: { name: isWalkIn ? 'RaceMixedWalkInBooking' : 'RaceMixedSelfBooking' },
  });

  const body = json(res);
  raceDuration.add(res.timings.duration);

  if (res.status === 201) {
    raceWinner.add(1);
  } else if (res.status === 409) {
    raceConflict.add(1);
  } else {
    raceUnexpected.add(1);
  }

  const bookingId = body && body.data && body.data.id;
  const response = `${res.status} ${(body && body.message) || ''}${bookingId ? ` (id=${bookingId})` : ''}`;

  console.log(
    tableRow([type, actorLabel, createdAt.toISOString(), scheduledAt, target.staffId, response]),
  );

  if (res.status !== 201 && res.status !== 409) {
    console.error(`[VU ${__VU}] BAT THUONG - body goc: ${res.body}`);
  }

  check(res, {
    'status 201 (thang) hoac 409 (thua - dung ky vong)': (r) => r.status === 201 || r.status === 409,
  });
}
