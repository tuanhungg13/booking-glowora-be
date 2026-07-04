# Load tests (k6)

Các kịch bản test tải cho `booking-business`:

| File | Kịch bản |
|---|---|
| `book-appointments-100-users.js` | 100 user cùng lúc **tạo** lịch hẹn (`POST /bookings`), mỗi user 1 slot riêng (không trùng nhau) |
| `view-appointments-500-users.js` | 500 user cùng lúc **xem** lịch hẹn của mình (`GET /bookings/my`) |
| `race-single-slot-3-users.js` | 3 user (có thể tăng qua `-e VUS=`) cùng lúc tranh **ĐÚNG 1 slot** (cùng cửa hàng, cùng nhân viên, cùng thời điểm) - kiểm tra cơ chế chống double-booking |
| `race-single-slot-4-users-mixed.js` | 4 user cùng lúc tranh **ĐÚNG 1 slot**, nhưng trộn 2 luồng: 2 người **tự đặt** (`POST /bookings`) + 2 lịch **walk-in** do owner tạo (`POST /store-bookings/walk-in`) - kiểm tra khoá chống double-booking có serialize đúng XUYÊN 2 luồng khác nhau |

## Chuẩn bị

1. Cài [k6](https://k6.io/docs/get-started/installation/).
2. Chạy API backend (mặc định `http://localhost:8080`).
3. DB đã có dữ liệu demo từ:
   - `prisma/seed_200_stores.sql` (60 cửa hàng, mỗi cửa hàng có 1 owner + 4-5 staff,
     mật khẩu chung `Owner@123456` - xem `prisma/seed_200_accounts.md`). Dùng cho cả
     2 script (staff làm nguồn dữ liệu cửa hàng/nhân viên) và làm tài khoản gọi API
     cho `view-appointments-500-users.js`.
   - `prisma/seed_customers.sql` (200 tài khoản CUSTOMER, mật khẩu chung
     `Customer@123456` - xem `prisma/seed_customers_accounts.md`). Tài khoản
     CUSTOMER giữ role toàn cục (không gắn cửa hàng nào), nên không bị
     `BookingsService` chặn ở bất kỳ cửa hàng nào - `book-appointments-100-users.js`
     dùng các tài khoản này làm khách hàng thật.

## Chạy

```bash
k6 run load-tests/book-appointments-100-users.js
k6 run load-tests/view-appointments-500-users.js
k6 run load-tests/race-single-slot-3-users.js
k6 run load-tests/race-single-slot-4-users-mixed.js

# Đổi URL backend hoặc số user:
k6 run -e BASE_URL=http://localhost:8080 -e VUS=100 load-tests/book-appointments-100-users.js
k6 run -e BASE_URL=http://localhost:8080 -e VUS=500 load-tests/view-appointments-500-users.js
k6 run -e BASE_URL=http://localhost:8080 -e VUS=3 load-tests/race-single-slot-3-users.js

# race-single-slot-3-users.js / race-single-slot-4-users-mixed.js tự động nhắm vào 1
# slot MỚI mỗi lần chạy (không cần làm gì thêm). Chỉ cần tự truyền DAY_OFFSET khi muốn
# TÁI HIỆN đúng 1 slot cố định:
k6 run -e DAY_OFFSET=10 load-tests/race-single-slot-3-users.js
k6 run -e DAY_OFFSET=10 load-tests/race-single-slot-4-users-mixed.js
```

## Cách hoạt động

Cả hai script dùng `setup()` để **tự khám phá dữ liệu thật qua API công khai**
(không hardcode UUID nào):

- `GET /stores` → danh sách cửa hàng ACTIVE.
- `GET /services/explore?storeId=...` → 1 dịch vụ + biến thể ACTIVE của cửa hàng.
- `GET /store-staff` (header `x-store-id`) → toàn bộ nhân viên ACTIVE của cửa hàng
  (script tạo lịch hẹn dùng hết danh sách này, không chỉ 1 người).
- `POST /auth/login` → đăng nhập từng tài khoản demo để lấy access token.

Script tạo lịch hẹn (`book-appointments-100-users.js`) đảm bảo mỗi VU có một cặp
**(cửa hàng, nhân viên, thời điểm)** không trùng với bất kỳ VU nào khác:
- Chỉ có 60 cửa hàng demo, nên không thể có >60 cửa hàng khác nhau tuyệt đối -
  thay vào đó, VU được rải round-robin qua tất cả cửa hàng khả dụng, mỗi cửa hàng
  ghép với 1 nhân viên khả dụng của nó. `slots[]` được dựng round-major (round 0 =
  nhân viên #1 của mọi cửa hàng, round 1 = nhân viên #2 của mọi cửa hàng, ...) nên
  `targets.length` slot đầu tiên đã phủ hết mọi cửa hàng, mỗi cửa hàng đúng 1 nhân
  viên (vd 60 VU đầu -> 60 cửa hàng khác nhau, 60 nhân viên khác nhau).
- Chỉ khi VU nhiều hơn số cửa hàng thì mới có cửa hàng bị dùng lại - và mỗi lần
  dùng lại luôn ghép với nhân viên **khác** (chưa từng dùng ở cửa hàng đó) và giờ
  đặt lịch cách round trước 3h (09:30, 12:30, 15:30, 18:30 giờ VN), nên không VU
  nào trùng cả 3 yếu tố cửa hàng + nhân viên + thời điểm. `staffId` được truyền
  tường minh để bỏ qua bước tự chọn nhân viên theo lịch làm việc.
- Đếm riêng `booking_created` (201), `booking_conflict_409` (409 - chỉ xảy ra nếu
  chạy lại script nhiều lần trong cùng ngày và trùng `scheduledAt`, không phải lỗi
  thật) và `booking_failed` (lỗi thật sự).

Script tranh chấp (`race-single-slot-3-users.js`) làm NGƯỢC LẠI: cố tình cho mọi VU
dùng chung **ĐÚNG 1** bộ `(storeId, staffId, scheduledAt)` để kiểm tra cơ chế chống
double-booking (`SELECT ... FOR UPDATE` trên bảng `staff` + retry deadlock P2034/P2028
trong `bookings.service.ts` / `prisma/transaction-retry.util.ts`):
- Chỉ đăng nhập `VUS` tài khoản CUSTOMER khác nhau (bắt buộc khác nhau - nếu dùng
  chung 1 khách hàng thì request thứ 2 trở đi sẽ bị chặn bởi lỗi "khách đã có lịch
  hẹn trùng giờ" thay vì lỗi tranh chấp nhân viên mà bài test thật sự muốn đo).
- Log dạng **bảng**, mỗi VU 1 dòng, cột: `userId | createdAt | scheduledAt | staffId |
  variantId | serviceId | storeId | response` (header in 1 lần trong `setup()`,
  `createdAt` là thời điểm request được tạo ra ngay trước khi gửi, `response` gộp
  status + message + bookingId nếu thắng).
- Kỳ vọng: đúng 1 VU nhận `201` (`race_winner_201`), các VU còn lại nhận `409`
  (`race_conflict_409`). Có `>1` người thắng nghĩa là double-booking (lock hỏng);
  có status khác 201/409 rơi vào `race_unexpected` - lỗi hệ thống thật sự.

Script `race-single-slot-4-users-mixed.js` giống hệt bài test tranh chấp trên nhưng
CỐ ĐỊNH 4 VU chia 2 luồng khác nhau cùng nhắm 1 `(storeId, staffId, scheduledAt)`:
- VU 1, 2: khách hàng tự đặt qua `POST /bookings` (2 tài khoản CUSTOMER khác nhau).
- VU 3, 4: owner của cửa hàng tạo lịch **walk-in** qua `POST /store-bookings/walk-in`
  cho khách vãng lai (không có tài khoản, chỉ có `guestName`/`guestPhone`). Bắt buộc
  dùng owner làm actor vì role `SHOP_STAFF` không có quyền `CREATE_APPOINTMENT`
  (xem `prisma/seed.ts` - `STAFF_PERMISSIONS`).
- `setup()` dò tìm bắt đầu từ tài khoản owner (`owner.sXXX@glowora.local`, mật khẩu
  `Owner@123456`) qua `GET /stores/mine` thay vì `GET /stores` công khai, vì cần giữ
  luôn token của đúng owner sở hữu cửa hàng được chọn để gọi walk-in.
- `bookings.service.ts` có 2 method riêng cho 2 luồng này (`create()` và
  `createWalkIn()`) nhưng dùng CHUNG cơ chế khoá (`SELECT ... FOR UPDATE` trên staff),
  nên kỳ vọng vẫn giống bài test 3-user: đúng 1/4 request `201`, 3 request còn lại `409`.

## Kết quả cần xem

- `booking_created` / `booking_conflict_409` / `booking_failed` (script tạo lịch).
- `view_bookings_duration_ms` (p95) và `http_req_failed` (script xem lịch).
- `race_winner_201` (phải đúng bằng 1) / `race_conflict_409` / `race_unexpected`
  (phải bằng 0) (2 script tranh chấp 1 slot, kể cả bản trộn luồng).
- `http_req_duration` tổng quát cho cả bốn.
