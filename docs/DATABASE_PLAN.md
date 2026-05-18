# Thiết kế Database — Glowora Spa Booking Platform
> Thiết kế từ đầu, bám sát 6 phases, không kế thừa schema cũ.  
> Ngày: 2026-05-12

---

## Mục lục
1. [Enums](#i-enums)
2. [Phase 1 — Auth & RBAC](#ii-phase-1--auth--rbac)
3. [Phase 2 — Store & Phê duyệt](#iii-phase-2--store--phê-duyệt)
4. [Phase 3 — Catalog & Nhân viên](#iv-phase-3--catalog--nhân-viên)
5. [Phase 4 — Booking & Lịch hẹn](#v-phase-4--booking--lịch-hẹn)
6. [Phase 5 — Thanh toán & Đánh giá](#vi-phase-5--thanh-toán--đánh-giá)
7. [Phase 6 — Nâng cao](#vii-phase-6--nâng-cao)
8. [Schema Prisma hoàn chỉnh](#viii-schema-prisma-hoàn-chỉnh)
9. [ERD tổng thể](#ix-erd-tổng-thể)
10. [Seed Data](#x-seed-data)
11. [Ghi chú thiết kế quan trọng](#xi-ghi-chú-thiết-kế-quan-trọng)

---

## I. Enums

### `UserStatus`
| Value | Ý nghĩa |
|-------|---------|
| `ACTIVE` | Tài khoản hoạt động bình thường |
| `INACTIVE` | Tài khoản bị tắt (tự tắt hoặc admin) |
| `BANNED` | Bị cấm vĩnh viễn — không đăng nhập được |
| `SUSPENDED` | Tạm đình chỉ (có thể mở lại) |

### `StoreStatus`
| Value | Ý nghĩa |
|-------|---------|
| `PENDING` | Mới đăng ký, chờ duyệt |
| `ACTIVE` | Đang hoạt động |
| `INACTIVE` | Tạm đóng (owner tự tắt) |
| `BANNED` | Bị khóa bởi Super Admin |

### `StaffStatus`
| Value | Ý nghĩa |
|-------|---------|
| `ACTIVE` | Đang làm việc |
| `INACTIVE` | Đã nghỉ việc / bị vô hiệu hoá |

### `DayOfWeek`
```
MONDAY | TUESDAY | WEDNESDAY | THURSDAY | FRIDAY | SATURDAY | SUNDAY
```
> Dùng enum thay Int để code tường minh; tránh nhầm lẫn 0-based vs 1-based.

### `ServiceStatus`
```
ACTIVE | INACTIVE
```

### `ComboStatus`
```
ACTIVE | INACTIVE
```

### `AppointmentStatus` — State machine
```
PENDING → CONFIRMED → COMPLETED
        → REJECTED
        → CANCELLED  (khách huỷ hoặc owner huỷ)
```
> **Không có `PAID`**: thanh toán là trách nhiệm của model `Payment`, không phải `Appointment`.

### `PaymentMethod`
```
VNPAY | STRIPE | CASH
```

### `PaymentStatus`
```
PENDING → PAID
        → FAILED
        → REFUNDED
```
> Dùng `PAID` thay vì `SUCCESS` để nhất quán với ngữ nghĩa tài chính.

### `StaffInviteStatus`
```
PENDING → ACCEPTED
        → EXPIRED
        → CANCELLED
```

### `NotificationType` — In-app inbox events
```
APPOINTMENT_CREATED | APPOINTMENT_CONFIRMED | APPOINTMENT_REJECTED
APPOINTMENT_COMPLETED | APPOINTMENT_CANCELLED
STORE_APPROVED | STORE_REJECTED | STORE_LOCKED
STAFF_INVITED | PAYMENT_SUCCESS
```
> Đây là **event type** cho inbox trong app, không phải channel (EMAIL/SMS).  
> Email/SMS gửi qua Nodemailer ở service layer, không cần track trong DB.

### `LogType` — Audit trail
```
AUTH_REGISTER | AUTH_LOGIN | AUTH_LOGOUT
STORE_CREATED | STORE_APPROVED | STORE_REJECTED | STORE_BANNED | STORE_UNLOCKED
USER_BANNED | USER_UNBANNED
PAYMENT_COMPLETED | PAYMENT_FAILED
REVIEW_HIDDEN | REVIEW_SHOWN
APPOINTMENT_CREATED | APPOINTMENT_CONFIRMED | APPOINTMENT_REJECTED
APPOINTMENT_COMPLETED | APPOINTMENT_CANCELLED
```

---

## II. Phase 1 — Auth & RBAC

### Model: `User`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `fullName` | `VarChar(100)` | NOT NULL | |
| `email` | `VarChar(150)` | UNIQUE, NOT NULL | |
| `password` | `String` | NOT NULL | Bcrypt hash |
| `phone` | `VarChar(20)` | nullable | |
| `avatarUrl` | `String` | nullable | URL Cloudinary (Phase 6) |
| `status` | `UserStatus` | default ACTIVE | |
| `refreshToken` | `String` | nullable | Hash của refresh token (1 device) |
| `emailVerifiedAt` | `DateTime` | nullable | Null = chưa verify; điền sau khi click link xác nhận email |
| `bannedAt` | `DateTime` | nullable | Điền khi ban user |
| `banReason` | `Text` | nullable | Lý do ban |
| `createdAt` | `DateTime` | default now() | |
| `updatedAt` | `DateTime` | @updatedAt | |

**Indexes:** `email` (unique — login lookup)

**Relations:**
- `userRoles[]` — danh sách roles
- `ownedStores[]` — các shop mà user là chủ
- `approvedStores[]` — các shop user đã duyệt (Super Admin)
- `staffProfile?` — nếu user là nhân viên
- `appointments[]` — lịch hẹn với tư cách khách hàng
- `payments[]`
- `reviews[]`
- `notifications[]`
- `conversations[]` — hội thoại chat (Phase 6)
- `sentMessages[]` — tin nhắn đã gửi (Phase 6)
- `systemLogs[]` — log hành động (Phase 6)

---

### Model: `Role`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `name` | `VarChar(100)` | NOT NULL | VD: "Shop Owner", "Nhân viên" |
| `code` | `VarChar(50)` | NOT NULL | VD: "SHOP_OWNER", "CUSTOMER" |
| `description` | `String` | nullable | |
| `isSystem` | `Boolean` | default false | `true` = role hệ thống (không xoá được) |
| `shopId` | `Char(36)` | nullable, FK → Store | `null` = system role; `storeId` = shop-specific cloned role |

**Unique:** `@@unique([code, shopId])`

> **Thiết kế RBAC:**
> - Role với `shopId = null` là **template system role** (CUSTOMER, SUPER_ADMIN, SHOP_OWNER template, SHOP_STAFF template)
> - Khi owner tạo shop → clone SHOP_OWNER template → tạo Role mới với `shopId = storeId`
> - Cho phép mỗi shop tự tuỳ chỉnh quyền riêng của nhân viên mình

---

### Model: `Permission`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `code` | `VarChar(100)` | UNIQUE | VD: `CREATE_SERVICE`, `APPROVE_STORE` |
| `name` | `VarChar(150)` | NOT NULL | Human-readable |
| `description` | `String` | nullable | |

---

### Model: `RolePermission` (join)

| Field | Type | Constraint |
|-------|------|-----------|
| `roleId` | `Char(36)` | FK → Role (cascade delete) |
| `permissionId` | `Char(36)` | FK → Permission (cascade delete) |

**PK:** `@@id([roleId, permissionId])`

---

### Model: `UserRole`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `userId` | `Char(36)` | FK → User (cascade delete) | |
| `roleId` | `Char(36)` | FK → Role | |
| `shopId` | `Char(36)` | nullable, FK → Store | `null` cho system roles; `storeId` cho shop roles |
| `createdAt` | `DateTime` | default now() | |

**Unique:** `@@unique([userId, roleId, shopId])`
> **Lưu ý:** MySQL coi `NULL != NULL` nên unique constraint không ngăn trùng với `shopId=null`.  
> Enforce bằng code: trước khi INSERT, check `findFirst({ where: { userId, roleId, shopId: null } })`.

**Indexes:** `[userId]`, `[shopId]`

---

## III. Phase 2 — Store & Phê duyệt

### Model: `Store`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `slug` | `VarChar(200)` | UNIQUE, nullable | Auto-generate từ name (VD: `glowora-spa-quan-1`) |
| `ownerId` | `Char(36)` | FK → User | |
| `name` | `VarChar(150)` | NOT NULL | |
| `phone` | `VarChar(20)` | NOT NULL | |
| `email` | `VarChar(150)` | nullable | |
| `website` | `VarChar(200)` | nullable | |
| `description` | `Text` | nullable | |
| `address` | `VarChar(300)` | NOT NULL | |
| `city` | `VarChar(100)` | NOT NULL | VD: "Hồ Chí Minh", "Hà Nội" |
| `district` | `VarChar(100)` | nullable | |
| `latitude` | `Float` | nullable | Geolocation Phase 6 |
| `longitude` | `Float` | nullable | Geolocation Phase 6 |
| `logoUrl` | `String` | nullable | |
| `bannerUrl` | `String` | nullable | |
| `status` | `StoreStatus` | default PENDING | |
| `approvedById` | `Char(36)` | nullable, FK → User | Super Admin duyệt |
| `approvedAt` | `DateTime` | nullable | |
| `rejectionReason` | `Text` | nullable | Lý do từ chối |
| `timezone` | `VarChar(50)` | default "Asia/Ho_Chi_Minh" | Dùng cho available-slots calc |
| `slotIntervalMins` | `Int` | default 30 | Bước nhảy slot trong booking wizard (phút) |
| `cancelBeforeHours` | `Int` | default 2 | Chỉ cho phép huỷ trước X tiếng |
| `maxAdvanceDays` | `Int` | default 30 | Đặt lịch tối đa X ngày tới |
| `autoConfirm` | `Boolean` | default false | Nếu true → PENDING tự thành CONFIRMED |
| `avgRating` | `Decimal(3,2)` | default 0.00 | Tính lại sau mỗi review |
| `totalReviews` | `Int` | default 0 | Đếm reviews isVisible=true |
| `createdAt` | `DateTime` | default now() | |
| `updatedAt` | `DateTime` | @updatedAt | |

**Indexes:** `[ownerId]`, `[status]`, `[city, status]` (search by city)

**Relations:**
- `workingHours[]` — giờ mở cửa
- `staff[]`
- `services[]`
- `combos[]`
- `appointments[]`
- `reviews[]`
- `roles[]` — shop-specific roles
- `userRoles[]`
- `staffInvites[]`
- `staffSchedules[]`
- `staffDayOffs[]`
- `conversations[]` (Phase 6)

---

### Model: `WorkingHour` (giờ mở cửa shop theo thứ)

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `storeId` | `Char(36)` | FK → Store (cascade delete) | |
| `dayOfWeek` | `DayOfWeek` | NOT NULL | |
| `openTime` | `VarChar(5)` | NOT NULL | `"08:00"` — String, không phải Time |
| `closeTime` | `VarChar(5)` | NOT NULL | `"20:00"` |
| `isClosed` | `Boolean` | default false | Ngày nghỉ định kỳ |

**Unique:** `@@unique([storeId, dayOfWeek])`

> **Tại sao dùng `String "HH:mm"` thay vì `@db.Time()`?**  
> Prisma map `@db.Time()` sang JavaScript `Date` object với date = `1970-01-01`.  
> Phải dùng `.getUTCHours()` / `.getUTCMinutes()` — rất dễ bug.  
> String "HH:mm" → split(':') đơn giản, dễ validate, dễ compare.

---

## IV. Phase 3 — Catalog & Nhân viên

### Model: `ServiceCategory`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `name` | `VarChar(100)` | UNIQUE | VD: "Chăm sóc da", "Massage" |
| `slug` | `VarChar(120)` | UNIQUE, nullable | VD: "skincare", "massage" |
| `description` | `String` | nullable | |
| `iconUrl` | `String` | nullable | |
| `createdAt` | `DateTime` | default now() | |
| `updatedAt` | `DateTime` | @updatedAt | |

> Category là global (Super Admin quản lý), không thuộc shop nào.

---

### Model: `Service`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `shopId` | `Char(36)` | FK → Store | |
| `categoryId` | `Char(36)` | nullable, FK → ServiceCategory | |
| `name` | `VarChar(150)` | NOT NULL | |
| `description` | `Text` | nullable | |
| `duration` | `Int` | NOT NULL | Phút — dùng để tính available slots |
| `price` | `Decimal(12,2)` | NOT NULL | |
| `imageUrl` | `String` | nullable | |
| `status` | `ServiceStatus` | default ACTIVE | INACTIVE = ẩn khỏi booking wizard |
| `avgRating` | `Decimal(3,2)` | default 0.00 | Tính lại sau mỗi review |
| `createdAt` | `DateTime` | default now() | |
| `updatedAt` | `DateTime` | @updatedAt | |

**Indexes:** `[shopId, status]`, `[categoryId]`

---

### Model: `Combo` (gói dịch vụ)

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `shopId` | `Char(36)` | FK → Store | |
| `categoryId` | `Char(36)` | nullable, FK → ServiceCategory | |
| `name` | `VarChar(150)` | NOT NULL | VD: "Gói chăm sóc da toàn diện" |
| `description` | `Text` | nullable | |
| `price` | `Decimal(12,2)` | NOT NULL | Giá combo (thường < tổng từng dịch vụ) |
| `estimatedDurationMinutes` | `Int` | nullable | `null` = tự tính từ items |
| `imageUrl` | `String` | nullable | |
| `status` | `ComboStatus` | default ACTIVE | |
| `createdAt` | `DateTime` | default now() | |
| `updatedAt` | `DateTime` | @updatedAt | |

**Indexes:** `[shopId, status]`

---

### Model: `ComboItem`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `comboId` | `Char(36)` | FK → Combo (cascade delete) | |
| `serviceId` | `Char(36)` | FK → Service | |
| `quantity` | `Int` | default 1 | Số lần thực hiện dịch vụ trong combo |
| `sortOrder` | `Int` | default 0 | Thứ tự hiển thị / thực hiện |

**Unique:** `@@unique([comboId, serviceId])`

---

### Model: `Staff`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `userId` | `Char(36)` | FK → User | |
| `storeId` | `Char(36)` | FK → Store | |
| `specialty` | `VarChar(200)` | nullable | VD: "Massage, Chăm sóc da" |
| `bio` | `Text` | nullable | Giới thiệu bản thân |
| `rating` | `Decimal(3,2)` | default 0.00 | Tính lại sau mỗi review có staffId |
| `totalReviews` | `Int` | default 0 | |
| `status` | `StaffStatus` | default ACTIVE | |
| `createdAt` | `DateTime` | default now() | |
| `updatedAt` | `DateTime` | @updatedAt | |

**Unique:** `@@unique([userId, storeId])` — 1 user không thể là staff 2 lần tại cùng 1 shop; cho phép làm việc tại nhiều shop khác nhau

**Indexes:** `[storeId, status]`

> Staff được tạo khi: (1) owner invite qua email → user accept → tạo Staff record

---

### Model: `StaffService` (join — nhân viên làm được dịch vụ nào)

| Field | Type | Constraint |
|-------|------|-----------|
| `staffId` | `Char(36)` | FK → Staff (cascade delete) |
| `serviceId` | `Char(36)` | FK → Service (cascade delete) |

**PK:** `@@id([staffId, serviceId])`

> Dùng ở Phase 4: khi customer chọn service → chỉ hiển thị staff có thể làm dịch vụ đó.

---

### Model: `StaffSchedule` (lịch làm việc tuần lặp lại — template)

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `shopId` | `Char(36)` | FK → Store | Dư nhưng giúp query nhanh |
| `staffId` | `Char(36)` | FK → Staff (cascade delete) | |
| `dayOfWeek` | `DayOfWeek` | NOT NULL | |
| `startTime` | `VarChar(5)` | NOT NULL | `"09:00"` — String "HH:mm" |
| `endTime` | `VarChar(5)` | NOT NULL | `"18:00"` |
| `isActive` | `Boolean` | default true | `false` = tuần này không làm thứ này |

**Unique:** `@@unique([staffId, dayOfWeek])`  
**Indexes:** `[shopId, dayOfWeek]`

> **Vai trò:** Kết hợp với `StaffDayOff` → tính available slots cho bất kỳ ngày nào.  
> Algorithm Phase 4: lấy schedule của thứ tương ứng → trừ đi booked appointments → chia theo slotIntervalMins.

---

### Model: `StaffDayOff` (ngày nghỉ cụ thể — override StaffSchedule)

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `shopId` | `Char(36)` | FK → Store | |
| `staffId` | `Char(36)` | FK → Staff (cascade delete) | |
| `date` | `@db.Date` | NOT NULL | |
| `reason` | `String` | nullable | VD: "Nghỉ phép", "Bệnh" |

**Unique:** `@@unique([staffId, date])`  
**Indexes:** `[shopId, date]`

---

### Model: `StaffInvite`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `storeId` | `Char(36)` | FK → Store | |
| `staffId` | `Char(36)` | nullable, FK → Staff | Điền khi invite được chấp nhận |
| `email` | `VarChar(150)` | NOT NULL | Email người được mời |
| `token` | `VarChar(200)` | UNIQUE | Secure random token gửi qua email |
| `status` | `StaffInviteStatus` | default PENDING | |
| `expiresAt` | `DateTime` | NOT NULL | Token hết hạn sau 24h |
| `createdAt` | `DateTime` | default now() | |

**Indexes:** `[email]`, `[storeId]`

**Flow:**
1. Owner gửi invite → tạo record với `status=PENDING`
2. User click link trong email → xác thực token + `expiresAt`
3. User chưa có account → yêu cầu đăng ký trước
4. Tạo `Staff` record → update `staffId`, `status=ACCEPTED`

---

## V. Phase 4 — Booking & Lịch hẹn

### Model: `Appointment`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `customerId` | `Char(36)` | FK → User | |
| `storeId` | `Char(36)` | FK → Store | |
| `serviceId` | `Char(36)` | FK → Service | |
| `staffId` | `Char(36)` | **nullable**, FK → Staff | `null` = không chọn nhân viên cụ thể |
| `scheduledAt` | `DateTime` | NOT NULL | UTC; hiển thị theo store.timezone |
| `duration` | `Int` | NOT NULL | **SNAPSHOT** của `service.duration` lúc đặt |
| `price` | `Decimal(12,2)` | NOT NULL | **SNAPSHOT** của `service.price` lúc đặt |
| `status` | `AppointmentStatus` | default PENDING | |
| `notes` | `Text` | nullable | Ghi chú của khách |
| `cancellationReason` | `Text` | nullable | Lý do huỷ |
| `confirmedAt` | `DateTime` | nullable | |
| `completedAt` | `DateTime` | nullable | |
| `cancelledAt` | `DateTime` | nullable | |
| `createdAt` | `DateTime` | default now() | |
| `updatedAt` | `DateTime` | @updatedAt | |

**Indexes:** `[customerId, status]`, `[storeId, status, scheduledAt]`, `[staffId, scheduledAt]`

> **Tại sao snapshot?**  
> Owner có thể đổi giá / thời gian dịch vụ sau khi booking.  
> `appointment.duration` và `appointment.price` là bất biến — không phụ thuộc vào service.  
> `Payment.amount = appointment.price` (không query lại service).

> **Available-slots algorithm (6 bước):**
> 1. Xác định ngày cần check + thứ tương ứng
> 2. Lấy `StaffSchedule` của nhân viên cho thứ đó (startTime, endTime)
> 3. Check `StaffDayOff` — nếu có → 0 slot
> 4. Check `WorkingHour` của store — cắt theo giờ mở cửa
> 5. Query tất cả `Appointment` của staff trong ngày đó (PENDING/CONFIRMED)
> 6. Tạo slot grid theo `slotIntervalMins`, đánh dấu blocked nếu overlap với [scheduledAt, scheduledAt+duration]

> **Race condition:**  
> Check + INSERT trong `prisma.$transaction()`.  
> Re-check overlap ngay trong transaction, throw `ConflictException` nếu slot đã bị chiếm.

---

## VI. Phase 5 — Thanh toán & Đánh giá

### Model: `Payment`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `appointmentId` | `Char(36)` | FK → Appointment | **KHÔNG** `@unique` — cho phép retry |
| `customerId` | `Char(36)` | FK → User | |
| `amount` | `Decimal(12,2)` | NOT NULL | = `appointment.price` |
| `method` | `PaymentMethod` | default VNPAY | |
| `status` | `PaymentStatus` | default PENDING | |
| `vnpTxnRef` | `VarChar(100)` | UNIQUE, nullable | Format: `{appointmentId}-{timestamp}` |
| `vnpTransactionNo` | `VarChar(100)` | nullable | Mã giao dịch VNPAY (từ callback) |
| `vnpBankCode` | `VarChar(20)` | nullable | `"VCB"`, `"TCB"`, ... |
| `vnpCardType` | `VarChar(20)` | nullable | `"ATM"` hoặc `"CREDIT"` |
| `vnpPayDate` | `VarChar(20)` | nullable | `"20251220093045"` — format VNPAY |
| `vnpResponseCode` | `VarChar(10)` | nullable | `"00"` = success; lưu để debug |
| `paidAt` | `DateTime` | nullable | |
| `failedReason` | `VarChar(500)` | nullable | |
| `createdAt` | `DateTime` | default now() | |
| `updatedAt` | `DateTime` | @updatedAt | |

**Indexes:** `[appointmentId]`, `[customerId, status]`

> **VNPAY flow:**
> - `buildVnpayUrl()` → tạo Payment record + tạo redirect URL
> - IPN endpoint (server-to-server): nguồn uỷ quyền chính — xử lý idempotent
> - Return URL: chỉ dùng để redirect UI (không update DB ở đây)
>
> **Retry pattern:**
> - Lần 1 thất bại (status=FAILED) → tạo Payment record mới với `vnpTxnRef` mới
> - Cả 2 record cùng `appointmentId` — không vi phạm constraint
> - Query "thanh toán thành công của appointment": `WHERE appointmentId=? AND status=PAID`

---

### Model: `Review`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `appointmentId` | `Char(36)` | UNIQUE, FK → Appointment | 1 appointment → tối đa 1 review |
| `customerId` | `Char(36)` | FK → User | |
| `storeId` | `Char(36)` | FK → Store | Denormalize để query review của shop nhanh |
| `serviceId` | `Char(36)` | FK → Service | |
| `staffId` | `Char(36)` | **nullable**, FK → Staff | Null nếu appointment không có nhân viên cụ thể |
| `rating` | `Int` | NOT NULL | 1–5 |
| `comment` | `Text` | nullable | |
| `isVisible` | `Boolean` | default true | Super Admin ẩn review vi phạm |
| `imageUrls` | `Json` | nullable | `["https://...", ...]` tối đa 5 ảnh |
| `createdAt` | `DateTime` | default now() | |
| `updatedAt` | `DateTime` | @updatedAt | |

**Indexes:** `[storeId, isVisible, createdAt]`, `[serviceId, isVisible]`, `[staffId, isVisible]`

> **avgRating recalculation** (trong `prisma.$transaction()`):
> - Sau create/update review → tính lại `Store.avgRating`, `Service.avgRating`, `Staff.rating`
> - Chỉ tính các review có `isVisible = true`
> - Khi admin ẩn review → re-trigger recalculation

---

## VII. Phase 6 — Nâng cao

### Model: `Notification` (in-app inbox)

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `userId` | `Char(36)` | FK → User (cascade delete) | Người nhận |
| `appointmentId` | `Char(36)` | nullable, FK → Appointment | Context liên quan |
| `type` | `NotificationType` | NOT NULL | |
| `title` | `VarChar(200)` | NOT NULL | |
| `body` | `Text` | NOT NULL | |
| `isRead` | `Boolean` | default false | |
| `metadata` | `Json` | nullable | `{ "appointmentId": "...", "storeName": "..." }` |
| `createdAt` | `DateTime` | default now() | |

**Indexes:** `[userId, isRead]`, `[userId, createdAt]`

> Notification được tạo trong service layer khi có event (booking confirmed, v.v.).  
> Socket.IO push realtime; Bull Queue gửi email nhắc nhở (24h trước, 1h trước appointment).

---

### Model: `Conversation` (1 cặp customer-store)

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `customerId` | `Char(36)` | FK → User | |
| `storeId` | `Char(36)` | FK → Store | |
| `lastMessageAt` | `DateTime` | nullable | Dùng để sort conversation list |
| `lastMessageBody` | `VarChar(200)` | nullable | Preview tin nhắn cuối |
| `createdAt` | `DateTime` | default now() | |
| `updatedAt` | `DateTime` | @updatedAt | |

**Unique:** `@@unique([customerId, storeId])` — findOrCreate pattern  
**Indexes:** `[customerId, lastMessageAt]`, `[storeId, lastMessageAt]`

---

### Model: `Message`

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `conversationId` | `Char(36)` | FK → Conversation (cascade delete) | |
| `senderId` | `Char(36)` | FK → User | |
| `content` | `Text` | NOT NULL | |
| `isRead` | `Boolean` | default false | |
| `readAt` | `DateTime` | nullable | |
| `createdAt` | `DateTime` | default now() | |

**Indexes:** `[conversationId, createdAt]`, `[senderId]`

---

### Model: `SystemLog` (audit trail cho Super Admin)

| Field | Type | Constraint | Ghi chú |
|-------|------|-----------|---------|
| `id` | `Char(36)` | PK, UUID | |
| `type` | `LogType` | NOT NULL | |
| `actorId` | `Char(36)` | nullable, FK → User | `null` = hệ thống tự làm (cronjob) |
| `targetId` | `VarChar(36)` | nullable | ID của entity bị tác động |
| `targetType` | `VarChar(50)` | nullable | `"USER"`, `"STORE"`, `"APPOINTMENT"`, ... |
| `metadata` | `Json` | nullable | `{ before: {...}, after: {...} }` |
| `ipAddress` | `VarChar(45)` | nullable | IPv4 hoặc IPv6 |
| `createdAt` | `DateTime` | default now() | |

**Indexes:** `[actorId]`, `[type, createdAt]`, `[targetId, targetType]`

---

## VIII. Schema Prisma hoàn chỉnh

```prisma
// ============================================================
// GLOWORA — Complete Prisma Schema (All 6 Phases)
// ============================================================

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ─── ENUMS ────────────────────────────────────────────────────

enum UserStatus {
  ACTIVE
  INACTIVE
  BANNED
  SUSPENDED
}

enum StoreStatus {
  PENDING
  ACTIVE
  INACTIVE
  BANNED
}

enum StaffStatus {
  ACTIVE
  INACTIVE
}

enum AppointmentStatus {
  PENDING
  CONFIRMED
  COMPLETED
  REJECTED
  CANCELLED
}

enum PaymentMethod {
  VNPAY
  STRIPE
  CASH
}

enum PaymentStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
}

enum NotificationType {
  APPOINTMENT_CREATED
  APPOINTMENT_CONFIRMED
  APPOINTMENT_REJECTED
  APPOINTMENT_COMPLETED
  APPOINTMENT_CANCELLED
  STORE_APPROVED
  STORE_REJECTED
  STORE_LOCKED
  STAFF_INVITED
  PAYMENT_SUCCESS
}

enum DayOfWeek {
  MONDAY
  TUESDAY
  WEDNESDAY
  THURSDAY
  FRIDAY
  SATURDAY
  SUNDAY
}

enum ServiceStatus {
  ACTIVE
  INACTIVE
}

enum ComboStatus {
  ACTIVE
  INACTIVE
}

enum StaffInviteStatus {
  PENDING
  ACCEPTED
  EXPIRED
  CANCELLED
}

enum LogType {
  AUTH_REGISTER
  AUTH_LOGIN
  AUTH_LOGOUT
  STORE_CREATED
  STORE_APPROVED
  STORE_REJECTED
  STORE_BANNED
  STORE_UNLOCKED
  USER_BANNED
  USER_UNBANNED
  PAYMENT_COMPLETED
  PAYMENT_FAILED
  REVIEW_HIDDEN
  REVIEW_SHOWN
  APPOINTMENT_CREATED
  APPOINTMENT_CONFIRMED
  APPOINTMENT_REJECTED
  APPOINTMENT_COMPLETED
  APPOINTMENT_CANCELLED
}

// ─── PHASE 1: RBAC ────────────────────────────────────────────

model Role {
  id          String  @id @default(uuid()) @db.Char(36)
  name        String  @db.VarChar(100)
  code        String  @db.VarChar(50)
  description String?
  isSystem    Boolean @default(false) @map("is_system")
  shopId      String? @map("shop_id") @db.Char(36)

  shop        Store?           @relation("ShopRoles", fields: [shopId], references: [id])
  permissions RolePermission[]
  userRoles   UserRole[]

  @@unique([code, shopId])
  @@index([shopId])
  @@map("roles")
}

model Permission {
  id          String  @id @default(uuid()) @db.Char(36)
  code        String  @unique @db.VarChar(100)
  name        String  @db.VarChar(150)
  description String?

  roles RolePermission[]

  @@map("permissions")
}

model RolePermission {
  roleId       String @map("role_id") @db.Char(36)
  permissionId String @map("permission_id") @db.Char(36)

  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@map("role_permissions")
}

model UserRole {
  id        String   @id @default(uuid()) @db.Char(36)
  userId    String   @map("user_id") @db.Char(36)
  roleId    String   @map("role_id") @db.Char(36)
  shopId    String?  @map("shop_id") @db.Char(36)
  createdAt DateTime @default(now()) @map("created_at")

  user User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role   @relation(fields: [roleId], references: [id])
  shop Store? @relation("UserShopRoles", fields: [shopId], references: [id])

  @@unique([userId, roleId, shopId])
  @@index([userId])
  @@index([shopId])
  @@map("user_roles")
}

// ─── PHASE 1: USER ────────────────────────────────────────────

model User {
  id           String     @id @default(uuid()) @db.Char(36)
  fullName     String     @map("full_name") @db.VarChar(100)
  email        String     @unique @db.VarChar(150)
  password     String
  phone        String?    @db.VarChar(20)
  avatarUrl    String?    @map("avatar_url")
  status           UserStatus @default(ACTIVE)
  refreshToken     String?    @map("refresh_token")
  emailVerifiedAt  DateTime?  @map("email_verified_at")
  bannedAt         DateTime?  @map("banned_at")
  banReason    String?    @map("ban_reason") @db.Text
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt @map("updated_at")

  userRoles      UserRole[]
  ownedStores    Store[]        @relation("StoreOwner")
  approvedStores Store[]        @relation("StoreApprover")
  staffProfile   Staff?
  appointments   Appointment[]  @relation("CustomerAppointments")
  payments       Payment[]
  reviews        Review[]       @relation("CustomerReviews")
  notifications  Notification[]
  conversations  Conversation[] @relation("CustomerConversations")
  sentMessages   Message[]      @relation("SentMessages")
  systemLogs     SystemLog[]    @relation("ActorLogs")

  @@map("users")
}

// ─── PHASE 2: STORE ───────────────────────────────────────────

model Store {
  id                String      @id @default(uuid()) @db.Char(36)
  slug              String?     @unique @db.VarChar(200)
  ownerId           String      @map("owner_id") @db.Char(36)
  name              String      @db.VarChar(150)
  phone             String      @db.VarChar(20)
  email             String?     @db.VarChar(150)
  website           String?     @db.VarChar(200)
  description       String?     @db.Text
  address           String      @db.VarChar(300)
  city              String      @db.VarChar(100)
  district          String?     @db.VarChar(100)
  latitude          Float?
  longitude         Float?
  logoUrl           String?     @map("logo_url")
  bannerUrl         String?     @map("banner_url")
  status            StoreStatus @default(PENDING)
  approvedById      String?     @map("approved_by_id") @db.Char(36)
  approvedAt        DateTime?   @map("approved_at")
  rejectionReason   String?     @map("rejection_reason") @db.Text
  timezone          String      @default("Asia/Ho_Chi_Minh") @db.VarChar(50)
  slotIntervalMins  Int         @default(30) @map("slot_interval_mins")
  cancelBeforeHours Int         @default(2) @map("cancel_before_hours")
  maxAdvanceDays    Int         @default(30) @map("max_advance_days")
  autoConfirm       Boolean     @default(false) @map("auto_confirm")
  avgRating         Decimal     @default(0.00) @map("avg_rating") @db.Decimal(3, 2)
  totalReviews      Int         @default(0) @map("total_reviews")
  createdAt         DateTime    @default(now()) @map("created_at")
  updatedAt         DateTime    @updatedAt @map("updated_at")

  owner          User            @relation("StoreOwner", fields: [ownerId], references: [id])
  approvedBy     User?           @relation("StoreApprover", fields: [approvedById], references: [id])
  workingHours   WorkingHour[]
  staff          Staff[]
  services       Service[]
  combos         Combo[]
  appointments   Appointment[]
  reviews        Review[]
  roles          Role[]          @relation("ShopRoles")
  userRoles      UserRole[]      @relation("UserShopRoles")
  staffInvites   StaffInvite[]
  staffSchedules StaffSchedule[]
  staffDayOffs   StaffDayOff[]
  conversations  Conversation[]

  @@index([ownerId])
  @@index([status])
  @@index([city, status])
  @@map("stores")
}

model WorkingHour {
  id        String    @id @default(uuid()) @db.Char(36)
  storeId   String    @map("store_id") @db.Char(36)
  dayOfWeek DayOfWeek @map("day_of_week")
  openTime  String    @map("open_time") @db.VarChar(5)
  closeTime String    @map("close_time") @db.VarChar(5)
  isClosed  Boolean   @default(false) @map("is_closed")

  store Store @relation(fields: [storeId], references: [id], onDelete: Cascade)

  @@unique([storeId, dayOfWeek])
  @@index([storeId])
  @@map("working_hours")
}

// ─── PHASE 3: CATALOG ─────────────────────────────────────────

model ServiceCategory {
  id          String   @id @default(uuid()) @db.Char(36)
  name        String   @unique @db.VarChar(100)
  slug        String?  @unique @db.VarChar(120)
  description String?
  iconUrl     String?  @map("icon_url")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  services Service[]
  combos   Combo[]

  @@map("service_categories")
}

model Service {
  id          String        @id @default(uuid()) @db.Char(36)
  shopId      String        @map("shop_id") @db.Char(36)
  categoryId  String?       @map("category_id") @db.Char(36)
  name        String        @db.VarChar(150)
  description String?       @db.Text
  duration    Int
  price       Decimal       @db.Decimal(12, 2)
  imageUrl    String?       @map("image_url")
  status      ServiceStatus @default(ACTIVE)
  avgRating   Decimal       @default(0.00) @map("avg_rating") @db.Decimal(3, 2)
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  store        Store            @relation(fields: [shopId], references: [id])
  category     ServiceCategory? @relation(fields: [categoryId], references: [id])
  appointments Appointment[]
  reviews      Review[]
  staffs       StaffService[]
  comboItems   ComboItem[]

  @@index([shopId, status])
  @@index([categoryId])
  @@map("services")
}

model Combo {
  id                       String      @id @default(uuid()) @db.Char(36)
  shopId                   String      @map("shop_id") @db.Char(36)
  categoryId               String?     @map("category_id") @db.Char(36)
  name                     String      @db.VarChar(150)
  description              String?     @db.Text
  price                    Decimal     @db.Decimal(12, 2)
  estimatedDurationMinutes Int?        @map("estimated_duration_minutes")
  imageUrl                 String?     @map("image_url")
  status                   ComboStatus @default(ACTIVE)
  createdAt                DateTime    @default(now()) @map("created_at")
  updatedAt                DateTime    @updatedAt @map("updated_at")

  shop     Store            @relation(fields: [shopId], references: [id])
  category ServiceCategory? @relation(fields: [categoryId], references: [id])
  items    ComboItem[]

  @@index([shopId, status])
  @@map("combos")
}

model ComboItem {
  id        String @id @default(uuid()) @db.Char(36)
  comboId   String @map("combo_id") @db.Char(36)
  serviceId String @map("service_id") @db.Char(36)
  quantity  Int    @default(1)
  sortOrder Int    @default(0) @map("sort_order")

  combo   Combo   @relation(fields: [comboId], references: [id], onDelete: Cascade)
  service Service @relation(fields: [serviceId], references: [id])

  @@unique([comboId, serviceId])
  @@index([comboId])
  @@map("combo_items")
}

// ─── PHASE 3: STAFF ───────────────────────────────────────────

model Staff {
  id           String      @id @default(uuid()) @db.Char(36)
  userId       String      @map("user_id") @db.Char(36)
  storeId      String      @map("store_id") @db.Char(36)
  specialty    String?     @db.VarChar(200)
  bio          String?     @db.Text
  rating       Decimal     @default(0.00) @db.Decimal(3, 2)
  totalReviews Int         @default(0) @map("total_reviews")
  status       StaffStatus @default(ACTIVE)
  createdAt    DateTime    @default(now()) @map("created_at")
  updatedAt    DateTime    @updatedAt @map("updated_at")

  user         User            @relation(fields: [userId], references: [id])
  store        Store           @relation(fields: [storeId], references: [id])
  appointments Appointment[]
  reviews      Review[]        @relation("StaffReviews")
  schedules    StaffSchedule[]
  dayOffs      StaffDayOff[]
  services     StaffService[]
  invites      StaffInvite[]

  @@unique([userId, storeId])
  @@index([storeId, status])
  @@map("staff")
}

model StaffService {
  staffId   String @map("staff_id") @db.Char(36)
  serviceId String @map("service_id") @db.Char(36)

  staff   Staff   @relation(fields: [staffId], references: [id], onDelete: Cascade)
  service Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@id([staffId, serviceId])
  @@map("staff_services")
}

model StaffSchedule {
  id        String    @id @default(uuid()) @db.Char(36)
  shopId    String    @map("shop_id") @db.Char(36)
  staffId   String    @map("staff_id") @db.Char(36)
  dayOfWeek DayOfWeek @map("day_of_week")
  startTime String    @map("start_time") @db.VarChar(5)
  endTime   String    @map("end_time") @db.VarChar(5)
  isActive  Boolean   @default(true) @map("is_active")

  shop  Store @relation(fields: [shopId], references: [id])
  staff Staff @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@unique([staffId, dayOfWeek])
  @@index([shopId, dayOfWeek])
  @@map("staff_schedules")
}

model StaffDayOff {
  id      String   @id @default(uuid()) @db.Char(36)
  shopId  String   @map("shop_id") @db.Char(36)
  staffId String   @map("staff_id") @db.Char(36)
  date    DateTime @map("date") @db.Date
  reason  String?

  shop  Store @relation(fields: [shopId], references: [id])
  staff Staff @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@unique([staffId, date])
  @@index([shopId, date])
  @@map("staff_day_offs")
}

model StaffInvite {
  id        String            @id @default(uuid()) @db.Char(36)
  storeId   String            @map("store_id") @db.Char(36)
  staffId   String?           @map("staff_id") @db.Char(36)
  email     String            @db.VarChar(150)
  token     String            @unique @db.VarChar(200)
  status    StaffInviteStatus @default(PENDING)
  expiresAt DateTime          @map("expires_at")
  createdAt DateTime          @default(now()) @map("created_at")

  store Store  @relation(fields: [storeId], references: [id])
  staff Staff? @relation(fields: [staffId], references: [id])

  @@index([email])
  @@index([storeId])
  @@map("staff_invites")
}

// ─── PHASE 4: APPOINTMENT ─────────────────────────────────────

model Appointment {
  id                 String            @id @default(uuid()) @db.Char(36)
  customerId         String            @map("customer_id") @db.Char(36)
  storeId            String            @map("store_id") @db.Char(36)
  serviceId          String            @map("service_id") @db.Char(36)
  staffId            String?           @map("staff_id") @db.Char(36)
  scheduledAt        DateTime          @map("scheduled_at")
  duration           Int
  price              Decimal           @db.Decimal(12, 2)
  status             AppointmentStatus @default(PENDING)
  notes              String?           @db.Text
  cancellationReason String?           @map("cancellation_reason") @db.Text
  confirmedAt        DateTime?         @map("confirmed_at")
  completedAt        DateTime?         @map("completed_at")
  cancelledAt        DateTime?         @map("cancelled_at")
  createdAt          DateTime          @default(now()) @map("created_at")
  updatedAt          DateTime          @updatedAt @map("updated_at")

  customer      User           @relation("CustomerAppointments", fields: [customerId], references: [id])
  store         Store          @relation(fields: [storeId], references: [id])
  service       Service        @relation(fields: [serviceId], references: [id])
  staff         Staff?         @relation(fields: [staffId], references: [id])
  payment       Payment?
  review        Review?
  notifications Notification[]

  @@index([customerId, status])
  @@index([storeId, status, scheduledAt])
  @@index([staffId, scheduledAt])
  @@map("appointments")
}

// ─── PHASE 5: PAYMENT ─────────────────────────────────────────

model Payment {
  id               String        @id @default(uuid()) @db.Char(36)
  appointmentId    String        @map("appointment_id") @db.Char(36)
  customerId       String        @map("customer_id") @db.Char(36)
  amount           Decimal       @db.Decimal(12, 2)
  method           PaymentMethod @default(VNPAY)
  status           PaymentStatus @default(PENDING)
  vnpTxnRef        String?       @unique @map("vnp_txn_ref") @db.VarChar(100)
  vnpTransactionNo String?       @map("vnp_transaction_no") @db.VarChar(100)
  vnpBankCode      String?       @map("vnp_bank_code") @db.VarChar(20)
  vnpCardType      String?       @map("vnp_card_type") @db.VarChar(20)
  vnpPayDate       String?       @map("vnp_pay_date") @db.VarChar(20)
  vnpResponseCode  String?       @map("vnp_response_code") @db.VarChar(10)
  paidAt           DateTime?     @map("paid_at")
  failedReason     String?       @map("failed_reason") @db.VarChar(500)
  createdAt        DateTime      @default(now()) @map("created_at")
  updatedAt        DateTime      @updatedAt @map("updated_at")

  appointment Appointment @relation(fields: [appointmentId], references: [id])
  customer    User        @relation(fields: [customerId], references: [id])

  @@index([appointmentId])
  @@index([customerId, status])
  @@map("payments")
}

// ─── PHASE 5: REVIEW ──────────────────────────────────────────

model Review {
  id            String   @id @default(uuid()) @db.Char(36)
  appointmentId String   @unique @map("appointment_id") @db.Char(36)
  customerId    String   @map("customer_id") @db.Char(36)
  storeId       String   @map("store_id") @db.Char(36)
  serviceId     String   @map("service_id") @db.Char(36)
  staffId       String?  @map("staff_id") @db.Char(36)
  rating        Int
  comment       String?  @db.Text
  isVisible     Boolean  @default(true) @map("is_visible")
  imageUrls     Json?    @map("image_urls")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  appointment Appointment @relation(fields: [appointmentId], references: [id])
  customer    User        @relation("CustomerReviews", fields: [customerId], references: [id])
  store       Store       @relation(fields: [storeId], references: [id])
  service     Service     @relation(fields: [serviceId], references: [id])
  staff       Staff?      @relation("StaffReviews", fields: [staffId], references: [id])

  @@index([storeId, isVisible, createdAt])
  @@index([serviceId, isVisible])
  @@index([staffId, isVisible])
  @@map("reviews")
}

// ─── PHASE 6: NOTIFICATION ────────────────────────────────────

model Notification {
  id            String           @id @default(uuid()) @db.Char(36)
  userId        String           @map("user_id") @db.Char(36)
  appointmentId String?          @map("appointment_id") @db.Char(36)
  type          NotificationType
  title         String           @db.VarChar(200)
  body          String           @db.Text
  isRead        Boolean          @default(false) @map("is_read")
  metadata      Json?
  createdAt     DateTime         @default(now()) @map("created_at")

  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  appointment Appointment? @relation(fields: [appointmentId], references: [id])

  @@index([userId, isRead])
  @@index([userId, createdAt])
  @@map("notifications")
}

// ─── PHASE 6: CHAT ────────────────────────────────────────────

model Conversation {
  id              String    @id @default(uuid()) @db.Char(36)
  customerId      String    @map("customer_id") @db.Char(36)
  storeId         String    @map("store_id") @db.Char(36)
  lastMessageAt   DateTime? @map("last_message_at")
  lastMessageBody String?   @map("last_message_body") @db.VarChar(200)
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  customer User      @relation("CustomerConversations", fields: [customerId], references: [id])
  store    Store     @relation(fields: [storeId], references: [id])
  messages Message[]

  @@unique([customerId, storeId])
  @@index([customerId, lastMessageAt])
  @@index([storeId, lastMessageAt])
  @@map("conversations")
}

model Message {
  id             String    @id @default(uuid()) @db.Char(36)
  conversationId String    @map("conversation_id") @db.Char(36)
  senderId       String    @map("sender_id") @db.Char(36)
  content        String    @db.Text
  isRead         Boolean   @default(false) @map("is_read")
  readAt         DateTime? @map("read_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User         @relation("SentMessages", fields: [senderId], references: [id])

  @@index([conversationId, createdAt])
  @@index([senderId])
  @@map("messages")
}

// ─── PHASE 6: ADMIN ───────────────────────────────────────────

model SystemLog {
  id         String   @id @default(uuid()) @db.Char(36)
  type       LogType
  actorId    String?  @map("actor_id") @db.Char(36)
  targetId   String?  @map("target_id") @db.VarChar(36)
  targetType String?  @map("target_type") @db.VarChar(50)
  metadata   Json?
  ipAddress  String?  @map("ip_address") @db.VarChar(45)
  createdAt  DateTime @default(now()) @map("created_at")

  actor User? @relation("ActorLogs", fields: [actorId], references: [id])

  @@index([actorId])
  @@index([type, createdAt])
  @@index([targetId, targetType])
  @@map("system_logs")
}
```

---

## IX. ERD Tổng thể

```
┌─────────────────────────────────────────────────────┐
│                       USER                          │
│  id · fullName · email · password · phone           │
│  avatarUrl · status · refreshToken                  │
│  bannedAt · banReason                               │
└──┬──────┬──────┬──────┬──────┬──────┬──────────────┘
   │      │      │      │      │      │
   │  OWNED  APPROVED  STAFF  APPT  PAYMENT  REVIEW
   │  STORES STORES  PROFILE
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            STORE                                     │
│  id · slug · ownerId · name · phone · address · city · district     │
│  latitude · longitude · logoUrl · bannerUrl · status                 │
│  timezone · slotIntervalMins · cancelBeforeHours · maxAdvanceDays   │
│  autoConfirm · avgRating · totalReviews                             │
└──┬─────────┬────────┬──────┬──────┬───────┬───────┬───────────────┘
   │         │        │      │      │       │       │
 WORKING  SERVICE   COMBO  STAFF  APPT  REVIEW  CONVER-
  HOUR                    INVITE         SATION

┌─────────────────────────────────────────────────────┐
│                    WORKING HOUR                     │
│  storeId · dayOfWeek · openTime · closeTime         │
│  isClosed                                           │
│  @@unique([storeId, dayOfWeek])                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│               SERVICE CATEGORY (global)             │
│  name · slug · iconUrl                              │
└──────────────────┬──────────────────────────────────┘
                   │ 1:N                1:N
           ┌───────┴──────┐      ┌──────┴──────┐
           │   SERVICE    │      │    COMBO    │
           │ shopId       │      │ shopId      │
           │ categoryId   │      │ categoryId  │
           │ name         │      │ name        │
           │ duration     │      │ price       │
           │ price        │      │ estimatedDur│
           │ status       │      │ status      │
           │ avgRating    │      └──────┬──────┘
           └──────────────┘             │ 1:N
                                  ┌─────┴──────┐
                                  │ COMBO ITEM │
                                  │ serviceId  │
                                  │ quantity   │
                                  │ sortOrder  │
                                  └────────────┘

┌─────────────────────────────────────────────────────┐
│                       STAFF                         │
│  userId(unique) · storeId · specialty · bio         │
│  rating · totalReviews · status                     │
└──┬──────────┬──────────┬──────────┬─────────────────┘
   │          │          │          │
SCHEDULE    DAYOFF   SERVICE    INVITE
(weekly)   (specific) (join)

┌─────────────────────────────────────────────────────┐
│                   STAFF SCHEDULE                    │
│  staffId · shopId · dayOfWeek                       │
│  startTime · endTime · isActive                     │
│  @@unique([staffId, dayOfWeek])                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   STAFF DAY OFF                     │
│  staffId · shopId · date · reason                   │
│  @@unique([staffId, date])                          │
└─────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                         APPOINTMENT                               │
│  customerId · storeId · serviceId · staffId(nullable)             │
│  scheduledAt · duration(snapshot) · price(snapshot)              │
│  status · notes · cancellationReason                             │
│  confirmedAt · completedAt · cancelledAt                         │
└──────────────────────┬────────────────┬──────────────────────────┘
                       │                │
               ┌───────┴──────┐  ┌──────┴─────────┐
               │   PAYMENT    │  │     REVIEW      │
               │ appointmentId│  │ appointmentId   │
               │ amount(=snap)│  │ (@unique)       │
               │ method/status│  │ rating · comment│
               │ vnpTxnRef    │  │ isVisible       │
               │ vnp* fields  │  │ imageUrls       │
               │ paidAt       │  └─────────────────┘
               └──────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                        NOTIFICATION                              │
│  userId · appointmentId(nullable) · type · title · body          │
│  isRead · metadata(Json)                                         │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────────────┐      ┌────────────────────────────────┐
│      CONVERSATION        │      │           MESSAGE              │
│  customerId · storeId    │─1:N─▶│  conversationId · senderId    │
│  lastMessageAt           │      │  content · isRead · readAt    │
│  @@unique([cust, store]) │      └────────────────────────────────┘
└─────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                         SYSTEM LOG                               │
│  type · actorId(nullable) · targetId · targetType · metadata     │
│  ipAddress                                                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## X. Seed Data

### Permissions (từ `ALL_PERMISSION_CODES`)
Seed toàn bộ ~45 permission codes vào bảng `permissions`.

### System Roles (4 roles, isSystem=true, shopId=null)

| code | name | isSystem | shopId | Mô tả |
|------|------|---------|--------|-------|
| `CUSTOMER` | Khách hàng | true | null | Gán tự động khi đăng ký |
| `SUPER_ADMIN` | Super Admin | true | null | Gán thủ công cho admin hệ thống |
| `SHOP_OWNER` | Chủ tiệm (Template) | true | null | Clone khi tạo shop |
| `SHOP_STAFF` | Nhân viên (Template) | true | null | Clone khi accept invite |

### Permission Matrix

| Permission | CUSTOMER | SHOP_OWNER | SHOP_STAFF | SUPER_ADMIN |
|-----------|----------|-----------|------------|-------------|
| `VIEW_SERVICE` | ✅ | ✅ | ✅ | ✅ |
| `CREATE/UPDATE/DELETE_SERVICE` | ❌ | ✅ | ❌ | ✅ |
| `VIEW_COMBO` | ✅ | ✅ | ✅ | ✅ |
| `CREATE/UPDATE/DELETE_COMBO` | ❌ | ✅ | ❌ | ✅ |
| `CREATE_APPOINTMENT` | ✅ | ❌* | ❌* | ✅ |
| `VIEW_APPOINTMENT` | ✅(own) | ✅(shop) | ✅(shop) | ✅ |
| `UPDATE_APPOINTMENT` | ❌ | ✅ | ✅ | ✅ |
| `CREATE_STORE` | ✅ | ✅ | ❌ | ✅ |
| `UPDATE_STORE` | ❌ | ✅ | ❌ | ✅ |
| `APPROVE_STORE` | ❌ | ❌ | ❌ | ✅ |
| `VIEW_STAFF_SCHEDULE` | ❌ | ✅ | ✅ | ✅ |
| `CREATE/UPDATE_STAFF_SCHEDULE` | ❌ | ✅ | ❌ | ✅ |
| `CREATE_STAFF_DAY_OFF` | ❌ | ✅ | ✅(own) | ✅ |
| `CREATE_REVIEW` | ✅(COMPLETED) | ❌ | ❌ | ✅ |
| `VIEW_USER` | ❌ | ❌ | ❌ | ✅ |
| `UPDATE_USER` | ❌ | ❌ | ❌ | ✅ |

> *`isShopMember` check ở service layer: staff/owner không thể đặt lịch tại shop của mình.

### Default Service Categories
```
Chăm sóc da (skincare) · Massage · Nail · Tóc (hair) · Waxing · Trang điểm (makeup)
```

### Super Admin Account
```
fullName: "Super Admin"
email:    admin@glowora.com
password: Admin@123456  (bcrypt hash)
status:   ACTIVE
UserRole: { roleId: SUPER_ADMIN.id, shopId: null }
```

---

## XI. Ghi chú Thiết kế Quan trọng

### 1. Time fields — String "HH:mm"
```
WorkingHour.openTime/closeTime → "08:00", "20:00"
StaffSchedule.startTime/endTime → "09:00", "18:00"

KHÔNG dùng @db.Time() vì Prisma trả về Date với date=1970-01-01
→ parse: const [h, m] = "09:00".split(':').map(Number)
→ dùng date-fns-tz để convert sang UTC khi tính slots
```

### 2. RBAC Clone Flow
```
Khi owner tạo Shop:
  1. findRole({ code: 'SHOP_OWNER', shopId: null })   // template
  2. Tạo Role mới { code: 'SHOP_OWNER', shopId: newStoreId }
  3. Copy RolePermissions từ template sang role mới
  4. Tạo UserRole { userId: owner.id, roleId: cloned.id, shopId: newStoreId }
  5. redis.del(`user:permissions:${owner.id}`)

Khi Staff accept invite:
  1. Tìm/clone Role { code: 'SHOP_STAFF', shopId: storeId }
  2. Tạo Staff record
  3. Tạo UserRole { userId, roleId: shopStaffRole.id, shopId: storeId }
  4. Update StaffInvite { staffId: staff.id, status: ACCEPTED }
  5. redis.del(`user:permissions:${user.id}`)
```

### 3. Snapshot Pattern
```
Khi tạo Appointment:
  appointment.duration = service.duration   // bất biến
  appointment.price    = service.price      // bất biến

→ Owner đổi giá sau này không ảnh hưởng appointment cũ
→ Payment.amount = appointment.price (không query service lại)
```

### 4. Race Condition — Available Slots
```
Toàn bộ check + INSERT trong prisma.$transaction():
  1. Re-check overlapping appointments ngay trong transaction
  2. Nếu slot đã bị chiếm → throw ConflictException (409)
  3. Client xử lý 409 bằng cách reload slot grid
```

### 5. VNPAY Retry
```
Mỗi payment attempt:
  vnpTxnRef = `${appointmentId}-${Date.now()}`   // unique per attempt
  → Tạo Payment record mới (appointmentId KHÔNG @unique)

Kết quả IPN "00" → cập nhật Payment đúng vnpTxnRef: status=PAID, paidAt=now
Query "đã thanh toán?": WHERE appointmentId=? AND status='PAID'
```

### 6. avgRating — Transaction
```
Sau Review create / update isVisible:
  prisma.$transaction([
    create/update review,
    UPDATE stores SET avg_rating=AVG, total_reviews=COUNT WHERE isVisible=true,
    UPDATE services SET avg_rating=AVG WHERE isVisible=true,
    UPDATE staff SET rating=AVG, total_reviews=COUNT WHERE isVisible=true (nếu có staffId),
  ])
```

### 7. Socket.IO Rooms (Phase 6)
```
Khi user kết nối:
  socket.join(`user:${userId}`)    → nhận notification cá nhân
  socket.join(`store:${storeId}`)  → nhận events của shop (nếu là staff/owner)

Redis keys:
  user:permissions:{userId}:system           → cache permission array hệ thống (CUSTOMER), TTL 5 phút
  user:permissions:{userId}:shop:{shopId}    → cache permission array theo từng shop, TTL 5 phút
  blacklist:refresh:{token}                  → logout blacklist
  online:{userId}                            → TTL 30s (heartbeat)
```

> **Lý do tách cache key theo context:**  
> Platform guard chỉ đọc `:system`; shop admin guard đọc `:shop:{shopId}`.  
> Khi invalidate: xóa theo pattern `user:permissions:{userId}:*`.  
> Tránh trộn permission của shop này vào context shop khác.
