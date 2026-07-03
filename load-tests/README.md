# Load tests (k6)

Hai kịch bản test tải cho `booking-business`:

| File | Kịch bản |
|---|---|
| `book-appointments-100-users.js` | 100 user cùng lúc **tạo** lịch hẹn (`POST /bookings`) |
| `view-appointments-500-users.js` | 500 user cùng lúc **xem** lịch hẹn của mình (`GET /bookings/my`) |

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

# Đổi URL backend hoặc số user:
k6 run -e BASE_URL=http://localhost:8080 -e VUS=100 load-tests/book-appointments-100-users.js
k6 run -e BASE_URL=http://localhost:8080 -e VUS=500 load-tests/view-appointments-500-users.js
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

## Kết quả cần xem

- `booking_created` / `booking_conflict_409` / `booking_failed` (script tạo lịch).
- `view_bookings_duration_ms` (p95) và `http_req_failed` (script xem lịch).
- `http_req_duration` tổng quát cho cả hai.
