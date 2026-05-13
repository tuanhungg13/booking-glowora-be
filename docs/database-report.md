# Báo Cáo Xây Dựng Cơ Sở Dữ Liệu
## Hệ Thống Đặt Lịch Spa — Glowora Platform

---

## 1. Giới Thiệu

### 1.1 Bài toán đặt ra

Glowora là nền tảng đặt lịch spa trực tuyến đa phía (multi-sided platform), kết nối ba nhóm người dùng chính:

| Nhóm | Mô tả |
|------|-------|
| **CUSTOMER** | Khách hàng tìm kiếm, đặt lịch và đánh giá dịch vụ spa |
| **OWNER** | Chủ cơ sở spa đăng ký, quản lý shop, dịch vụ và lịch nhân viên |
| **SUPER_ADMIN** | Quản trị viên hệ thống phê duyệt cơ sở, quản lý người dùng |

Hệ thống cần lưu trữ và xử lý các nghiệp vụ:
- Quản lý tài khoản người dùng và phân quyền động (RBAC)
- Đăng ký và phê duyệt cơ sở spa
- Quản lý danh mục dịch vụ và nhân viên
- Đặt lịch hẹn, xác nhận, từ chối và hoàn thành
- Thanh toán trực tuyến (VNPAY, Stripe)
- Đánh giá dịch vụ và nhân viên
- Chat real-time giữa khách hàng và cơ sở
- Thông báo nhắc lịch (Email/SMS)

### 1.2 Công nghệ sử dụng

| Thành phần | Công nghệ |
|-----------|-----------|
| Hệ quản trị CSDL | MySQL 8.0 |
| ORM | Prisma 7 |
| Backend Framework | NestJS 11 |
| Ngôn ngữ | TypeScript |

### 1.3 Nguyên tắc thiết kế

- **UUID (Char 36)** làm khóa chính thay vì Auto-increment Integer để tránh lộ thông tin tuần tự và hỗ trợ phân tán sau này.
- **Soft status** thay vì xóa vật lý: các bản ghi quan trọng chỉ đổi trạng thái (ACTIVE/INACTIVE/BANNED) để giữ lịch sử.
- **Composite index** được thiết kế theo query pattern thực tế của từng nghiệp vụ.
- **RBAC phân cấp**: hỗ trợ cả system-level role (SUPER_ADMIN, CUSTOMER) và shop-level role (OWNER, nhân viên của shop cụ thể).

---

## 2. Tổng Quan Cấu Trúc Database

Hệ thống gồm **16 bảng** được nhóm theo nghiệp vụ:

| Nhóm | Bảng |
|------|------|
| **Phân quyền (RBAC)** | `roles`, `permissions`, `role_permissions`, `user_roles` |
| **Người dùng** | `users` |
| **Cơ sở spa** | `stores`, `store_hours` |
| **Nhân viên & lịch làm** | `staff`, `working_schedules` |
| **Dịch vụ** | `service_categories`, `services` |
| **Đặt lịch** | `appointments` |
| **Thanh toán** | `payments` |
| **Đánh giá** | `reviews` |
| **Chat & Thông báo** | `chat_messages`, `notifications` |

---

## 3. Thiết Kế Chi Tiết Từng Bảng

### 3.1 Bảng `roles` — Vai trò

**Chức năng:** Lưu trữ các vai trò trong hệ thống. Hỗ trợ cả system role (toàn hệ thống) và shop role (riêng từng cơ sở).

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh duy nhất |
| `name` | VARCHAR(100) | NOT NULL | — | Tên hiển thị (vd: "Quản trị viên") |
| `code` | VARCHAR(50) | NOT NULL | UNIQUE(code, shop_id) | Mã role (vd: SUPER_ADMIN, OWNER) |
| `description` | TEXT | NULL | — | Mô tả role |
| `is_system` | BOOLEAN | NOT NULL | DEFAULT false | True = role hệ thống, không thuộc shop nào |
| `shop_id` | CHAR(36) | NULL | FK → stores.id | NULL nếu là system role |

**Index:** `INDEX(shop_id)`, `UNIQUE(code, shop_id)`

**Ghi chú thiết kế:** `UNIQUE(code, shop_id)` cho phép nhiều shop có role cùng code nhưng mỗi shop chỉ có 1 role với code đó. System role có `shop_id = NULL`.

---

### 3.2 Bảng `permissions` — Quyền hạn

**Chức năng:** Khai báo toàn bộ các quyền hành động trong hệ thống (vd: `store:approve`, `booking:confirm`).

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh duy nhất |
| `code` | VARCHAR(100) | NOT NULL | UNIQUE | Mã quyền duy nhất (vd: `appointment:view`) |
| `name` | VARCHAR(150) | NOT NULL | — | Tên hiển thị |
| `description` | TEXT | NULL | — | Mô tả quyền |

---

### 3.3 Bảng `role_permissions` — Gán quyền cho vai trò

**Chức năng:** Bảng trung gian nhiều-nhiều giữa `roles` và `permissions`.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `role_id` | CHAR(36) | NOT NULL | PK, FK → roles.id | Khóa ngoại tới roles |
| `permission_id` | CHAR(36) | NOT NULL | PK, FK → permissions.id | Khóa ngoại tới permissions |

**Khóa chính hợp thành:** `(role_id, permission_id)`  
**Xóa cascade:** Khi role hoặc permission bị xóa, bản ghi liên kết tự xóa.

---

### 3.4 Bảng `user_roles` — Gán vai trò cho người dùng

**Chức năng:** Gán vai trò cho người dùng, có thể gắn kèm shop để phân quyền theo cơ sở cụ thể.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh |
| `user_id` | CHAR(36) | NOT NULL | FK → users.id | Người dùng được gán role |
| `role_id` | CHAR(36) | NOT NULL | FK → roles.id | Role được gán |
| `shop_id` | CHAR(36) | NULL | FK → stores.id | NULL = system-level, có giá trị = shop-level |
| `created_at` | DATETIME | NOT NULL | DEFAULT NOW() | Thời điểm gán |

**Index:** `INDEX(user_id)`, `INDEX(shop_id)`

---

### 3.5 Bảng `users` — Người dùng

**Chức năng:** Lưu thông tin tài khoản của tất cả người dùng trong hệ thống (customer, owner, admin).

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh duy nhất |
| `full_name` | VARCHAR(100) | NOT NULL | — | Họ và tên đầy đủ |
| `email` | VARCHAR(150) | NOT NULL | UNIQUE | Email đăng nhập |
| `password` | VARCHAR(255) | NOT NULL | — | Mật khẩu đã hash (bcrypt) |
| `phone` | VARCHAR(20) | NULL | — | Số điện thoại |
| `avatar_url` | TEXT | NULL | — | URL ảnh đại diện |
| `status` | ENUM | NOT NULL | DEFAULT ACTIVE | Trạng thái tài khoản |
| `refresh_token` | TEXT | NULL | — | Token làm mới JWT (đã hash) |
| `created_at` | DATETIME | NOT NULL | DEFAULT NOW() | Thời điểm tạo |
| `updated_at` | DATETIME | NOT NULL | AUTO UPDATE | Thời điểm cập nhật cuối |

**Enum `UserStatus`:** `ACTIVE` | `INACTIVE` | `BANNED`

**Quan hệ:**
- 1 user → nhiều `user_roles` (phân quyền)
- 1 user → nhiều `stores` (với tư cách chủ sở hữu)
- 1 user → 1 `staff` (nếu là nhân viên)
- 1 user → nhiều `appointments` (với tư cách khách hàng)
- 1 user → nhiều `payments`, `reviews`, `notifications`

---

### 3.6 Bảng `stores` — Cơ sở spa

**Chức năng:** Lưu thông tin cơ sở spa. Mỗi cơ sở cần được SUPER_ADMIN phê duyệt trước khi hoạt động.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh |
| `slug` | VARCHAR(200) | NULL | UNIQUE | URL-friendly name (vd: `glowora-spa-q1`) |
| `owner_id` | CHAR(36) | NOT NULL | FK → users.id | Chủ cơ sở |
| `name` | VARCHAR(150) | NOT NULL | — | Tên cơ sở |
| `phone` | VARCHAR(20) | NOT NULL | — | Số điện thoại liên hệ |
| `email` | VARCHAR(150) | NULL | — | Email cơ sở |
| `website` | VARCHAR(200) | NULL | — | Website (nếu có) |
| `description` | TEXT | NULL | — | Mô tả cơ sở |
| `address` | TEXT | NOT NULL | — | Địa chỉ đầy đủ |
| `city` | VARCHAR(100) | NOT NULL | DEFAULT '' | Tên tỉnh/thành phố |
| `district` | VARCHAR(100) | NULL | — | Quận/huyện |
| `latitude` | DOUBLE | NULL | — | Vĩ độ (cho bản đồ) |
| `longitude` | DOUBLE | NULL | — | Kinh độ (cho bản đồ) |
| `logo_url` | TEXT | NULL | — | URL logo |
| `banner_url` | TEXT | NULL | — | URL ảnh bìa |
| `status` | ENUM | NOT NULL | DEFAULT PENDING | Trạng thái phê duyệt |
| `approved_by_id` | CHAR(36) | NULL | FK → users.id | Admin đã duyệt |
| `approved_at` | DATETIME | NULL | — | Thời điểm được duyệt |
| `rejection_reason` | TEXT | NULL | — | Lý do từ chối (nếu bị reject) |
| `timezone` | VARCHAR(50) | NOT NULL | DEFAULT 'Asia/Ho_Chi_Minh' | Múi giờ cơ sở |
| `slot_interval_mins` | INT | NOT NULL | DEFAULT 30 | Khoảng cách slot đặt lịch (phút) |
| `cancel_before_hours` | INT | NOT NULL | DEFAULT 2 | Hủy trước bao nhiêu giờ |
| `max_advance_days` | INT | NOT NULL | DEFAULT 30 | Đặt lịch trước tối đa bao nhiêu ngày |
| `auto_confirm` | BOOLEAN | NOT NULL | DEFAULT false | Tự động xác nhận lịch hẹn |
| `avg_rating` | DECIMAL(3,2) | NOT NULL | DEFAULT 0.00 | Điểm đánh giá trung bình |
| `total_reviews` | INT | NOT NULL | DEFAULT 0 | Tổng số lượt đánh giá |
| `created_at` | DATETIME | NOT NULL | DEFAULT NOW() | Ngày tạo |
| `updated_at` | DATETIME | NOT NULL | AUTO UPDATE | Ngày cập nhật |

**Enum `StoreStatus`:** `PENDING` | `ACTIVE` | `INACTIVE` | `BANNED`

**Index:** `INDEX(owner_id)`, `INDEX(status)`, `INDEX(city, status)`

**Ghi chú thiết kế:**
- `slot_interval_mins` cho phép mỗi shop tự cấu hình bước nhảy slot (15/30/60 phút).
- `auto_confirm` khi bật thì lịch hẹn tự chuyển sang CONFIRMED ngay sau khi đặt, không cần owner xác nhận thủ công.
- `avg_rating` và `total_reviews` được cập nhật mỗi khi có review mới (denormalization để tăng tốc query).

---

### 3.7 Bảng `store_hours` — Giờ mở cửa

**Chức năng:** Lưu lịch mở cửa theo từng ngày trong tuần của cơ sở.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh |
| `store_id` | CHAR(36) | NOT NULL | FK → stores.id | Cơ sở |
| `day_of_week` | INT | NOT NULL | 0=CN, 1=T2...6=T7 | Thứ trong tuần |
| `open_time` | VARCHAR(5) | NOT NULL | Định dạng HH:mm | Giờ mở cửa |
| `close_time` | VARCHAR(5) | NOT NULL | Định dạng HH:mm | Giờ đóng cửa |
| `is_closed` | BOOLEAN | NOT NULL | DEFAULT false | Đánh dấu ngày nghỉ |

**Ràng buộc:** `UNIQUE(store_id, day_of_week)` — mỗi cơ sở chỉ có 1 bản ghi cho mỗi ngày.  
**Index:** `INDEX(store_id)`  
**Cascade:** Xóa store → xóa toàn bộ store_hours liên quan.

---

### 3.8 Bảng `staff` — Nhân viên

**Chức năng:** Hồ sơ nhân viên của cơ sở spa. Mỗi nhân viên gắn với 1 tài khoản `User`.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh |
| `user_id` | CHAR(36) | NOT NULL | UNIQUE, FK → users.id | Tài khoản người dùng liên kết |
| `store_id` | CHAR(36) | NOT NULL | FK → stores.id | Cơ sở làm việc |
| `specialty` | VARCHAR(200) | NULL | — | Chuyên môn (vd: "Massage, Facial") |
| `bio` | TEXT | NULL | — | Giới thiệu bản thân |
| `rating` | DECIMAL(3,2) | NOT NULL | DEFAULT 0.00 | Điểm đánh giá trung bình |
| `total_reviews` | INT | NOT NULL | DEFAULT 0 | Số lượt được đánh giá |
| `status` | ENUM | NOT NULL | DEFAULT ACTIVE | Trạng thái làm việc |
| `created_at` | DATETIME | NOT NULL | DEFAULT NOW() | Ngày tạo |
| `updated_at` | DATETIME | NOT NULL | AUTO UPDATE | Ngày cập nhật |

**Enum `StaffStatus`:** `ACTIVE` | `INACTIVE`

**Index:** `INDEX(store_id, status)`

**Ghi chú:** `UNIQUE(user_id)` đảm bảo 1 tài khoản chỉ có thể là nhân viên tại 1 cơ sở.

---

### 3.9 Bảng `working_schedules` — Lịch làm việc nhân viên

**Chức năng:** Lưu lịch làm việc cụ thể từng ngày của nhân viên, dùng để tính toán slot đặt lịch còn trống.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh |
| `staff_id` | CHAR(36) | NOT NULL | FK → staff.id | Nhân viên |
| `store_id` | CHAR(36) | NOT NULL | FK → stores.id | Cơ sở |
| `work_date` | DATE | NOT NULL | — | Ngày làm việc |
| `start_time` | TIME | NOT NULL | — | Giờ bắt đầu ca |
| `end_time` | TIME | NOT NULL | — | Giờ kết thúc ca |
| `is_available` | BOOLEAN | NOT NULL | DEFAULT true | Còn nhận lịch hay không |
| `created_at` | DATETIME | NOT NULL | DEFAULT NOW() | Ngày tạo |
| `updated_at` | DATETIME | NOT NULL | AUTO UPDATE | Ngày cập nhật |

**Index:** `INDEX(staff_id, work_date)`, `INDEX(store_id)`

---

### 3.10 Bảng `service_categories` — Danh mục dịch vụ

**Chức năng:** Phân loại dịch vụ cấp hệ thống (vd: Massage, Nail, Facial...). Được quản lý bởi SUPER_ADMIN.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh |
| `name` | VARCHAR(100) | NOT NULL | UNIQUE | Tên danh mục |
| `description` | TEXT | NULL | — | Mô tả |
| `icon_url` | TEXT | NULL | — | URL icon hiển thị |
| `created_at` | DATETIME | NOT NULL | DEFAULT NOW() | Ngày tạo |
| `updated_at` | DATETIME | NOT NULL | AUTO UPDATE | Ngày cập nhật |

---

### 3.11 Bảng `services` — Dịch vụ

**Chức năng:** Dịch vụ cụ thể của từng cơ sở spa. Mỗi dịch vụ có giá và thời gian thực hiện riêng.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh |
| `store_id` | CHAR(36) | NOT NULL | FK → stores.id | Cơ sở cung cấp |
| `category_id` | CHAR(36) | NULL | FK → service_categories.id | Danh mục (có thể không thuộc danh mục nào) |
| `name` | VARCHAR(150) | NOT NULL | — | Tên dịch vụ |
| `description` | TEXT | NULL | — | Mô tả chi tiết |
| `price` | DECIMAL(12,2) | NOT NULL | — | Giá dịch vụ (VND) |
| `duration_minutes` | INT | NOT NULL | — | Thời gian thực hiện (phút) |
| `image_url` | TEXT | NULL | — | URL ảnh minh họa |
| `is_visible` | BOOLEAN | NOT NULL | DEFAULT true | Hiển thị cho khách hàng |
| `avg_rating` | DECIMAL(3,2) | NOT NULL | DEFAULT 0.00 | Điểm đánh giá trung bình |
| `created_at` | DATETIME | NOT NULL | DEFAULT NOW() | Ngày tạo |
| `updated_at` | DATETIME | NOT NULL | AUTO UPDATE | Ngày cập nhật |

**Index:** `INDEX(store_id, is_visible)`, `INDEX(category_id)`

**Ghi chú:** `is_visible = false` dùng để tạm ẩn dịch vụ mà không xóa (soft hide).

---

### 3.12 Bảng `appointments` — Lịch hẹn

**Chức năng:** Lưu toàn bộ lịch hẹn. Đây là bảng trung tâm của hệ thống.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh |
| `customer_id` | CHAR(36) | NOT NULL | FK → users.id | Khách hàng đặt lịch |
| `staff_id` | CHAR(36) | NOT NULL | FK → staff.id | Nhân viên thực hiện |
| `service_id` | CHAR(36) | NOT NULL | FK → services.id | Dịch vụ đặt |
| `store_id` | CHAR(36) | NOT NULL | FK → stores.id | Cơ sở |
| `scheduled_at` | DATETIME | NOT NULL | — | Thời điểm bắt đầu lịch hẹn |
| `status` | ENUM | NOT NULL | DEFAULT PENDING | Trạng thái lịch hẹn |
| `reject_reason` | TEXT | NULL | — | Lý do từ chối (nếu bị reject) |
| `note` | TEXT | NULL | — | Ghi chú của khách hàng |
| `remind_24h_sent` | BOOLEAN | NOT NULL | DEFAULT false | Đã gửi nhắc nhở trước 24h |
| `remind_1h_sent` | BOOLEAN | NOT NULL | DEFAULT false | Đã gửi nhắc nhở trước 1h |
| `created_at` | DATETIME | NOT NULL | DEFAULT NOW() | Thời điểm đặt lịch |
| `updated_at` | DATETIME | NOT NULL | AUTO UPDATE | Thời điểm cập nhật |

**Enum `AppointmentStatus`:** `PENDING` → `CONFIRMED` → `PAID` → `COMPLETED` | `REJECTED`

**Luồng trạng thái:**
```
PENDING ──(owner confirm)──→ CONFIRMED ──(customer pay)──→ PAID ──(service done)──→ COMPLETED
PENDING ──(owner reject)───→ REJECTED
CONFIRMED ──(owner reject)─→ REJECTED
```

**Index:** `INDEX(customer_id, status)`, `INDEX(staff_id, scheduled_at)`, `INDEX(store_id, status, scheduled_at)`

**Ghi chú:** `remind_24h_sent` và `remind_1h_sent` là cờ để cronjob không gửi thông báo trùng lặp.

---

### 3.13 Bảng `payments` — Thanh toán

**Chức năng:** Lưu thông tin giao dịch thanh toán. Quan hệ 1-1 với `appointments`.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh |
| `appointment_id` | CHAR(36) | NOT NULL | UNIQUE, FK → appointments.id | Lịch hẹn thanh toán |
| `user_id` | CHAR(36) | NOT NULL | FK → users.id | Người thanh toán |
| `amount` | DECIMAL(12,2) | NOT NULL | — | Số tiền thanh toán (VND) |
| `method` | ENUM | NOT NULL | — | Phương thức thanh toán |
| `status` | ENUM | NOT NULL | DEFAULT PENDING | Trạng thái giao dịch |
| `transaction_id` | VARCHAR(200) | NULL | UNIQUE | Mã giao dịch từ cổng thanh toán |
| `gateway_response` | TEXT | NULL | — | Phản hồi raw từ cổng thanh toán (JSON) |
| `paid_at` | DATETIME | NULL | — | Thời điểm thanh toán thành công |
| `created_at` | DATETIME | NOT NULL | DEFAULT NOW() | Thời điểm khởi tạo |
| `updated_at` | DATETIME | NOT NULL | AUTO UPDATE | Thời điểm cập nhật |

**Enum `PaymentMethod`:** `VNPAY` | `STRIPE`  
**Enum `PaymentStatus`:** `PENDING` | `SUCCESS` | `FAILED`

**Index:** `INDEX(appointment_id)`, `INDEX(user_id)`

**Ghi chú:** `gateway_response` lưu toàn bộ response JSON từ VNPAY/Stripe để đối soát nếu có tranh chấp.

---

### 3.14 Bảng `reviews` — Đánh giá

**Chức năng:** Đánh giá của khách hàng sau khi hoàn thành dịch vụ. Quan hệ 1-1 với `appointments`.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh |
| `appointment_id` | CHAR(36) | NOT NULL | UNIQUE, FK → appointments.id | Lịch hẹn được đánh giá |
| `customer_id` | CHAR(36) | NOT NULL | FK → users.id | Người đánh giá |
| `service_id` | CHAR(36) | NOT NULL | FK → services.id | Dịch vụ được đánh giá |
| `staff_id` | CHAR(36) | NOT NULL | FK → staff.id | Nhân viên được đánh giá |
| `store_id` | CHAR(36) | NOT NULL | FK → stores.id | Cơ sở được đánh giá |
| `rating` | INT | NOT NULL | 1–5 | Điểm số (1 sao đến 5 sao) |
| `comment` | TEXT | NULL | — | Nhận xét văn bản |
| `created_at` | DATETIME | NOT NULL | DEFAULT NOW() | Thời điểm đánh giá |
| `updated_at` | DATETIME | NOT NULL | AUTO UPDATE | Thời điểm cập nhật |

**Index:** `INDEX(service_id)`, `INDEX(staff_id)`, `INDEX(store_id)`

**Ghi chú:** Mỗi lịch hẹn chỉ được đánh giá 1 lần (`UNIQUE appointment_id`). Sau khi review được tạo, hệ thống trigger cập nhật `avg_rating` trên `stores` và `staff`.

---

### 3.15 Bảng `chat_messages` — Tin nhắn chat

**Chức năng:** Lưu trữ lịch sử tin nhắn giữa khách hàng và cơ sở spa.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh |
| `conversation_id` | CHAR(36) | NOT NULL | — | ID nhóm cuộc hội thoại (không FK) |
| `sender_id` | CHAR(36) | NOT NULL | FK → users.id | Người gửi |
| `receiver_id` | CHAR(36) | NOT NULL | FK → users.id | Người nhận |
| `content` | TEXT | NOT NULL | — | Nội dung tin nhắn |
| `sender_role` | ENUM | NOT NULL | — | Vai trò người gửi |
| `is_read` | BOOLEAN | NOT NULL | DEFAULT false | Đã đọc chưa |
| `created_at` | DATETIME | NOT NULL | DEFAULT NOW() | Thời điểm gửi |
| `updated_at` | DATETIME | NOT NULL | AUTO UPDATE | Thời điểm cập nhật |

**Enum `SenderRole`:** `CUSTOMER` | `STAFF` | `AI`

**Index:** `INDEX(conversation_id, created_at)`, `INDEX(sender_id)`, `INDEX(receiver_id)`

**Ghi chú:** `conversation_id` là UUID được tạo khi hai bên bắt đầu cuộc hội thoại, không phải FK để tránh tạo thêm bảng Conversation (có thể mở rộng sau). `SenderRole.AI` dự phòng cho tính năng chatbot tư vấn.

---

### 3.16 Bảng `notifications` — Thông báo

**Chức năng:** Hàng đợi thông báo (Email/SMS) cho người dùng, đặc biệt là nhắc lịch hẹn.

| Tên cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---------|-------------|----------|-----------|-------|
| `id` | CHAR(36) | NOT NULL | PK, UUID | Định danh |
| `user_id` | CHAR(36) | NOT NULL | FK → users.id | Người nhận thông báo |
| `appointment_id` | CHAR(36) | NULL | FK → appointments.id | Lịch hẹn liên quan (nếu có) |
| `type` | ENUM | NOT NULL | — | Kênh gửi |
| `content` | TEXT | NOT NULL | — | Nội dung thông báo |
| `status` | ENUM | NOT NULL | DEFAULT PENDING | Trạng thái gửi |
| `retry_count` | INT | NOT NULL | DEFAULT 0 | Số lần thử lại |
| `sent_at` | DATETIME | NULL | — | Thời điểm gửi thành công |
| `created_at` | DATETIME | NOT NULL | DEFAULT NOW() | Thời điểm tạo |

**Enum `NotificationType`:** `EMAIL` | `SMS`  
**Enum `NotificationStatus`:** `PENDING` | `SENT` | `FAILED`

**Index:** `INDEX(user_id, status)`, `INDEX(appointment_id)`

**Ghi chú:** Cronjob sẽ quét bảng này theo `status = PENDING` và `retry_count < 3` để gửi lại nếu thất bại.

---

## 4. Thiết Kế RBAC (Phân Quyền)

### 4.1 Kiến trúc phân quyền

Hệ thống áp dụng mô hình **RBAC (Role-Based Access Control)** với hai cấp:

```
Cấp 1 — System Level:
  SUPER_ADMIN → permissions: [store:approve, store:ban, user:ban, ...]
  CUSTOMER    → permissions: [appointment:create, review:create, ...]

Cấp 2 — Shop Level (shop_id != NULL):
  OWNER       → permissions: [appointment:confirm, staff:manage, service:manage, ...]
  (Có thể tạo thêm role tùy chỉnh cho từng shop)
```

### 4.2 Các system role mặc định

| Role Code | is_system | shop_id | Mô tả |
|-----------|----------|---------|-------|
| `SUPER_ADMIN` | true | NULL | Quản trị toàn hệ thống |
| `CUSTOMER` | true | NULL | Khách hàng thông thường |
| `OWNER` | false | {shop_id} | Chủ cơ sở (tạo riêng cho từng shop) |

### 4.3 Một số permission mẫu

| Permission Code | Mô tả |
|----------------|-------|
| `store:approve` | Phê duyệt cơ sở mới |
| `store:ban` | Khóa cơ sở vi phạm |
| `user:ban` | Khóa tài khoản người dùng |
| `appointment:create` | Đặt lịch hẹn |
| `appointment:confirm` | Xác nhận lịch hẹn |
| `appointment:reject` | Từ chối lịch hẹn |
| `staff:manage` | Quản lý nhân viên |
| `service:manage` | Quản lý dịch vụ |
| `review:create` | Viết đánh giá |

---

## 5. Enum & Luồng Trạng Thái Nghiệp Vụ

### 5.1 Luồng trạng thái Lịch hẹn (`AppointmentStatus`)

```
         ┌──────────────────────────────────────────┐
         │              PENDING                     │
         │  (khách đặt, chờ owner xác nhận)         │
         └──────────┬──────────────────┬────────────┘
                    │ owner confirm     │ owner reject
                    ▼                  ▼
             CONFIRMED             REJECTED
         (chờ khách thanh toán)  (kết thúc)
                    │
                    │ customer pay (VNPAY/Stripe)
                    ▼
                  PAID
         (chờ thực hiện dịch vụ)
                    │
                    │ owner/staff mark done
                    ▼
               COMPLETED
         (khách có thể đánh giá)
```

### 5.2 Luồng trạng thái Cơ sở (`StoreStatus`)

```
PENDING → (admin approve) → ACTIVE  → (admin ban) → BANNED
        → (admin reject) → [bị xóa hoặc sửa lại]
ACTIVE  → (owner deactivate) → INACTIVE → (owner reactivate) → ACTIVE
```

### 5.3 Luồng trạng thái Thanh toán (`PaymentStatus`)

```
PENDING → (webhook confirm) → SUCCESS
        → (timeout/lỗi)    → FAILED → (retry) → PENDING
```

---

## 6. Indexing & Tối Ưu Hóa

### 6.1 Danh sách index quan trọng

| Bảng | Index | Lý do |
|------|-------|-------|
| `stores` | `(city, status)` | Query tìm kiếm cơ sở theo thành phố + đang hoạt động |
| `stores` | `(status)` | Admin lọc danh sách cơ sở chờ duyệt |
| `appointments` | `(staff_id, scheduled_at)` | Kiểm tra xung đột lịch khi đặt mới |
| `appointments` | `(store_id, status, scheduled_at)` | Owner xem lịch hẹn trong ngày |
| `appointments` | `(customer_id, status)` | Customer xem lịch hẹn của mình |
| `working_schedules` | `(staff_id, work_date)` | Tính toán slot trống của nhân viên |
| `chat_messages` | `(conversation_id, created_at)` | Load lịch sử chat theo thứ tự thời gian |
| `notifications` | `(user_id, status)` | Cronjob quét thông báo chưa gửi |
| `services` | `(store_id, is_visible)` | Hiển thị dịch vụ của shop cho khách |

### 6.2 Denormalization có chủ đích

| Cột | Bảng | Lý do |
|-----|------|-------|
| `avg_rating`, `total_reviews` | `stores` | Tránh COUNT/AVG mỗi lần hiển thị |
| `rating`, `total_reviews` | `staff` | Tránh COUNT/AVG mỗi lần hiển thị |
| `avg_rating` | `services` | Tránh COUNT/AVG mỗi lần hiển thị |

---

## 7. Migration & Seed Data

### 7.1 Quy trình migration với Prisma

```bash
# Tạo migration mới sau khi chỉnh schema
npx prisma migrate dev --name <tên_migration>

# Áp dụng migration lên production
npx prisma migrate deploy

# Xem trạng thái migration
npx prisma migrate status
```

### 7.2 Cấu trúc seed data cho demo

Seed data gồm các bước theo thứ tự phụ thuộc:

1. **Permissions** — Khai báo toàn bộ permission code
2. **Roles** — Tạo 3 system roles: SUPER_ADMIN, CUSTOMER, OWNER template
3. **RolePermissions** — Gán permissions cho từng role
4. **Users** — 1 admin, 2 owner, 5 customer
5. **UserRoles** — Gán role cho từng user
6. **Stores** — 2 cơ sở spa (1 ACTIVE, 1 PENDING)
7. **StoreHours** — Lịch mở cửa cho store ACTIVE (T2–T7)
8. **ServiceCategories** — 4 danh mục: Massage, Nail, Facial, Hair
9. **Services** — 3–5 dịch vụ cho mỗi store
10. **Staff** — 2–3 nhân viên cho store ACTIVE
11. **WorkingSchedules** — Lịch làm việc 7 ngày tới
12. **Appointments** — Các lịch hẹn mẫu ở các trạng thái khác nhau
13. **Payments** — Giao dịch mẫu cho các lịch hẹn PAID/COMPLETED
14. **Reviews** — Đánh giá cho các lịch hẹn COMPLETED

---

## 8. Tổng Kết

| Hạng mục | Số lượng |
|---------|---------|
| Tổng số bảng | 16 |
| Tổng số enum | 7 |
| Tổng số composite index | 9 |
| Tổng số khóa ngoại | 22 |

Thiết kế database đáp ứng đầy đủ yêu cầu của hệ thống đặt lịch spa đa phía với:
- **Tính mở rộng:** UUID, RBAC phân cấp, timezone riêng mỗi shop
- **Tính nhất quán:** Cascade delete, UNIQUE ràng buộc nghiệp vụ
- **Tính hiệu năng:** Composite index theo query pattern, denormalization có chủ đích
- **Tính truy vết:** `created_at`/`updated_at` trên mọi bảng, `gateway_response` lưu raw data thanh toán
