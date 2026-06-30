# Tài liệu Schema — Glowora Booking Platform

> **Stack:** NestJS · Prisma · MySQL  
> **Mục đích:** Nền tảng đặt lịch dịch vụ làm đẹp (salon, spa, nail, ...) đa cửa hàng.

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Nhóm RBAC — Phân quyền](#2-nhóm-rbac--phân-quyền)
3. [Nhóm Người dùng & Địa chỉ](#3-nhóm-người-dùng--địa-chỉ)
4. [Nhóm Cửa hàng](#4-nhóm-cửa-hàng)
5. [Nhóm Nhân viên](#5-nhóm-nhân-viên)
6. [Nhóm Catalog dịch vụ](#6-nhóm-catalog-dịch-vụ)
7. [Nhóm Booking](#7-nhóm-booking)
8. [Nhóm Thanh toán](#8-nhóm-thanh-toán)
9. [Nhóm Đánh giá](#9-nhóm-đánh-giá)
10. [Nhóm Khuyến mãi](#10-nhóm-khuyến-mãi)
11. [Nhóm Chat](#11-nhóm-chat)
12. [Nhóm Thông báo](#12-nhóm-thông-báo)
13. [Nhóm Giám sát](#13-nhóm-giám-sát)
14. [Sơ đồ quan hệ tổng thể](#14-sơ-đồ-quan-hệ-tổng-thể)
15. [Luồng nghiệp vụ chính](#15-luồng-nghiệp-vụ-chính)

---

## 1. Tổng quan kiến trúc

Hệ thống có 3 loại actor chính:

| Actor | Mô tả |
|-------|-------|
| **SUPER_ADMIN** | Quản trị viên nền tảng — duyệt/khóa cửa hàng, quản lý toàn hệ thống |
| **SHOP_OWNER / MANAGER / STAFF** | Chủ/nhân viên cửa hàng — quản lý dịch vụ, booking, lịch làm |
| **CUSTOMER** | Khách hàng — tìm kiếm, đặt lịch, thanh toán, đánh giá |

Schema được chia thành 7 nhóm chức năng:

```
RBAC       → phân quyền đa cửa hàng
Identity   → người dùng & địa chỉ
Store      → cửa hàng, giờ hoạt động, thanh toán
Staff      → nhân viên, lịch làm, nghỉ phép
Catalog    → danh mục, dịch vụ, biến thể giá
Booking    → đặt lịch, thanh toán, review, khuyến mãi
Comm       → chat, thông báo, audit log
```

---

## 2. Nhóm RBAC — Phân quyền

> Hệ thống phân quyền đa tầng: Role → Permission, User → Role (có scope theo store)

### Sơ đồ quan hệ

```
Role ──< RolePermission >── Permission
 ↑
UserRole  (gắn user vào role, có thể giới hạn theo store cụ thể)
```

---

### 2.1 `roles` — Vai trò

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `name` | VARCHAR(100) | No | Tên hiển thị |
| `code` | VARCHAR(50) | No | Mã kỹ thuật định danh |
| `description` | TEXT | Yes | Mô tả vai trò |
| `is_system` | BOOLEAN | No | `true` = role hệ thống, seed sẵn, không xóa được |
| `store_id` | CHAR(36) FK | Yes | `null` = role toàn hệ thống; có giá trị = role riêng của store |

**Ràng buộc:** `UNIQUE(code, store_id)`

**Ví dụ dữ liệu:**

| id | name | code | is_system | store_id |
|----|------|------|-----------|----------|
| `role-001` | Quản trị hệ thống | `SUPER_ADMIN` | true | null |
| `role-002` | Khách hàng | `CUSTOMER` | true | null |
| `role-003` | Chủ cửa hàng | `SHOP_OWNER` | false | `store-abc` |
| `role-004` | Nhân viên | `STAFF` | false | `store-abc` |
| `role-005` | Chủ cửa hàng | `SHOP_OWNER` | false | `store-xyz` |

> **Điểm quan trọng:** `role-003` và `role-005` đều có code `SHOP_OWNER` nhưng thuộc 2 store khác nhau. Quyền của owner store ABC hoàn toàn độc lập với owner store XYZ.

---

### 2.2 `permissions` — Quyền hạn

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `code` | VARCHAR(100) UNIQUE | No | Mã kỹ thuật |
| `name` | VARCHAR(150) | No | Tên hiển thị |
| `description` | TEXT | Yes | Mô tả quyền |

**Ví dụ dữ liệu:**

| id | code | name |
|----|------|------|
| `perm-001` | `booking.create` | Tạo lịch đặt |
| `perm-002` | `booking.confirm` | Xác nhận lịch đặt |
| `perm-003` | `booking.cancel` | Hủy lịch đặt |
| `perm-004` | `service.create` | Tạo dịch vụ |
| `perm-005` | `staff.manage` | Quản lý nhân viên |
| `perm-006` | `store.approve` | Duyệt cửa hàng (admin only) |

---

### 2.3 `role_permissions` — Bảng trung gian Role ↔ Permission

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `role_id` | CHAR(36) FK PK | Tham chiếu Role |
| `permission_id` | CHAR(36) FK PK | Tham chiếu Permission |

**Ví dụ dữ liệu:**

| role_id | permission_id | Ý nghĩa |
|---------|---------------|---------|
| `role-001` | `perm-006` | SUPER_ADMIN được duyệt store |
| `role-003` | `perm-002` | SHOP_OWNER được xác nhận booking |
| `role-003` | `perm-004` | SHOP_OWNER được tạo dịch vụ |
| `role-003` | `perm-005` | SHOP_OWNER được quản lý nhân viên |
| `role-004` | `perm-002` | STAFF được xác nhận booking |
| `role-002` | `perm-001` | CUSTOMER được tạo booking |

---

### 2.4 `user_roles` — Gán vai trò cho người dùng

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `user_id` | CHAR(36) FK | No | Tham chiếu User |
| `role_id` | CHAR(36) FK | No | Tham chiếu Role |
| `store_id` | CHAR(36) FK | Yes | Scope cửa hàng (`null` = quyền toàn hệ thống) |
| `created_at` | DATETIME | No | Thời điểm gán |

**Ràng buộc:** `UNIQUE(user_id, role_id, store_id)`

**Ví dụ dữ liệu — kịch bản thực tế:**

> Giả sử: Chị Mai (user-mai) vừa là chủ Salon ABC, vừa đặt lịch ở nơi khác

| id | user_id | role_id | store_id | Ý nghĩa |
|----|---------|---------|----------|---------|
| `ur-1` | `user-mai` | `role-002` | null | Chị Mai là CUSTOMER trên hệ thống |
| `ur-2` | `user-mai` | `role-003` | `store-abc` | Chị Mai là OWNER của Salon ABC |
| `ur-3` | `user-hung` | `role-004` | `store-abc` | Anh Hùng là STAFF tại Salon ABC |
| `ur-4` | `user-hung` | `role-002` | null | Anh Hùng cũng là CUSTOMER (để đặt lịch nơi khác) |
| `ur-5` | `user-admin` | `role-001` | null | Admin hệ thống (không thuộc store nào) |

> **Kết luận:** 1 user có thể giữ nhiều vai trò ở nhiều store khác nhau. Quyền hạn được kiểm tra theo context: gọi API với `X-Store-ID: store-abc` → hệ thống load role của user trong phạm vi store đó.

---

## 3. Nhóm Người dùng & Địa chỉ

### 3.1 `users` — Người dùng

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `full_name` | VARCHAR(100) | No | Họ và tên |
| `email` | VARCHAR(150) UNIQUE | No | Email đăng nhập |
| `password` | TEXT | No | Bcrypt hash (cost=10) |
| `phone` | VARCHAR(20) | Yes | Số điện thoại |
| `address` | VARCHAR(300) | Yes | Địa chỉ tự do |
| `province_id` | INT FK | Yes | Tỉnh/thành phố |
| `ward_id` | INT FK | Yes | Xã/phường |
| `avatar_url` | VARCHAR(500) | Yes | URL ảnh (Cloudinary) |
| `status` | ENUM | No | `ACTIVE / INACTIVE / BANNED / SUSPENDED` |
| `refresh_token` | TEXT | Yes | Bcrypt hash của refresh token (không lưu raw) |
| `banned_at` | DATETIME | Yes | Thời điểm bị ban |
| `ban_reason` | TEXT | Yes | Lý do bị ban |
| `created_at` | DATETIME | No | Ngày tạo |
| `updated_at` | DATETIME | No | Ngày cập nhật |

**Ví dụ dữ liệu:**

| id | full_name | email | status | province_id |
|----|-----------|-------|--------|-------------|
| `user-mai` | Nguyễn Thị Mai | mai@gmail.com | ACTIVE | 1 (Hà Nội) |
| `user-hung` | Trần Văn Hùng | hung@gmail.com | ACTIVE | 79 (TP.HCM) |
| `user-admin` | Admin System | admin@glowora.vn | ACTIVE | null |
| `user-guest` | Lê Thị Lan | lan@gmail.com | BANNED | 48 (Đà Nẵng) |

> **Thiết kế `refresh_token`:** Lưu hash thay vì token thô. Khi refresh, token cũ bị blacklist trên Redis, token mới được hash và ghi đè. Logout → set `null` → toàn bộ phiên đăng nhập bị thu hồi ngay lập tức.

---

### 3.2 `provinces` — Tỉnh/Thành phố

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | INT PK | ID hành chính Việt Nam |
| `code` | CHAR(2) UNIQUE | Mã 2 ký tự |
| `name` | VARCHAR(100) | Tên |
| `type` | VARCHAR(10) | `tinh` hoặc `thanh-pho` |

**Ví dụ dữ liệu:**

| id | code | name | type |
|----|------|------|------|
| 1 | 01 | Hà Nội | thanh-pho |
| 48 | 48 | Đà Nẵng | thanh-pho |
| 79 | 79 | Hồ Chí Minh | thanh-pho |
| 58 | 58 | Khánh Hòa | tinh |

---

### 3.3 `wards` — Xã/Phường

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | INT PK | ID hành chính |
| `province_id` | INT FK | Thuộc tỉnh nào |
| `name` | VARCHAR(100) | Tên |
| `type` | VARCHAR(10) | `phuong`, `xa`, `thi-tran` |

**Ví dụ dữ liệu:**

| id | province_id | name | type |
|----|-------------|------|------|
| 1001 | 1 | Phường Hoàn Kiếm | phuong |
| 1002 | 1 | Phường Tây Hồ | phuong |
| 7001 | 79 | Phường Bến Nghé | phuong |

---

## 4. Nhóm Cửa hàng

### 4.1 `stores` — Cửa hàng

**Thông tin cơ bản:**

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `slug` | VARCHAR(200) UNIQUE | Yes | URL-friendly (VD: `nail-salon-ha-noi`) |
| `owner_id` | CHAR(36) FK | No | Chủ cửa hàng |
| `name` | VARCHAR(150) | No | Tên cửa hàng |
| `phone` | VARCHAR(20) | No | SĐT |
| `email` | VARCHAR(150) | Yes | Email |
| `description` | TEXT | Yes | Mô tả |
| `address` | VARCHAR(300) | No | Địa chỉ chi tiết |
| `ward_id` | INT FK | Yes | Phường/xã |
| `province_id` | INT FK | Yes | Tỉnh/thành |
| `latitude` | FLOAT | Yes | Tọa độ GPS |
| `longitude` | FLOAT | Yes | Tọa độ GPS |
| `logo_url` | VARCHAR(500) | Yes | URL logo |
| `banner_url` | VARCHAR(500) | Yes | URL banner |
| `status` | ENUM StoreStatus | No | `PENDING / ACTIVE / INACTIVE / BANNED` |
| `approved_by_id` | CHAR(36) FK | Yes | Admin duyệt |
| `approved_at` | DATETIME | Yes | Thời điểm duyệt |
| `rejection_reason` | TEXT | Yes | Lý do từ chối |

**Cấu hình booking:**

| Trường | Kiểu | Default | Mô tả |
|--------|------|---------|-------|
| `timezone` | VARCHAR(50) | `Asia/Ho_Chi_Minh` | Timezone local của store |
| `slot_interval_mins` | INT | 30 | Bước nhảy slot (phút). VD: 30 → 08:00, 08:30, 09:00... |
| `cancel_before_hours` | INT | 2 | Khách chỉ được hủy trước N giờ |
| `max_advance_days` | INT | 30 | Đặt tối đa trước N ngày |
| `auto_confirm` | BOOLEAN | false | Tự xác nhận không cần staff duyệt |
| `deposit_percent` | INT | 0 | % tiền cọc (0 = không yêu cầu cọc) |

**Thống kê (denormalized):**

| Trường | Mô tả |
|--------|-------|
| `avg_rating` | Rating trung bình — recalculate sau mỗi review mới |
| `total_reviews` | Tổng reviews — tránh COUNT(*) khi hiển thị danh sách |

**KYC — CCCD & Giấy phép kinh doanh:** (dùng để admin xét duyệt)

| Nhóm | Các trường |
|------|-----------|
| CCCD | `cccd_full_name`, `citizen_id`, `cccd_date_of_birth`, `cccd_gender`, `cccd_front_url`, `cccd_back_url`, ... |
| Giấy phép KD | `biz_name`, `biz_code`, `biz_owner_name`, `biz_address`, `business_license_url`, ... |

**Ví dụ dữ liệu:**

| id | name | slug | owner_id | status | deposit_percent | auto_confirm | slot_interval_mins |
|----|------|------|----------|--------|-----------------|--------------|-------------------|
| `store-abc` | Salon Tóc Mai Beauty | `salon-toc-mai-beauty` | `user-mai` | ACTIVE | 30 | false | 30 |
| `store-xyz` | Nail Art Hùng | `nail-art-hung` | `user-hung` | PENDING | 0 | true | 15 |

> **Đọc ví dụ:** Salon Mai yêu cầu cọc 30%, không tự xác nhận (staff phải approve từng booking). Nail Hùng chưa được duyệt, không yêu cầu cọc, tự xác nhận ngay.

---

### 4.2 `working_hours` — Giờ làm việc

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `store_id` | CHAR(36) FK | No | Thuộc store |
| `day_of_week` | ENUM DayOfWeek | No | `MONDAY` ... `SUNDAY` |
| `open_time` | VARCHAR(5) | No | Giờ mở cửa `"HH:MM"` |
| `close_time` | VARCHAR(5) | No | Giờ đóng cửa `"HH:MM"` |
| `is_closed` | BOOLEAN | No | `true` = nghỉ cả ngày |

**Ràng buộc:** `UNIQUE(store_id, day_of_week)` — mỗi store chỉ có 1 bản ghi mỗi ngày

**Ví dụ dữ liệu (Salon ABC):**

| store_id | day_of_week | open_time | close_time | is_closed |
|----------|-------------|-----------|------------|-----------|
| `store-abc` | MONDAY | 08:00 | 20:00 | false |
| `store-abc` | TUESDAY | 08:00 | 20:00 | false |
| `store-abc` | WEDNESDAY | 08:00 | 20:00 | false |
| `store-abc` | THURSDAY | 08:00 | 20:00 | false |
| `store-abc` | FRIDAY | 08:00 | 21:00 | false |
| `store-abc` | SATURDAY | 09:00 | 21:00 | false |
| `store-abc` | SUNDAY | — | — | **true** |

> **Lý do lưu dạng `VARCHAR "HH:MM"`:** Giờ mở cửa là local time của store (không phải UTC), không gắn với ngày cụ thể. String `"08:00"` đủ để so sánh và tính offset phút — không cần DateTime.

---

### 4.3 `store_payment_configs` — Cấu hình thanh toán

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `store_id` | CHAR(36) FK UNIQUE | No | Quan hệ 1-1 với Store |
| `bank_bin` | VARCHAR(10) | No | Mã BIN ngân hàng |
| `bank_account_no` | VARCHAR(30) | No | Số tài khoản |
| `bank_account_name` | VARCHAR(100) | No | Tên chủ tài khoản (UPPERCASE) |
| `webhook_secret` | CHAR(64) | Yes | 32-byte hex để verify webhook Sepay |
| `is_active` | BOOLEAN | No | Bật/tắt tính năng |

**Ví dụ dữ liệu:**

| store_id | bank_bin | bank_account_no | bank_account_name | is_active |
|----------|----------|-----------------|-------------------|-----------|
| `store-abc` | 970436 | 1234567890 | NGUYEN THI MAI | true |

> **Tại sao tách bảng riêng:** Không phải store nào cũng cấu hình thanh toán online. `findUnique` trả về `null` nếu chưa setup — rõ ràng hơn là để cột nullable trong `stores`.

> **Cơ chế Sepay Webhook:** Khách chuyển khoản → Sepay gọi `POST /payments/webhook/{storeId}` → server verify `Authorization` header bằng `webhook_secret` → tìm booking → cập nhật trạng thái.

---

## 5. Nhóm Nhân viên

> 5 bảng phối hợp để tính chính xác "nhân viên X có rảnh lúc Y giờ ngày Z không?"

```
Staff ── StaffSchedule      (lịch làm cố định hàng tuần)
      ── StaffDayOff        (đơn xin nghỉ — override trừ ngày)
      ── StaffCallIn        (manager gọi thêm — override cộng ngày)
      ── StaffScheduleHistory (audit trail mỗi khi lịch thay đổi)
      ── StaffInvite        (lời mời tham gia store)
```

---

### 5.1 `staff` — Hồ sơ nhân viên

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `user_id` | CHAR(36) FK | No | Tài khoản User |
| `store_id` | CHAR(36) FK | No | Làm tại store nào |
| `specialty` | VARCHAR(200) | Yes | Chuyên môn |
| `bio` | TEXT | Yes | Tiểu sử ngắn |
| `phone` | VARCHAR(20) | Yes | SĐT riêng tại store |
| `rating` | DECIMAL(3,2) | No | Rating trung bình |
| `total_reviews` | INT | No | Tổng đánh giá (denormalized) |
| `status` | ENUM StaffStatus | No | `ACTIVE / INACTIVE / DELETED` |

**Ràng buộc:** `UNIQUE(user_id, store_id)`

**Ví dụ dữ liệu:**

| id | user_id | store_id | specialty | rating | status |
|----|---------|----------|-----------|--------|--------|
| `staff-001` | `user-hung` | `store-abc` | Cắt tóc nam, Uốn tóc | 4.80 | ACTIVE |
| `staff-002` | `user-lan` | `store-abc` | Nhuộm tóc, Làm móng | 4.65 | ACTIVE |
| `staff-003` | `user-mai` | `store-abc` | Tất cả dịch vụ | 4.90 | ACTIVE |

> **Lưu ý:** `user-mai` (chủ store) cũng có hồ sơ Staff để hệ thống có thể assign booking cho cô ấy khi cần. Owner cũng là nhân viên về mặt hệ thống.

> **Tại sao Staff tách khỏi User:** 1 người có thể là nhân viên ở nhiều store với chuyên môn, rating, lịch làm khác nhau. Tách bảng để lưu thông tin riêng tại từng store.

---

### 5.2 `staff_invites` — Lời mời tham gia

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `store_id` | CHAR(36) FK | No | Store mời |
| `staff_id` | CHAR(36) FK | Yes | Điền sau khi người nhận chấp nhận |
| `email` | VARCHAR(150) | No | Email được mời |
| `token` | VARCHAR(200) UNIQUE | No | Token gửi qua email |
| `status` | ENUM StaffInviteStatus | No | `PENDING / ACCEPTED / EXPIRED / CANCELLED` |
| `expires_at` | DATETIME | No | Hạn token |

**Luồng mời nhân viên:**

```
1. Owner nhập email → POST /staff-invites
2. Hệ thống tạo record PENDING + token ngẫu nhiên
3. Gửi email có link: "https://glowora.vn/invite?token=abc123"
4. Người nhận click → GET /staff-invites/accept?token=abc123
5. Hệ thống tạo Staff record → gán role STAFF → set staff_id vào invite → ACCEPTED
```

**Ví dụ dữ liệu:**

| store_id | email | status | expires_at |
|----------|-------|--------|------------|
| `store-abc` | newstaff@gmail.com | PENDING | 2025-07-05 10:00 |
| `store-abc` | oldstaff@gmail.com | ACCEPTED | 2025-06-01 10:00 |

---

### 5.3 `staff_schedules` — Lịch làm cố định theo tuần

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `store_id` | CHAR(36) FK | No | Store |
| `staff_id` | CHAR(36) FK | No | Nhân viên |
| `day_of_week` | ENUM DayOfWeek | No | Thứ trong tuần |
| `start_time` | VARCHAR(5) | No | Giờ bắt đầu `"HH:MM"` |
| `end_time` | VARCHAR(5) | No | Giờ kết thúc `"HH:MM"` |
| `is_active` | BOOLEAN | No | `false` = tạm dừng mà không xóa |

**Ràng buộc:** `UNIQUE(staff_id, day_of_week)`

**Ví dụ dữ liệu (Anh Hùng - staff-001):**

| staff_id | day_of_week | start_time | end_time | is_active |
|----------|-------------|------------|----------|-----------|
| `staff-001` | MONDAY | 09:00 | 18:00 | true |
| `staff-001` | TUESDAY | 09:00 | 18:00 | true |
| `staff-001` | WEDNESDAY | 09:00 | 18:00 | true |
| `staff-001` | THURSDAY | 09:00 | 18:00 | true |
| `staff-001` | FRIDAY | 09:00 | 20:00 | true |
| `staff-001` | SATURDAY | 10:00 | 20:00 | true |
| `staff-001` | SUNDAY | — | — | **false** |

> Đây là lịch "mặc định" lặp lại mỗi tuần. Hệ thống dùng bảng này để biết nhân viên có làm ngày đó không khi tính available slots.

---

### 5.4 `staff_schedule_histories` — Lịch sử thay đổi lịch làm

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `staff_id` | CHAR(36) FK | No | Nhân viên |
| `store_id` | CHAR(36) FK | No | Store |
| `day_of_week` | ENUM | No | Thứ |
| `start_time` / `end_time` | VARCHAR(5) | No | Giờ làm tại thời điểm đó |
| `is_active` | BOOLEAN | No | Trạng thái tại thời điểm đó |
| `effective_from` | DATETIME | No | Lịch này có hiệu lực từ khi nào |
| `effective_to` | DATETIME | No | Lịch này hết hiệu lực khi nào |
| `changed_by` | CHAR(36) | Yes | Ai thay đổi |

**Ví dụ kịch bản:** Manager đổi giờ làm thứ Hai của Hùng từ 9h→18h thành 8h→17h vào ngày 2025-07-01:

| staff_id | day_of_week | start_time | end_time | effective_from | effective_to |
|----------|-------------|------------|----------|----------------|--------------|
| `staff-001` | MONDAY | 09:00 | 18:00 | 2025-01-01 | 2025-07-01 |
| `staff-001` | MONDAY | 08:00 | 17:00 | 2025-07-01 | 9999-12-31 |

> **Mục đích:** Audit trail để giải quyết tranh chấp "tôi đã làm đúng lịch", truy vết ai thay đổi lịch khi nào.

---

### 5.5 `staff_day_offs` — Đơn xin nghỉ

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `store_id` | CHAR(36) FK | No | Store |
| `staff_id` | CHAR(36) FK | No | Nhân viên xin nghỉ |
| `date` | DATE | No | Ngày nghỉ |
| `start_time` | VARCHAR(5) | **Yes** | `null` = nghỉ cả ngày; có giá trị = nghỉ từ giờ này |
| `end_time` | VARCHAR(5) | **Yes** | `null` = nghỉ cả ngày; có giá trị = nghỉ đến giờ này |
| `reason` | TEXT | Yes | Lý do nghỉ |
| `status` | ENUM DayOffStatus | No | `PENDING / APPROVED / REJECTED` |
| `reviewed_by` | CHAR(36) | Yes | Manager đã xử lý |
| `reviewed_at` | DATETIME | Yes | Thời điểm xử lý |
| `review_note` | TEXT | Yes | Ghi chú của manager |

**Ràng buộc:** `UNIQUE(staff_id, date)`

**Ví dụ dữ liệu:**

| staff_id | date | start_time | end_time | status | Ý nghĩa |
|----------|------|------------|----------|--------|---------|
| `staff-001` | 2025-07-10 | null | null | APPROVED | Hùng nghỉ cả ngày 10/7 |
| `staff-002` | 2025-07-15 | 13:00 | 18:00 | PENDING | Lan xin nghỉ chiều ngày 15/7 |

> **Logic tính slots quan trọng:** Cả `PENDING` và `APPROVED` đều block slot. Lý do: nếu chờ đến `APPROVED` mới block, khoảng thời gian pending sẽ vẫn hiện cho khách đặt → conflict khi manager approve. Phòng ngừa sớm hơn giải quyết sau.

---

### 5.6 `staff_call_ins` — Gọi nhân viên đi làm ngày nghỉ

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `staff_id` | CHAR(36) FK | No | Nhân viên được gọi |
| `store_id` | CHAR(36) FK | No | Store |
| `date` | DATE | No | Ngày gọi đi làm |
| `start_time` | VARCHAR(5) | Yes | Giờ bắt đầu (null = theo giờ store) |
| `end_time` | VARCHAR(5) | Yes | Giờ kết thúc (null = theo giờ store) |
| `status` | ENUM CallInStatus | No | `PENDING / ACCEPTED / REJECTED` |
| `note` | TEXT | Yes | Lý do/ghi chú của manager |

**Ràng buộc:** `UNIQUE(staff_id, date)`

**Ví dụ kịch bản:** Chủ nhật 13/7 Salon đông khách, manager gọi Hùng vào làm:

| staff_id | date | start_time | end_time | status | note |
|----------|------|------------|----------|--------|------|
| `staff-001` | 2025-07-13 | 10:00 | 18:00 | ACCEPTED | Chủ nhật đông, cần thêm người |

> **Logic:** Chỉ `ACCEPTED` mới được cộng vào available slots. Không cần `APPROVED` như DayOff — vì call-in là manager chủ động, rủi ro conflict thấp hơn.

---

### Logic tổng hợp tính "nhân viên X rảnh không?"

```
Ngày đặt: Thứ Hai 14/7/2025, Slot 10:00-11:00, Nhân viên Hùng (staff-001)

Bước 1 — Kiểm tra StaffSchedule:
  MONDAY: start=09:00, end=18:00, is_active=true → OK, Hùng làm thứ Hai

Bước 2 — Kiểm tra StaffDayOff:
  Ngày 14/7 không có record → OK, không nghỉ

Bước 3 — Kiểm tra StaffCallIn:
  Không cần thiết (Hùng đã có lịch tuần thứ Hai)

Bước 4 — Kiểm tra BookingItem đã có:
  SELECT * FROM booking_items WHERE staff_id='staff-001'
    AND start_time BETWEEN '14/7 00:00' AND '14/7 23:59'
  → Có: 09:00-09:30 (đã đặt)
  → Slot 10:00-11:00 KHÔNG bị overlap → Hùng RẢNh

Kết quả: Slot 10:00 AVAILABLE cho Hùng
```

---

## 6. Nhóm Catalog dịch vụ

### 6.1 `service_categories` — Danh mục dịch vụ

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `name` | VARCHAR(100) | No | Tên danh mục |
| `slug` | VARCHAR(120) UNIQUE | Yes | URL-friendly |
| `description` | TEXT | Yes | Mô tả |
| `banner_url` | VARCHAR(500) | Yes | Ảnh banner |
| `store_id` | CHAR(36) FK | **Yes** | `null` = danh mục toàn hệ thống; có giá trị = danh mục riêng store |
| `parent_id` | CHAR(36) FK self | Yes | Danh mục cha (cây phân cấp) |

**Ràng buộc:** `UNIQUE(name, store_id)`

**Ví dụ dữ liệu — cây 2 cấp:**

| id | name | store_id | parent_id | Cấp |
|----|------|----------|-----------|-----|
| `cat-001` | Tóc | null | null | Danh mục gốc (hệ thống) |
| `cat-002` | Móng | null | null | Danh mục gốc (hệ thống) |
| `cat-003` | Cắt tóc nữ | `store-abc` | `cat-001` | Con của "Tóc", riêng store ABC |
| `cat-004` | Uốn & Nhuộm | `store-abc` | `cat-001` | Con của "Tóc", riêng store ABC |
| `cat-005` | Làm móng gel | `store-abc` | `cat-002` | Con của "Móng", riêng store ABC |

> **Scope 2 cấp:** Hệ thống có danh mục gốc (Tóc, Móng, Da, Thư giãn...) do admin tạo. Mỗi store có danh mục riêng kế thừa từ danh mục gốc hoặc tạo mới hoàn toàn.

---

### 6.2 `services` — Dịch vụ

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `store_id` | CHAR(36) FK | No | Thuộc store |
| `category_id` | CHAR(36) FK | Yes | Thuộc danh mục |
| `name` | VARCHAR(150) | No | Tên dịch vụ |
| `slug` | VARCHAR(200) | Yes | URL-friendly (unique trong store) |
| `description` | TEXT | Yes | Mô tả |
| `image_urls` | JSON | Yes | Mảng URL ảnh: `["url1", "url2"]` |
| `status` | ENUM ServiceStatus | No | `ACTIVE / INACTIVE / DELETED` |
| `avg_rating` | DECIMAL(3,2) | No | Rating trung bình (denormalized) |

**Ví dụ dữ liệu:**

| id | store_id | category_id | name | avg_rating | status |
|----|----------|-------------|------|------------|--------|
| `svc-001` | `store-abc` | `cat-003` | Cắt tóc nữ | 4.75 | ACTIVE |
| `svc-002` | `store-abc` | `cat-004` | Nhuộm tóc | 4.60 | ACTIVE |
| `svc-003` | `store-abc` | `cat-005` | Làm móng gel | 4.80 | ACTIVE |

---

### 6.3 `service_variants` — Biến thể dịch vụ

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `service_id` | CHAR(36) FK | No | Thuộc dịch vụ nào |
| `name` | VARCHAR(150) | No | Tên biến thể |
| `description` | TEXT | Yes | Mô tả |
| `duration` | INT | No | Thời gian thực hiện **(phút)** |
| `price` | DECIMAL(12,2) | No | Giá niêm yết |
| `sort_order` | INT | No | Thứ tự hiển thị |
| `status` | ENUM ServiceStatus | No | `ACTIVE / INACTIVE / DELETED` |

**Ví dụ dữ liệu — Dịch vụ "Cắt tóc nữ" có 3 variant:**

| id | service_id | name | duration | price | sort_order |
|----|------------|------|----------|-------|------------|
| `var-001` | `svc-001` | Tóc ngắn | 30 | 150,000 | 0 |
| `var-002` | `svc-001` | Tóc trung | 45 | 180,000 | 1 |
| `var-003` | `svc-001` | Tóc dài | 60 | 220,000 | 2 |

**Dịch vụ "Nhuộm tóc":**

| id | service_id | name | duration | price |
|----|------------|------|----------|-------|
| `var-004` | `svc-002` | Nhuộm màu đơn | 90 | 350,000 |
| `var-005` | `svc-002` | Nhuộm ombre | 120 | 550,000 |

> **Đây là đơn vị cốt lõi của booking:** Khi đặt lịch, khách chọn `variant` → biết được `duration` (tính slot) và `price` (tính tiền). Giá và thời gian được **snapshot** vào booking_items tại thời điểm đặt.

---

## 7. Nhóm Booking

### 7.1 `bookings` — Lịch đặt

**Thông tin cơ bản:**

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `customer_id` | CHAR(36) FK | **Yes** | `null` nếu là guest booking (không đăng nhập) |
| `customer_name` | VARCHAR(150) | Yes | Snapshot tên khách lúc đặt |
| `customer_phone` | VARCHAR(20) | Yes | Snapshot SĐT lúc đặt |
| `customer_email` | VARCHAR(150) | Yes | Snapshot email lúc đặt |
| `store_id` | CHAR(36) FK | No | Store được đặt |
| `scheduled_at` | DATETIME | No | Giờ bắt đầu dịch vụ đầu tiên (UTC) |
| `total_duration` | INT | No | Tổng thời gian (phút) |

**Tính giá:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `total_price` | DECIMAL(12,2) | Tổng giá (sau promotion, trước coupon) |
| `discount_amount` | DECIMAL(12,2) | Giảm từ coupon |
| `promotion_discount` | DECIMAL(12,2) | Giảm từ promotion (chỉ để hiển thị) |
| `final_price` | DECIMAL(12,2) | `total_price - discount_amount` = số tiền thực trả |
| `coupon_id` | CHAR(36) FK | Coupon đã dùng |
| `promotion_id` | CHAR(36) FK | Promotion áp dụng |
| `promotion_name` | VARCHAR(150) | Snapshot tên promotion lúc đặt |

**Trạng thái & Cọc:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `status` | ENUM BookingStatus | Vòng đời booking |
| `deposit_amount` | DECIMAL(12,2) | Số tiền cọc cụ thể |
| `deposit_deadline` | DATETIME | Hạn nộp cọc |
| `deposit_paid_at` | DATETIME | Thời điểm đã nộp cọc |
| `notes` | TEXT | Ghi chú của khách |
| `cancellation_reason` | TEXT | Lý do hủy/từ chối |
| `confirmed_at` / `completed_at` / `cancelled_at` | DATETIME | Mốc thời gian |

**Ví dụ dữ liệu — kịch bản hoàn chỉnh:**

> Khách Hương đặt 2 dịch vụ: Cắt tóc trung (45p, 180k) + Nhuộm màu đơn (90p, 350k). Có coupon `SUMMER20` giảm 20%. Store yêu cầu cọc 30%.

| Trường | Giá trị |
|--------|---------|
| `id` | `bk-001` |
| `customer_id` | `user-huong` |
| `customer_name` | Nguyễn Thị Hương (snapshot) |
| `store_id` | `store-abc` |
| `scheduled_at` | 2025-07-15 09:00:00 UTC |
| `total_duration` | 135 phút (45 + 90) |
| `total_price` | 530,000đ (180k + 350k) |
| `promotion_discount` | 0 |
| `discount_amount` | 106,000đ (530k × 20%) |
| `final_price` | 424,000đ |
| `coupon_id` | `coupon-summer20` |
| `deposit_amount` | 127,200đ (424k × 30%) |
| `deposit_deadline` | 2025-07-15 03:00:00 UTC (+6h vì hẹn trong 2 ngày) |
| `status` | `DEPOSIT_PENDING` |

**Vòng đời BookingStatus:**

```
                  [Khách đặt lịch]
                        ↓
                    PENDING
                   ↙       ↘
         (store reject)  (store confirm)
            ↓                  ↓
         REJECTED          CONFIRMED ────────────────→ PAID
                           ↓ (nếu yêu cầu cọc)          ↓
                      DEPOSIT_PENDING              COMPLETED
                           ↓ (khách nộp cọc)
                       DEPOSIT_PAID
                           ↓ (khách thanh toán full)
                          PAID
                           ↓
                       COMPLETED

  [Bất kỳ stage nào, trừ COMPLETED/REJECTED] → CANCELLED
```

**Quy tắc tính deadline nộp cọc:**

| Khoảng cách đến giờ hẹn | Deadline nộp cọc |
|-------------------------|-----------------|
| > 7 ngày | + 24 giờ |
| > 24 giờ | + 6 giờ |
| > 6 giờ | + 2 giờ |
| > 2 giờ | + 1 giờ |
| ≤ 2 giờ | Miễn cọc tự động |

---

### 7.2 `booking_items` — Chi tiết từng dịch vụ trong booking

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `booking_id` | CHAR(36) FK | No | Thuộc booking nào |
| `sort_order` | INT | No | Thứ tự thực hiện: 0, 1, 2... |
| `service_id` | CHAR(36) FK | No | Dịch vụ |
| `variant_id` | CHAR(36) FK | No | Biến thể |
| `staff_id` | CHAR(36) FK | Yes | Nhân viên thực hiện |
| `start_time` | DATETIME | No | Giờ bắt đầu item này (UTC) |
| `duration` | INT | No | **Snapshot** thời gian lúc đặt |
| `original_price` | DECIMAL(12,2) | Yes | Giá gốc trước promotion |
| `price` | DECIMAL(12,2) | No | **Snapshot** giá (đã áp promotion) |
| `service_name` | VARCHAR(150) | No | **Snapshot** tên dịch vụ |
| `variant_name` | VARCHAR(150) | No | **Snapshot** tên biến thể |
| `staff_name` | VARCHAR(255) | Yes | **Snapshot** tên nhân viên |
| `is_staff_chosen_by_customer` | BOOLEAN | No | Khách tự chọn nhân viên hay hệ thống tự pick |

**Ví dụ dữ liệu — tiếp theo booking `bk-001`:**

| id | booking_id | sort_order | service_name | variant_name | staff_name | start_time | duration | price |
|----|------------|------------|--------------|--------------|------------|------------|----------|-------|
| `bki-001` | `bk-001` | 0 | Cắt tóc nữ | Tóc trung | Trần Văn Hùng | 09:00 UTC | 45 | 180,000 |
| `bki-002` | `bk-001` | 1 | Nhuộm tóc | Nhuộm màu đơn | Nguyễn Thị Lan | **09:45 UTC** | 90 | 350,000 |

> **Tính `start_time` item 1:** `scheduled_at (09:00) + duration item 0 (45p) = 09:45`. Hai nhân viên khác nhau có thể thực hiện song song nếu muốn, hoặc cùng 1 nhân viên tuần tự. Dịch vụ thực hiện **tuần tự** nhưng nhân viên có thể **khác nhau** cho từng item.

> **Tại sao snapshot `service_name`, `variant_name`, `staff_name`?** Nếu sau này store đổi tên dịch vụ thành "Cắt tóc thời trang" hoặc tăng giá, booking cũ vẫn hiển thị đúng thông tin tại thời điểm đặt. Bắt buộc cho bất kỳ hệ thống thương mại nào.

> **Index `(staff_id, start_time)`:** Dùng khi kiểm tra conflict: "Nhân viên X có bị trùng lịch trong khoảng [09:45, 11:15] không?"

---

## 8. Nhóm Thanh toán

### 8.1 `payments` — Thanh toán

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `booking_id` | CHAR(36) FK | No | Thanh toán cho booking nào (**KHÔNG unique** — cho phép retry) |
| `customer_id` | CHAR(36) FK | Yes | Ai thanh toán |
| `amount` | DECIMAL(12,2) | No | Số tiền lần này |
| `type` | ENUM PaymentType | No | `DEPOSIT` = cọc; `FULL` = đủ |
| `method` | ENUM PaymentMethod | No | `SEPAY` = chuyển khoản; `CASH` = tiền mặt |
| `status` | ENUM PaymentStatus | No | `PENDING / PAID / FAILED / REFUNDED` |
| `sepay_code` | VARCHAR(20) UNIQUE | Yes | Mã nhúng vào nội dung CK để Sepay nhận dạng |
| `sepay_transaction_id` | VARCHAR(50) | Yes | ID giao dịch từ Sepay webhook |
| `sepay_gateway` | VARCHAR(50) | Yes | Ngân hàng (VD: "VPBank") |
| `paid_at` | DATETIME | Yes | Thời điểm thành công |
| `failed_reason` | VARCHAR(500) | Yes | Lý do thất bại |

**Ví dụ dữ liệu — kịch bản retry:**

> Khách nộp cọc 127,200đ cho `bk-001`. Lần 1 timeout, lần 2 thành công:

| id | booking_id | amount | type | status | sepay_code | paid_at |
|----|------------|--------|------|--------|------------|---------|
| `pay-001` | `bk-001` | 127,200 | DEPOSIT | **FAILED** | `GW84920001` | null |
| `pay-002` | `bk-001` | 127,200 | DEPOSIT | **PAID** | `GW84920002` | 2025-07-14 08:32 |

> **Luồng Sepay:** Khách chuyển khoản với nội dung "GW84920002" → Sepay nhận → gọi webhook → backend tìm Payment bằng `sepay_code` → verify số tiền → set `PAID` → cập nhật `booking.status = DEPOSIT_PAID`.

> **Tại sao `booking_id` không unique?** Cho phép tạo nhiều Payment attempt cho 1 booking. Khi tạo lần 2, hệ thống tự đổi các PENDING cũ thành FAILED. Chỉ được có 1 payment ở trạng thái PAID tại 1 thời điểm.

---

## 9. Nhóm Đánh giá

### 9.1 `reviews` — Đánh giá

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `booking_item_id` | CHAR(36) FK **UNIQUE** | No | 1 BookingItem → tối đa 1 Review |
| `booking_id` | CHAR(36) FK | No | Booking gốc (denormalized) |
| `customer_id` | CHAR(36) FK | No | Người đánh giá (denormalized) |
| `store_id` | CHAR(36) FK | No | Cửa hàng (denormalized) |
| `service_id` | CHAR(36) FK | No | Dịch vụ (denormalized) |
| `staff_id` | CHAR(36) FK | Yes | Nhân viên thực hiện (denormalized) |
| `rating` | INT | No | Điểm 1–5 |
| `comment` | TEXT | Yes | Nội dung |
| `is_visible` | BOOLEAN | No | `false` = admin ẩn vi phạm |
| `image_urls` | JSON | Yes | Ảnh đính kèm `["url1", "url2"]` |

**Ví dụ dữ liệu — sau booking `bk-001` hoàn thành:**

Booking có 2 items → khách có thể viết 2 reviews riêng:

| id | booking_item_id | service_id | staff_id | rating | comment |
|----|-----------------|------------|----------|--------|---------|
| `rv-001` | `bki-001` | `svc-001` | `staff-001` | 5 | "Anh Hùng cắt rất đẹp, đúng ý!" |
| `rv-002` | `bki-002` | `svc-002` | `staff-002` | 4 | "Màu đẹp nhưng hơi lâu" |

**Sau mỗi review, hệ thống `recalculateRatings()`:**

```
store-abc:  avg_rating = mean(tất cả reviews) = 4.5
svc-001:    avg_rating = 5.0
svc-002:    avg_rating = 4.0
staff-001:  rating = 5.0
staff-002:  rating = 4.0
```

> **Tại sao denormalize `store_id`, `service_id`, `staff_id` vào Review?** Để query rating không cần JOIN nhiều bảng. Ví dụ: `SELECT AVG(rating) FROM reviews WHERE staff_id = 'staff-001' AND is_visible = true` — thay vì phải JOIN qua `booking_items → bookings`.

---

## 10. Nhóm Khuyến mãi

### Sự khác biệt Coupon vs Promotion

| | Coupon | Promotion |
|-|--------|-----------|
| **Cách áp dụng** | Khách nhập mã thủ công | Hệ thống tự động áp |
| **Scope giảm** | Tổng đơn (`discountAmount`) | Từng item (`BookingItem.price`) |
| **Khi nào tính** | Khi tạo booking + couponCode | Khi tạo booking (tìm promotion active) |
| **Có thể kết hợp** | 1 booking 1 coupon | 1 booking 1 promotion |

---

### 10.1 `coupons` — Mã giảm giá

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `code` | VARCHAR(50) UNIQUE | No | Mã khách nhập (VD: `SUMMER20`) |
| `type` | ENUM CouponType | No | `PERCENTAGE` hoặc `FIXED` |
| `value` | DECIMAL(12,2) | No | Giá trị (20.00 = 20% hoặc 20,000đ) |
| `min_amount` | DECIMAL(12,2) | Yes | Đơn tối thiểu |
| `max_discount` | DECIMAL(12,2) | Yes | Trần giảm tối đa (cho coupon %) |
| `usage_limit` | INT | Yes | Tổng lượt dùng tối đa |
| `per_user_limit` | INT | Yes | Mỗi user dùng tối đa N lần |
| `used_count` | INT | No | Đã dùng bao nhiêu lần (denormalized) |
| `start_at` | DATETIME | No | Bắt đầu có hiệu lực |
| `expired_at` | DATETIME | Yes | Hết hạn |
| `is_active` | BOOLEAN | No | Bật/tắt thủ công |
| `store_id` | CHAR(36) FK | Yes | `null` = coupon toàn hệ thống; có giá trị = riêng store |

**Ví dụ dữ liệu:**

| code | type | value | min_amount | max_discount | usage_limit | per_user_limit | store_id |
|------|------|-------|------------|--------------|-------------|----------------|----------|
| `SUMMER20` | PERCENTAGE | 20.00 | 200,000 | 200,000 | 500 | 1 | null |
| `NEWUSER50K` | FIXED | 50,000 | 100,000 | — | 1000 | 1 | null |
| `VIP30` | PERCENTAGE | 30.00 | 500,000 | 300,000 | 100 | 3 | `store-abc` |

**Validation khi khách nhập coupon `SUMMER20`:**

```
1. Tìm coupon có code = "SUMMER20" → tồn tại? → ✓
2. is_active = true? → ✓
3. now() trong [start_at, expired_at]? → ✓
4. total_price (530k) >= min_amount (200k)? → ✓
5. used_count (47) < usage_limit (500)? → ✓
6. Đếm CouponUsage WHERE coupon_id=X AND user_id=Y → 0 < per_user_limit (1)? → ✓
7. store_id = null → áp dụng cho mọi store → ✓

Kết quả: Giảm 20% × 530k = 106k, nhưng max_discount = 200k → giảm 106k (không vượt trần)
```

---

### 10.2 `coupon_usages` — Lịch sử dùng coupon

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `coupon_id` | CHAR(36) FK | No | Coupon |
| `user_id` | CHAR(36) FK | No | Ai dùng |
| `booking_id` | CHAR(36) FK **UNIQUE** | No | Booking nào dùng (1 booking → 1 coupon) |
| `discount` | DECIMAL(12,2) | No | Số tiền thực tế giảm |

**Ví dụ dữ liệu:**

| coupon_id | user_id | booking_id | discount |
|-----------|---------|------------|----------|
| `coupon-summer20` | `user-huong` | `bk-001` | 106,000 |

> Sau khi tạo, `coupon.used_count` được increment (+1) để check giới hạn nhanh không cần COUNT.

---

### 10.3 `promotions` — Chương trình khuyến mãi tự động

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `store_id` | CHAR(36) FK | No | Store chạy |
| `name` | VARCHAR(150) | No | Tên chương trình |
| `type` | ENUM CouponType | No | `PERCENTAGE / FIXED` |
| `value` | DECIMAL(12,2) | No | Giá trị giảm |
| `scope` | ENUM PromotionScope | No | `STORE / CATEGORY / SERVICE` |
| `start_at` | DATETIME | No | Bắt đầu |
| `end_at` | DATETIME | Yes | Kết thúc |
| `is_active` | BOOLEAN | No | Bật/tắt |

**Ví dụ dữ liệu:**

| id | name | type | value | scope | start_at | end_at |
|----|------|------|-------|-------|----------|--------|
| `promo-001` | Sale mùa hè toàn dịch vụ | PERCENTAGE | 15.00 | STORE | 2025-07-01 | 2025-07-31 |
| `promo-002` | Giảm 50k dịch vụ Móng | FIXED | 50,000 | CATEGORY | 2025-07-01 | 2025-07-15 |

**Khi tạo booking, hệ thống tự tìm:**

```
SELECT * FROM promotions
WHERE store_id = 'store-abc'
  AND is_active = true
  AND start_at <= NOW() AND (end_at IS NULL OR end_at >= NOW())
ORDER BY value DESC LIMIT 1
```

Nếu tìm thấy `promo-001` (15%), áp vào từng item:
- Cắt tóc 180k → `original_price = 180k`, `price = 153k`
- Nhuộm 350k → `original_price = 350k`, `price = 297.5k`

---

### 10.4 `promotion_categories` & 10.5 `promotion_services`

Bảng trung gian khi promotion có scope `CATEGORY` hoặc `SERVICE`:

```
promotion_categories: (promotion_id, category_id)
promotion_services:   (promotion_id, service_id)
```

**Ví dụ:** `promo-002` (scope=CATEGORY) nhắm danh mục "Móng":

| promotion_id | category_id |
|-------------|-------------|
| `promo-002` | `cat-002` |

→ Khi đặt lịch, chỉ các dịch vụ thuộc `cat-002` mới được giảm 50k.

---

## 11. Nhóm Chat

### 11.1 `conversations` — Cuộc trò chuyện

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `customer_id` | CHAR(36) FK | No | Khách hàng |
| `store_id` | CHAR(36) FK | No | Cửa hàng |
| `telegram_topic_id` | INT | Yes | Topic ID trong Telegram Supergroup của store |
| `last_message_at` | DATETIME | Yes | Để sort inbox theo thời gian |
| `last_message_body` | VARCHAR(200) | Yes | Preview tin nhắn cuối |

**Ràng buộc:** `UNIQUE(customer_id, store_id)` — 1 khách chỉ có 1 conversation với 1 store.

**Ví dụ dữ liệu:**

| id | customer_id | store_id | last_message_body |
|----|-------------|----------|--------------------|
| `conv-001` | `user-huong` | `store-abc` | "Salon mở cửa mấy giờ ạ?" |
| `conv-002` | `user-khoa` | `store-abc` | "OK bạn đến lúc 10h nhé" |

**Tích hợp Telegram:**

```
Khách nhắn tin trên web → hệ thống forward vào Telegram Topic #conv-001
Staff reply trên Telegram → Telegram webhook → hệ thống forward về DB + WebSocket về khách
telegram_topic_id lưu để tái dùng topic, không tạo mới mỗi lần
```

> **`last_message_at/body` denormalized:** Hiển thị inbox sắp xếp theo thời gian mà không cần `JOIN + MAX(messages.created_at)` — query rất đắt khi có hàng nghìn conversations.

---

### 11.2 `messages` — Tin nhắn

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `conversation_id` | CHAR(36) FK | No | Thuộc conversation nào |
| `sender_id` | CHAR(36) FK | No | User ID người gửi |
| `sender_type` | ENUM SenderType | No | `CUSTOMER / STAFF / BOT` |
| `content` | TEXT | No | Nội dung tin nhắn |
| `attachments` | JSON | Yes | `[{type, url, fileName, mimeType}]` |
| `is_read` | BOOLEAN | No | Đã đọc chưa |
| `read_at` | DATETIME | Yes | Khi nào đọc |

**Ví dụ dữ liệu:**

| conversation_id | sender_type | content | is_read |
|-----------------|-------------|---------|---------|
| `conv-001` | CUSTOMER | "Salon mở cửa mấy giờ ạ?" | true |
| `conv-001` | BOT | "Salon mở cửa 8h-20h từ T2-T7, nghỉ CN ạ!" | true |
| `conv-002` | CUSTOMER | "Tôi muốn đặt cắt tóc sáng mai" | true |
| `conv-002` | STAFF | "OK bạn đến lúc 10h nhé" | false |

> **Logic unread:** Khi staff đọc inbox → chỉ mark read tin có `sender_type != STAFF`. Khi khách đọc → chỉ mark read tin có `sender_type != CUSTOMER`. Tránh đánh dấu đã đọc tin của chính mình.

---

## 12. Nhóm Thông báo

### 12.1 `notifications` — Thông báo in-app

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `user_id` | CHAR(36) FK | No | Người nhận |
| `booking_id` | CHAR(36) FK | Yes | Booking liên quan (deep-link) |
| `call_in_id` | CHAR(36) FK | Yes | CallIn liên quan |
| `day_off_id` | CHAR(36) FK | Yes | DayOff liên quan |
| `type` | ENUM NotificationType | No | Loại sự kiện |
| `title` | VARCHAR(200) | No | Tiêu đề |
| `body` | TEXT | No | Nội dung |
| `is_read` | BOOLEAN | No | Đã đọc chưa |
| `metadata` | JSON | Yes | Dữ liệu thêm |

**Ví dụ dữ liệu — một booking tạo ra nhiều notifications:**

| user_id | type | title | booking_id |
|---------|------|-------|------------|
| `user-huong` | `BOOKING_CREATED` | "Đặt lịch thành công" | `bk-001` |
| `user-mai` | `BOOKING_CREATED` | "Có booking mới cần xác nhận" | `bk-001` |
| `user-huong` | `BOOKING_CONFIRMED` | "Booking của bạn được xác nhận" | `bk-001` |
| `user-huong` | `BOOKING_DEPOSIT_REQUIRED` | "Vui lòng nộp cọc 127,200đ trước 15/7 15:00" | `bk-001` |
| `user-huong` | `BOOKING_REMINDER_1DAY` | "Nhắc lịch: Ngày mai 09:00 tại Salon ABC" | `bk-001` |

**22 loại NotificationType:**

```
BOOKING_CREATED, BOOKING_CONFIRMED, BOOKING_REJECTED, BOOKING_COMPLETED, BOOKING_CANCELLED
BOOKING_DEPOSIT_REQUIRED, BOOKING_DEPOSIT_PAID, BOOKING_DEPOSIT_EXPIRED
STORE_APPROVED, STORE_REJECTED, STORE_LOCKED
STAFF_INVITED
PAYMENT_SUCCESS
BOOKING_REMINDER_1DAY, BOOKING_REMINDER_1HOUR
STAFF_CALL_IN_REQUEST, STAFF_CALL_IN_ACCEPTED, STAFF_CALL_IN_REJECTED
STAFF_DAY_OFF_REQUEST, STAFF_DAY_OFF_APPROVED, STAFF_DAY_OFF_REJECTED
BOOKING_STAFF_CHANGED
```

> **onDelete: SetNull cho `call_in_id` và `day_off_id`:** Nếu manager xóa lịch call-in, thông báo liên quan vẫn giữ nguyên trong inbox nhân viên (không mất) nhưng `call_in_id = null`. Tránh xóa cascade toàn bộ notification.

---

### 12.2 `push_subscriptions` — Web Push

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `user_id` | CHAR(36) FK | No | Chủ sở hữu |
| `endpoint` | VARCHAR(500) UNIQUE | No | URL endpoint của browser |
| `p256dh` | TEXT | No | Public key (Web Push Protocol) |
| `auth` | VARCHAR(255) | No | Auth secret |

**Ví dụ:** 1 user dùng 3 thiết bị → 3 subscription:

| user_id | endpoint |
|---------|----------|
| `user-huong` | https://fcm.googleapis.com/.../abc |
| `user-huong` | https://updates.push.services.mozilla.com/.../def |
| `user-huong` | https://fcm.googleapis.com/.../ghi |

> Khi push notification → gửi đến TẤT CẢ subscription của user. Logout → xóa toàn bộ subscription → không nhận push nữa.

---

## 13. Nhóm Giám sát

### 13.1 `system_logs` — Nhật ký hệ thống

| Trường | Kiểu | Nullable | Mô tả |
|--------|------|----------|-------|
| `id` | CHAR(36) PK | No | UUID |
| `type` | ENUM LogType | No | Loại hành động |
| `status` | ENUM LogStatus | No | `SUCCESS / ERROR` |
| `actor_id` | CHAR(36) FK | Yes | Ai thực hiện (`null` = hệ thống tự động) |
| `store_id` | CHAR(36) | Yes | Store liên quan (NOT FK — xem lý do bên dưới) |
| `target_id` | CHAR(36) | Yes | ID object bị tác động |
| `target_type` | VARCHAR(50) | Yes | Loại object: "Booking", "User", "Store"... |
| `metadata` | JSON | Yes | Dữ liệu bổ sung tùy loại log |
| `ip_address` | VARCHAR(45) | Yes | IP của actor |
| `request_id` | CHAR(36) | Yes | Correlate với HTTP request |

**Ví dụ dữ liệu — chuỗi sự kiện booking:**

| type | status | actor_id | target_id | target_type | metadata |
|------|--------|----------|-----------|-------------|---------|
| `BOOKING_CREATED` | SUCCESS | `user-huong` | `bk-001` | Booking | `{storeId, totalPrice: 530000}` |
| `BOOKING_CONFIRMED` | SUCCESS | `user-mai` | `bk-001` | Booking | `{depositRequired: true, depositAmount: 127200}` |
| `BOOKING_DEPOSIT_PAID` | SUCCESS | null | `bk-001` | Booking | `{paymentId: "pay-002", amount: 127200}` |
| `BOOKING_COMPLETED` | SUCCESS | `user-mai` | `bk-001` | Booking | `{}` |

> **Tại sao `store_id` KHÔNG dùng FK:** SystemLog là audit trail vĩnh viễn. Nếu store bị xóa (dù hiếm), log phải giữ nguyên. FK với `onDelete: CASCADE` sẽ xóa mất history — không chấp nhận được.

> **Tại sao `target_id + target_type` thay vì nhiều cột FK:** 30+ loại log, mỗi loại tác động đến entity khác nhau (Booking, User, Store, Payment...). Polymorphic reference linh hoạt hơn nhiều cột FK nullable.

---

## 14. Sơ đồ quan hệ tổng thể

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Province (tỉnh/thành)                             │
└─────┬──────────────────────────────────────────────────────────────┘
      │ 1:N
      ▼
    Ward (xã/phường)
      │
      ├──► User (tài khoản — khách, chủ, nhân viên, admin)
      │      │
      │      ├──[UserRole]──► Role ──[RolePermission]──► Permission
      │      │
      │      ├──► Store (cửa hàng — 1 user có thể sở hữu nhiều store)
      │      │      │
      │      │      ├──► WorkingHour (giờ mở cửa 7 ngày)
      │      │      ├──► StorePaymentConfig (tài khoản ngân hàng - 1:1)
      │      │      ├──► ServiceCategory ──► Service ──► ServiceVariant
      │      │      ├──► Coupon (mã giảm giá của store)
      │      │      ├──► Promotion ──► PromotionCategory / PromotionService
      │      │      └──► Conversation ──► Message
      │      │
      │      └──► Staff (hồ sơ nhân viên — 1 user × nhiều store)
      │             │
      │             ├──► StaffSchedule (lịch làm tuần)
      │             ├──► StaffScheduleHistory (audit trail)
      │             ├──► StaffDayOff (đơn nghỉ phép)
      │             └──► StaffCallIn (gọi thêm ngày nghỉ)
      │
      └──► Booking (1 lần đặt lịch)
             │
             ├──► BookingItem[] (từng dịch vụ — thực hiện tuần tự)
             │      │
             │      └──► Review (đánh giá sau hoàn thành — 1:1)
             │
             ├──► Payment[] (lịch sử thanh toán — cho phép retry)
             ├──► Notification[] (thông báo)
             └──► CouponUsage (1:1 — booking chỉ dùng 1 coupon)

SystemLog ──► User (actor), polymorphic target (Booking/Store/User/...)
```

---

## 15. Luồng nghiệp vụ chính

### Luồng 1 — Đặt lịch đầy đủ

```
BƯỚC 1: Khách xem available slots
───────────────────────────────────
GET /stores/{id}/slots?date=2025-07-15&services=[{variantId, staffId?}]

Hệ thống tính toán:
  1. working_hours ngày đó → store có mở không?
  2. staff_schedules → nhân viên nào làm hôm đó?
  3. staff_day_offs (PENDING+APPROVED) → ai đang nghỉ?
  4. staff_call_ins (ACCEPTED) → ai được gọi thêm?
  5. booking_items đã có → slot nào đã bị chiếm?
  6. Ghép các slot trống mỗi 30 phút, kiểm tra đủ nhân viên cho từng dịch vụ

Kết quả: ["09:00", "09:30", "10:30", "11:00", ...]

BƯỚC 2: Khách gửi đặt lịch
───────────────────────────
POST /bookings
{
  storeId: "store-abc",
  scheduledAt: "2025-07-15T02:00:00Z",  // 09:00 giờ HN
  items: [
    { variantId: "var-002", staffId: "staff-001" },  // Cắt tóc trung
    { variantId: "var-004" }                          // Nhuộm màu (hệ thống tự pick staff)
  ],
  couponCode: "SUMMER20",
  notes: "Cắt tầng nhẹ nhé"
}

Hệ thống xử lý (trong 1 transaction):
  1. Validate store ACTIVE
  2. Validate từng variant ACTIVE
  3. Kiểm tra nhân viên available + assertNoOverlap (lock row)
  4. Tìm Promotion active → áp vào từng item
  5. Validate Coupon SUMMER20 → tính discount
  6. Tính deposit_amount (nếu deposit_percent > 0)
  7. Tạo Booking + 2 BookingItem
  8. Tạo CouponUsage + increment coupon.used_count
  9. Commit

Kết quả booking:
  status: PENDING
  booking_items: [
    { sort_order: 0, start_time: 09:00, duration: 45, price: 180k, staff_id: "staff-001" }
    { sort_order: 1, start_time: 09:45, duration: 90, price: 350k, staff_id: "staff-002" }  // auto-assigned
  ]
  total_price: 530k, discount_amount: 106k, final_price: 424k

BƯỚC 3: Store xác nhận
───────────────────────
PATCH /bookings/{id}/confirm (bởi SHOP_OWNER/MANAGER)

  if (deposit_percent > 0 AND paymentConfig.is_active):
    → status = DEPOSIT_PENDING
    → gửi notification BOOKING_DEPOSIT_REQUIRED cho khách
  else:
    → status = CONFIRMED

BƯỚC 4: Khách nộp cọc
──────────────────────
POST /payments/{bookingId}/sepay

  Tạo Payment { amount: 127200, type: DEPOSIT, status: PENDING, sepay_code: "GW84920002" }
  Trả về QR VietQR với nội dung CK = "GW84920002"

  Khách chuyển khoản → Sepay nhận → webhook:
  POST /payments/webhook/store-abc
  { content: "...GW84920002...", amount: 127200, ... }

  Server verify → Payment.status = PAID → Booking.status = DEPOSIT_PAID

BƯỚC 5: Thực hiện dịch vụ & Hoàn thành
────────────────────────────────────────
PATCH /bookings/{id}/complete (bởi store)
  → status = COMPLETED

BƯỚC 6: Khách đánh giá
───────────────────────
POST /reviews (chỉ khi booking COMPLETED)
  { bookingItemId: "bki-001", rating: 5, comment: "Rất đẹp!" }
  { bookingItemId: "bki-002", rating: 4, comment: "Màu đẹp" }

  → recalculateRatings() cho store + service + staff
```

---

### Luồng 2 — Tính slot trống chi tiết

```
Input: storeId="store-abc", date="2025-07-15", items=[{variantId:"var-002"}, {variantId:"var-004"}]

1. Lấy working_hours ngày TUESDAY (15/7 là thứ Ba):
   open=08:00, close=20:00, is_closed=false → store mở

2. Batch query song song:
   - StaffSchedule WHERE store_id='store-abc' AND day_of_week=TUESDAY AND is_active=true
     → staff-001: 09:00-18:00, staff-002: 09:00-18:00, staff-003: 08:00-20:00

   - StaffDayOff WHERE store_id='store-abc' AND date='2025-07-15' AND status IN [PENDING,APPROVED]
     → (trống) — không ai nghỉ hôm đó

   - StaffCallIn WHERE store_id='store-abc' AND date='2025-07-15' AND status=ACCEPTED
     → (trống)

   - BookingItem WHERE staff_id IN [staff-001,002,003] AND start_time BETWEEN [14/7 00:00 - 16/7 00:00]
     → bki-existing: staff-001, start=09:00, duration=30 → busy 09:00-09:30

3. Build staffInfoMap:
   staff-001: window=[09:00,18:00], busyWindows=[[09:00,09:30]]
   staff-002: window=[09:00,18:00], busyWindows=[]
   staff-003: window=[08:00,20:00], busyWindows=[]

4. Vòng lặp slot (step=30 phút):
   Slot 08:00:
     Item 0 (Cắt tóc trung, 45p, 08:00-08:45): staff-001 busy 09:00-09:30 → OK; assign staff-001
     Item 1 (Nhuộm màu, 90p, 08:45-10:15): staff-001 không thể (cùng lúc item 0); staff-002 OK; assign staff-002
     → Slot 08:00 VALID ✓

   Slot 08:30:
     Item 0 (08:30-09:15): staff-001 bị overlap [09:00-09:30] → skip; staff-002 OK; assign staff-002
     Item 1 (09:15-10:45): staff-001 OK (09:30 xong rồi); assign staff-001
     → Slot 08:30 VALID ✓

   Slot 09:00:
     Item 0 (09:00-09:45): staff-001 busy [09:00-09:30] → skip; staff-002 OK; assign staff-002
     Item 1 (09:45-11:15): staff-001 OK; assign staff-001
     → Slot 09:00 VALID ✓

   ...

5. Trả về:
   [
     { time: "08:00", assignments: [{item:0, staff:"staff-001"}, {item:1, staff:"staff-002"}] },
     { time: "08:30", assignments: [{item:0, staff:"staff-002"}, {item:1, staff:"staff-001"}] },
     { time: "09:00", ... },
     ...
   ]
```

---

### Luồng 3 — Quản lý lịch nhân viên

```
Bình thường (lịch tuần cố định):
  Hùng làm T2-T7: 09:00-18:00 (staff_schedules)

Hùng xin nghỉ 10/7:
  POST /staff-day-offs { date: "2025-07-10", reason: "Việc gia đình" }
  → DayOff status=PENDING
  → Slot ngày 10/7 của Hùng bị block ngay (kể cả khi còn PENDING)
  → Notification STAFF_DAY_OFF_REQUEST gửi đến manager

Manager duyệt:
  PATCH /staff-day-offs/{id}/approve
  → status=APPROVED
  → Notification STAFF_DAY_OFF_APPROVED gửi đến Hùng

Chủ nhật 13/7 đông khách, manager gọi Hùng:
  POST /staff-call-ins { staffId: "staff-001", date: "2025-07-13", startTime: "10:00", endTime: "18:00" }
  → CallIn status=PENDING
  → Notification STAFF_CALL_IN_REQUEST gửi đến Hùng

Hùng đồng ý:
  PATCH /staff-call-ins/{id}/accept
  → status=ACCEPTED
  → Slot CN 13/7 của Hùng (10:00-18:00) được MỞ cho khách đặt
```

---

*Tài liệu này được tổng hợp từ `prisma/schema.prisma` và toàn bộ service layer của dự án Glowora Booking Platform.*
