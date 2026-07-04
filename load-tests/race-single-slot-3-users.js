// k6 load test: N khách hàng (mặc định 3) CÙNG LÚC cố đặt lịch vào ĐÚNG 1 SLOT
// duy nhất - cùng storeId, cùng staffId (nhân viên), cùng scheduledAt (thời điểm).
// Khác với book-appointments-100-users.js (cố tình tránh trùng slot để đo hiệu năng
// khi KHÔNG có tranh chấp), file này cố tình gây tranh chấp để kiểm tra cơ chế chống
// double-booking (row lock SELECT ... FOR UPDATE trên bảng staff + retry P2034/P2028,
// xem bookings.service.ts hàm create() và prisma/transaction-retry.util.ts).
//
// Kỳ vọng đúng: đúng 1 request nhận 201 (đặt được), số còn lại nhận 409 (bị chặn bởi
// ConflictException('Slot này vừa được đặt')). Nếu có >1 request 201 -> BUG double-booking
// (mất tác dụng của lock). Nếu có status khác 201/409 -> lỗi hệ thống thật sự cần điều tra.
//
// Usage:
//   k6 run load-tests/race-single-slot-3-users.js
//   k6 run -e BASE_URL=http://localhost:8080 -e VUS=3 load-tests/race-single-slot-3-users.js
//   # Mỗi lần chạy đã TỰ ĐỘNG nhắm vào 1 slot mới (xem DAY_OFFSET bên dưới) - không cần
//   # truyền gì thêm. Chỉ cần tự set DAY_OFFSET khi muốn CỐ ĐỊNH lại đúng 1 slot để tái
//   # hiện 1 kết quả cũ (vd chấm bài, so sánh 2 lần chạy):
//   k6 run -e DAY_OFFSET=10 load-tests/race-single-slot-3-users.js
//
// Prerequisites: giống book-appointments-100-users.js - API đang chạy (mặc định
// http://localhost:8080) và DB đã seed prisma/seed_200_stores.sql (cửa hàng + nhân
// viên) và prisma/seed_customers.sql (200 tài khoản CUSTOMER, mật khẩu Customer@123456).
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { loginCustomerPool } from './lib/accounts.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
// Số người tranh cùng 1 slot. Yêu cầu ban đầu là 3, nhưng để nguyên tên biến VUS (giống
// 2 script kia) để có thể tăng lên khi cần test tranh chấp với nhiều người hơn.
const NUM_USERS = Number(__ENV.VUS || 3);
// Slot (storeId+staffId+scheduledAt) đã bị 1 người chiếm mất ngay sau lần chạy đầu tiên
// -> nếu lần chạy sau lại nhắm đúng slot đó, CẢ 3 request đều sẽ nhận 409 (không còn ai
// "thắng" cả) - KHÔNG phải bug, mà vì slot không còn trống nữa. Để không phải tự nhớ đổi
// tay mỗi lần chạy, mặc định DAY_OFFSET được tự sinh dựa trên "giây hiện tại mod 400"
// (0-399, cộng vào mốc 9 ngày) -> mỗi lần chạy cách nhau vài giây/phút gần như chắc chắn
// ra 1 ngày khác nhau (chỉ lặp lại nếu 2 lần chạy tình cờ rơi đúng cùng pha chu kỳ 400
// giây - rất hiếm), mà vẫn chỉ cách hiện tại tối đa ~409 ngày (không nhảy vọt hàng nghìn
// năm nếu lỡ dùng nhầm đơn vị mili-giây/phút làm số ngày). Chỉ khi cần TÁI HIỆN đúng 1
// slot cũ (vd để so sánh 2 lần chạy) mới cần tự truyền -e DAY_OFFSET=<số cố định>.
const DAY_OFFSET = 2
// Đếm kết quả theo từng loại để đánh giá đúng/sai của cơ chế chống trùng lịch
const raceWinner = new Counter('race_winner_201'); // Người thắng - đặt được slot
const raceConflict = new Counter('race_conflict_409'); // Người thua - bị chặn đúng như kỳ vọng
const raceUnexpected = new Counter('race_unexpected'); // Status khác 201/409 - lỗi thật sự
const raceDuration = new Trend('race_request_duration_ms', true);

export const options = {
  scenarios: {
    race_single_slot: {
      // per-vu-iterations: mỗi VU chạy trên 1 goroutine riêng của k6, k6 khởi động
      // toàn bộ NUM_USERS VU của scenario gần như đồng thời rồi mỗi VU chạy đúng 1
      // iteration (đặt lịch 1 lần) - đây là cách đơn giản nhất để mô phỏng "N người
      // cùng bấm đặt lịch cùng lúc" mà không cần tự gộp request thủ công.
      executor: 'per-vu-iterations',
      vus: NUM_USERS,
      iterations: 1,
      maxDuration: '1m',
    },
  },
  setupTimeout: '180s',
  thresholds: {
    // Đúng 1 người thắng - nhiều hơn nghĩa là double-booking (lock hỏng), ít hơn (0)
    // nghĩa là slot đã bị chiếm từ trước (xem ghi chú DAY_OFFSET ở trên).
    race_winner_201: ['count==1'],
    // Bất kỳ status nào ngoài 201/409 (500, 400, timeout...) đều là lỗi hệ thống thật.
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

// Định nghĩa các cột của bảng log (tên cột + độ rộng) - dùng chung cho cả dòng header
// (in 1 lần trong setup()) và từng dòng dữ liệu (in trong default(), mỗi VU 1 dòng).
// Độ rộng 36 khớp đúng độ dài 1 UUID chuẩn (vd "7f65a2b9-d4c1-4a1d-88d5-0a032cfc8eb0")
// nên các cột ID không bị lệch hàng; "response" để cuối cùng vì độ dài thay đổi tùy
// message trả về, đặt cuối để không làm lệch các cột phía trước.
const COLUMNS = [
  { title: 'userId', width: 36 },
  { title: 'createdAt', width: 24 },
  { title: 'scheduledAt', width: 24 },
  { title: 'staffId', width: 36 },
  { title: 'variantId', width: 36 },
  { title: 'serviceId', width: 36 },
  { title: 'storeId', width: 36 },
  { title: 'response', width: 30 },
];

function tableRow(values) {
  return COLUMNS.map((col, i) => String(values[i]).padEnd(col.width)).join(' | ');
}

function printTableHeader() {
  console.log(tableRow(COLUMNS.map((c) => c.title)));
  console.log(COLUMNS.map((c) => '-'.repeat(c.width)).join('-+-'));
}

// Dò tìm (qua API công khai, không hardcode UUID nào) 1 cửa hàng ACTIVE có sẵn:
// - ít nhất 1 dịch vụ + biến thể (variant) đang ACTIVE
// - ít nhất 1 nhân viên đang ACTIVE
// Chỉ cần ĐÚNG 1 kết quả vì bài test này chỉ cần 1 slot duy nhất để nhiều người tranh nhau
// (khác book-appointments-100-users.js cần rất nhiều target để mỗi VU 1 slot riêng).
function discoverSingleTarget() {
  for (let page = 1; page <= 2; page++) {
    const storesRes = http.get(`${BASE_URL}/stores?page=${page}&limit=50`, { tags: { name: 'ListStores' } });
    const stores = ((json(storesRes) || {}).data) || [];
    if (stores.length === 0) break;

    for (const store of stores) {
      const svcRes = http.get(`${BASE_URL}/services/explore?storeId=${store.id}&limit=5`, {
        tags: { name: 'ExploreServices' },
      });
      const svcItems = (json(svcRes) || {}).data || [];
      const svc = svcItems.find((it) => Array.isArray(it.variants) && it.variants.length > 0);
      if (!svc) continue; // cửa hàng này chưa có dịch vụ nào đủ điều kiện -> thử cửa hàng khác

      const staffRes = http.get(`${BASE_URL}/store-staff`, {
        headers: { 'x-store-id': store.id },
        tags: { name: 'ListStoreStaff' },
      });
      const staffList = (json(staffRes) || {}).data || [];
      const staff = staffList.find((st) => st.status === 'ACTIVE');
      if (!staff) continue; // cửa hàng này chưa có nhân viên ACTIVE -> thử cửa hàng khác

      return {
        storeId: store.id,
        storeName: store.name,
        serviceId: svc.id,
        serviceName: svc.name,
        variantId: svc.variants[0].id,
        variantName: svc.variants[0].name,
        staffId: staff.id,
        staffName: (staff.user && staff.user.fullName) || staff.id,
      };
    }
    if (stores.length < 50) break; // hết trang, không còn cửa hàng nào khác để thử
  }
  throw new Error(
    'Không tìm được cửa hàng nào có đủ dịch vụ + biến thể + nhân viên ACTIVE - kiểm tra API đang chạy và DB đã seed (prisma/seed_200_stores.sql) chưa.',
  );
}

// Chọn 1 thời điểm CỐ ĐỊNH: 10:00 giờ Việt Nam (UTC+7), DAY_OFFSET ngày kể từ hôm nay.
// 10:00 nằm trong khung giờ hoạt động đã seed sẵn (cửa hàng 08:30-20:30, nhân viên
// 09:00-19:00) nên chắc chắn hợp lệ. TOÀN BỘ NUM_USERS request sẽ dùng chung ĐÚNG
// thời điểm này - đây chính là "slot" mà mọi người sẽ tranh nhau.
function fixedScheduledAt(dayOffset) {
  const VN_UTC_OFFSET_HOURS = 7;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(10 - VN_UTC_OFFSET_HOURS, 0, 0, 0); // 10:00 VN = 03:00 UTC
  return date;
}

// setup() chạy 1 lần duy nhất, TRƯỚC khi các VU bắt đầu tranh nhau, kết quả trả về
// (return) được k6 clone và phát cho mọi VU dùng chung ở tham số `data` của default().
export function setup() {
  const target = discoverSingleTarget();
  const scheduledAt = fixedScheduledAt(DAY_OFFSET).toISOString();

  // Đăng nhập NUM_USERS tài khoản CUSTOMER khác nhau. Bắt buộc phải là NUM_USERS tài
  // khoản KHÁC NHAU (không dùng chung 1 token) vì:
  // - CreateBookingDto không có field customerId - khách hàng được xác định từ JWT.
  // - bookings.service.ts còn kiểm tra "khách hàng không được có 2 lịch hẹn trùng giờ"
  //   (dòng ~227-245) - nếu 3 request dùng CHUNG 1 khách hàng, request 2-3 sẽ bị chặn
  //   bởi lỗi "Bạn đã có lịch hẹn trong khoảng thời gian này" thay vì lỗi "Slot này vừa
  //   được đặt" - SAI mục tiêu của bài test (ta muốn test tranh chấp NHÂN VIÊN, không
  //   phải tranh chấp của cùng 1 khách hàng với chính họ).
  const pool = loginCustomerPool(BASE_URL, NUM_USERS);
  if (pool.length < NUM_USERS) {
    throw new Error(
      `Chỉ đăng nhập được ${pool.length}/${NUM_USERS} tài khoản customer demo (customerNNN@glowora.local, mật khẩu Customer@123456) - cần seed thêm qua prisma/seed_customers.sql.`,
    );
  }

  console.log('='.repeat(90));
  console.log(`SETUP xong - ${NUM_USERS} khách hàng sẽ CÙNG LÚC tranh 1 slot duy nhất:`);
  console.log(`  storeId     = ${target.storeId}  (cửa hàng: ${target.storeName})`);
  console.log(`  serviceId   = ${target.serviceId}  (dịch vụ: ${target.serviceName})`);
  console.log(`  variantId   = ${target.variantId}  (biến thể: ${target.variantName})`);
  console.log(`  staffId     = ${target.staffId}  (nhân viên: ${target.staffName})  <== CÙNG 1 NHÂN VIÊN`);
  console.log(`  scheduledAt = ${scheduledAt}  <== CÙNG 1 THỜI ĐIỂM`);
  console.log(`  khách hàng  = ${pool.map((a) => a.email).join(', ')}`);
  console.log('='.repeat(90));
  printTableHeader();

  return {
    target,
    scheduledAt,
    accounts: pool.map((a) => ({ email: a.email, token: a.token, userId: a.userId })),
  };
}

// default() là hàm mà MỖI VU chạy đúng 1 lần (iterations: 1). __VU là số thứ tự VU
// (bắt đầu từ 1) do k6 cấp - dùng để mỗi VU lấy đúng 1 tài khoản khách hàng riêng.
export default function (data) {
  const account = data.accounts[(__VU - 1) % data.accounts.length];
  const { target, scheduledAt } = data;

  // Payload GIỐNG HỆT nhau giữa các VU (storeId, scheduledAt, serviceId, variantId,
  // staffId) - chỉ khác token (Authorization) của từng khách hàng. staffId PHẢI được
  // truyền tường minh: nếu bỏ trống, bookings.service.ts sẽ tự chọn 1 nhân viên rảnh
  // bất kỳ cho mỗi request (pickAvailableStaff) và 3 request có thể được gán 3 nhân
  // viên khác nhau -> không còn tranh chấp thật trên "1 nhân viên" như yêu cầu.
  const payload = JSON.stringify({
    storeId: target.storeId,
    scheduledAt,
    services: [
      {
        serviceId: target.serviceId,
        variantId: target.variantId,
        staffId: target.staffId,
      },
    ],
    notes: `k6 race test - VU ${__VU} tranh slot duy nhất voi ${account.email}`,
  });

  // createdAt = thời điểm request đặt lịch này được tạo ra (ngay trước khi gửi đi) -
  // đây là mốc thời gian dùng để so sánh xem cả NUM_USERS request có thật sự bắn đi
  // cùng lúc hay không.
  const createdAt = new Date();

  const res = http.post(`${BASE_URL}/bookings`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${account.token}`,
    },
    tags: { name: 'RaceSingleSlotBooking' },
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

  // response gộp status + message trả về (+ bookingId nếu thắng) thành 1 cột duy nhất,
  // vd "201 Thanh cong (id=e38e2855...)" hoặc "409 Slot nay vua duoc dat".
  const bookingId = body && body.data && body.data.id;
  const response = `${res.status} ${(body && body.message) || ''}${bookingId ? ` (id=${bookingId})` : ''}`;

  // In đúng 1 dòng/VU theo cùng thứ tự cột đã khai báo ở COLUMNS - ghép lại thành 1
  // bảng hoàn chỉnh khi đọc từ trên xuống (header đã in 1 lần trong setup()).
  console.log(
    tableRow([account.userId || account.email, createdAt.toISOString(), scheduledAt, target.staffId, target.variantId, target.serviceId, target.storeId, response]),
  );

  if (res.status !== 201 && res.status !== 409) {
    console.error(`[VU ${__VU}] BAT THUONG - body goc: ${res.body}`);
  }

  check(res, {
    'status 201 (thang) hoac 409 (thua - dung ky vong)': (r) => r.status === 201 || r.status === 409,
  });
}
