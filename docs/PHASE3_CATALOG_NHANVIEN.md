# Phase 3 — Catalog Dịch vụ & Nhân viên (Chi tiết)

> **Prerequisite:** Phase 1 (Auth + RBAC) + Phase 2 (Store + phê duyệt) hoàn chỉnh.  
> **Stack:** NestJS 11 · Prisma · MySQL · Redis  
> **Đọc cùng:** `PHASE1_AUTH_PHANQUYEN.md`, `PHASE2_STORE_PHEDUYET.md`

---

## Phát hiện quan trọng: Code đã đi trước Schema

Hầu hết service files trong Phase 3 **đã được viết sẵn** nhưng tham chiếu các model/field **chưa tồn tại** trong `prisma/schema.prisma`. Đây là việc cần giải quyết trước tiên, trước khi chạy bất kỳ migration nào.

### Ma trận mismatch

| Service file | Prisma model đang dùng | Tình trạng trong schema |
|---|---|---|
| `services.service.ts` | `prisma.service.shopId` | ❌ schema dùng `storeId` |
| `services.service.ts` | `service.duration` | ❌ schema dùng `durationMinutes` |
| `services.service.ts` | `service.costPrice` | ❌ field không tồn tại |
| `services.service.ts` | `ServiceStatus` enum | ❌ enum không tồn tại |
| `services.service.ts` | `staffServices` relation | ❌ model `StaffService` không tồn tại |
| `combos.service.ts` | `prisma.combo` | ❌ model `Combo` không tồn tại |
| `combos.service.ts` | `ComboStatus` enum | ❌ không tồn tại |
| `combos.service.ts` | `ComboItem` model | ❌ không tồn tại |
| `staff-schedule.service.ts` | `prisma.staffSchedule` | ❌ không tồn tại (có `WorkingSchedule` nhưng dùng `workDate` kiểu Date, khác hoàn toàn) |
| `staff-schedule.service.ts` | `DayOfWeek` enum | ❌ enum không tồn tại |
| `working-hour.service.ts` | `prisma.workingHour` | ❌ model `WorkingHour` không tồn tại |
| `working-hour.service.ts` | `DayOfWeek` enum | ❌ enum không tồn tại |
| `staff-day-off.service.ts` | `prisma.staffDayOff` | ❌ model `StaffDayOff` không tồn tại |
| `categories.service.ts` | `category.shopId` trong DTO | ❌ `ServiceCategory` không có `shopId` — đây là **logic bug** |
| `staff-schedule.service.ts` | `staff.fullName`, `staff.email` | ❌ Staff không có các field này, phải đi qua `staff.user` |

---

## Mục tiêu Phase

1. **Catalog:** Owner tạo/quản lý dịch vụ và combo cho shop của mình
2. **Category:** Super Admin quản lý danh mục hệ thống (Skincare, Massage, Nail, ...)
3. **Staff:** Owner mời nhân viên qua email, gán dịch vụ cho nhân viên
4. **Schedule:** Nhân viên có lịch làm việc theo tuần + đăng ký ngày nghỉ
5. **Toàn bộ** đã có skeleton code → chủ yếu là: sửa schema + align logic + gắn route đúng

---

## I. Kiến trúc tổng quan

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                  │
│  /dashboard/services   /dashboard/staff   /spas/[id]                 │
└──────────────────┬───────────────────────────────────────────────────┘
                   │ HTTP
┌──────────────────▼───────────────────────────────────────────────────┐
│                    NestJS — Phase 3 Modules                           │
│                                                                        │
│  [Public]          [Owner-scoped]              [Super Admin]           │
│  GET /categories   POST /stores/:id/services   POST /categories        │
│  GET /stores/:id   GET  /stores/:id/services   PATCH /categories/:id   │
│    (services,      PATCH /stores/:id/services/:sid                     │
│     combos,        POST /stores/:id/combos                             │
│     schedule)      POST /stores/:id/staff/invite                       │
│                    PUT  /stores/:id/staff/:sid/services                 │
│                    POST /stores/:id/staff/:sid/schedules               │
│                    POST /stores/:id/staff/:sid/day-off                  │
│                                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐  │
│  │ Catalog  │  │  Staff   │  │ Schedule │  │  StaffInvite        │  │
│  │ Module   │  │ Module   │  │ Module   │  │  (Email + Token)    │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────┬──────────┘  │
│       │              │              │                    │              │
└───────┼──────────────┼──────────────┼────────────────────┼─────────────┘
        │              │              │                    │
        ▼              ▼              ▼                    ▼
     MySQL          MySQL          MySQL              MailService
  services        staff          staff_schedules    (Phase 3: log)
  staff_services  staff_day_offs   (Phase 6: SMTP)
  combos          staff_invites  working_hours
  combo_items
```

### Quan hệ dữ liệu cốt lõi

```
Store ──< Service >── ServiceCategory   (mỗi service thuộc 1 category hệ thống)
Service ──< StaffService >── Staff       (nhân viên có thể thực hiện dịch vụ)
Store ──< Combo >── ComboItem >── Service (combo gồm nhiều service)

Store ──< WorkingHour                    (giờ mở cửa theo thứ)
Store ──< Staff ──< StaffSchedule        (lịch làm việc nhân viên theo thứ)
         Staff ──< StaffDayOff           (ngày nghỉ cụ thể)
Store ──< StaffInvite                    (lời mời chưa được chấp nhận)
```

---

## II. Database Schema — Toàn bộ thay đổi cần làm

### 2.1 Enum mới cần thêm

```prisma
// Thứ trong tuần — dùng chung cho WorkingHour và StaffSchedule
enum DayOfWeek {
  MONDAY
  TUESDAY
  WEDNESDAY
  THURSDAY
  FRIDAY
  SATURDAY
  SUNDAY
}

// Trạng thái dịch vụ
enum ServiceStatus {
  ACTIVE    // hiển thị công khai
  INACTIVE  // ẩn tạm thời (owner tắt)
}

// Trạng thái combo
enum ComboStatus {
  ACTIVE
  INACTIVE
}

// Trạng thái lời mời nhân viên
enum StaffInviteStatus {
  PENDING   // chưa chấp nhận
  ACCEPTED  // đã vào làm
  EXPIRED   // quá hạn 7 ngày
  CANCELLED // owner hủy lời mời
}
```

### 2.2 Sửa model `Service`

Hiện tại schema dùng tên field khác với service code. Phải đồng bộ:

```prisma
model Service {
  id          String        @id @default(uuid()) @db.Char(36)
  shopId      String        @map("shop_id") @db.Char(36)    // ← đổi từ storeId
  categoryId  String?       @map("category_id") @db.Char(36)
  name        String        @db.VarChar(150)
  description String?
  duration    Int           // ← đổi từ durationMinutes (phút)
  price       Decimal       @db.Decimal(12, 2)
  costPrice   Decimal?      @map("cost_price") @db.Decimal(12, 2) // ← thêm mới
  imageUrl    String?       @map("image_url")
  status      ServiceStatus @default(ACTIVE)                // ← đổi từ isVisible Boolean
  avgRating   Decimal       @default(0.00) @map("avg_rating") @db.Decimal(3, 2)
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  shop         Store            @relation(fields: [shopId], references: [id])
  category     ServiceCategory? @relation(fields: [categoryId], references: [id])
  staffServices StaffService[]     // ← thêm mới
  appointments Appointment[]
  reviews      Review[]
  comboItems   ComboItem[]         // ← thêm mới

  @@index([shopId, status])
  @@index([categoryId])
  @@map("services")
}
```

> **Lưu ý:** Đổi `storeId → shopId` sẽ phá vỡ relation với `Appointment` và `Review`. Phải update cả hai model đó (hoặc chạy migration rename column). Tuy nhiên, để nhất quán với toàn bộ service code đang dùng `shopId`, **đây là việc bắt buộc phải làm**.

### 2.3 Sửa model `ServiceCategory`

```prisma
// Giữ nguyên — đây là danh mục HỆ THỐNG, không có shopId
// DTO create-category.dto.ts hiện có shopId → cần XÓA field đó khỏi DTO

model ServiceCategory {
  id          String   @id @default(uuid()) @db.Char(36)
  name        String   @unique @db.VarChar(100)
  description String?
  iconUrl     String?  @map("icon_url")
  slug        String?  @unique @db.VarChar(120)  // ← thêm: "skincare", "massage"
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  services Service[]
  combos   Combo[]      // ← thêm relation

  @@map("service_categories")
}
```

### 2.4 Model mới: `StaffService` (join table)

```prisma
// Nhân viên có thể thực hiện dịch vụ nào — dùng trong Phase 4 để filter staff available
model StaffService {
  staffId   String @map("staff_id") @db.Char(36)
  serviceId String @map("service_id") @db.Char(36)

  staff   Staff   @relation(fields: [staffId], references: [id], onDelete: Cascade)
  service Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@id([staffId, serviceId])
  @@map("staff_services")
}
```

### 2.5 Model mới: `Combo`

```prisma
model Combo {
  id                      String      @id @default(uuid()) @db.Char(36)
  shopId                  String      @map("shop_id") @db.Char(36)
  categoryId              String?     @map("category_id") @db.Char(36)
  name                    String      @db.VarChar(150)
  description             String?
  price                   Decimal     @db.Decimal(12, 2)
  estimatedDurationMinutes Int?       @map("estimated_duration_minutes")
  // null = tự tính từ sum(service.duration * comboItem.quantity)
  imageUrl                String?     @map("image_url")
  status                  ComboStatus @default(ACTIVE)
  createdAt               DateTime    @default(now()) @map("created_at")
  updatedAt               DateTime    @updatedAt @map("updated_at")

  shop     Store           @relation(fields: [shopId], references: [id])
  category ServiceCategory? @relation(fields: [categoryId], references: [id])
  items    ComboItem[]

  @@index([shopId, status])
  @@map("combos")
}
```

### 2.6 Model mới: `ComboItem`

```prisma
model ComboItem {
  id        String @id @default(uuid()) @db.Char(36)
  comboId   String @map("combo_id") @db.Char(36)
  serviceId String @map("service_id") @db.Char(36)
  quantity  Int    @default(1)   // số lần dịch vụ này trong combo
  order     Int    @default(0)   // thứ tự thực hiện

  combo   Combo   @relation(fields: [comboId], references: [id], onDelete: Cascade)
  service Service @relation(fields: [serviceId], references: [id])

  @@unique([comboId, serviceId])
  @@index([comboId])
  @@map("combo_items")
}
```

### 2.7 Model mới: `WorkingHour` (giờ mở cửa shop)

```prisma
// Giờ hoạt động của shop theo từng thứ trong tuần
// Được dùng ở Phase 4 để validate slot nằm trong giờ mở cửa

model WorkingHour {
  id        String    @id @default(uuid()) @db.Char(36)
  shopId    String    @map("shop_id") @db.Char(36)
  dayOfWeek DayOfWeek @map("day_of_week")
  openTime  DateTime  @map("open_time") @db.Time()
  closeTime DateTime  @map("close_time") @db.Time()
  isClosed  Boolean   @default(false) @map("is_closed")

  shop      Store     @relation(fields: [shopId], references: [id], onDelete: Cascade)

  @@unique([shopId, dayOfWeek])
  @@index([shopId])
  @@map("working_hours")
}
```

> **Đồng bộ với Phase 2:** Phase 2 đề xuất model `StoreHour` — **đổi tên thành `WorkingHour`** cho khớp với service code hiện có (`working-hour.service.ts` dùng `prisma.workingHour`).

### 2.8 Model mới: `StaffSchedule` (lịch làm việc nhân viên theo tuần)

```prisma
// Lịch làm việc cố định theo thứ — là template để tính available slots (Phase 4)
// Phân biệt với WorkingSchedule (workDate cụ thể) đang có trong schema

model StaffSchedule {
  id        String    @id @default(uuid()) @db.Char(36)
  shopId    String    @map("shop_id") @db.Char(36)
  staffId   String    @map("staff_id") @db.Char(36)
  dayOfWeek DayOfWeek @map("day_of_week")
  startTime DateTime  @map("start_time") @db.Time()
  endTime   DateTime  @map("end_time") @db.Time()
  isActive  Boolean   @default(true) @map("is_active")
  // isActive=false: tạm thời không làm thứ này (khác với StaffDayOff)

  shop  Store @relation(fields: [shopId], references: [id])
  staff Staff @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@unique([staffId, dayOfWeek])
  @@index([shopId, dayOfWeek])
  @@map("staff_schedules")
}
```

> **Phân biệt với `WorkingSchedule` trong schema hiện tại:**
> - `WorkingSchedule` (cũ): theo `workDate` cụ thể — **không dùng trong Phase 3**; xem xét xóa hoặc giữ cho Phase 4 override thủ công
> - `StaffSchedule` (mới): theo `DayOfWeek` — template tuần lặp lại → **dùng trong Phase 3 và Phase 4**

### 2.9 Model mới: `StaffDayOff`

```prisma
// Ngày nghỉ cụ thể của nhân viên — ghi đè StaffSchedule cho ngày đó
model StaffDayOff {
  id      String   @id @default(uuid()) @db.Char(36)
  shopId  String   @map("shop_id") @db.Char(36)
  staffId String   @map("staff_id") @db.Char(36)
  date    DateTime @map("date") @db.Date
  reason  String?

  shop  Store @relation(fields: [shopId], references: [id])
  staff Staff @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@unique([staffId, date])   // mỗi nhân viên chỉ 1 record nghỉ/ngày
  @@index([shopId, date])
  @@map("staff_day_offs")
}
```

### 2.10 Model mới: `StaffInvite`

```prisma
model StaffInvite {
  id        String            @id @default(uuid()) @db.Char(36)
  storeId   String            @map("store_id") @db.Char(36)
  email     String            @db.VarChar(150)  // email người được mời
  token     String            @unique @db.VarChar(200)
  status    StaffInviteStatus @default(PENDING)
  expiresAt DateTime          @map("expires_at")  // token có hiệu lực 7 ngày
  createdAt DateTime          @default(now()) @map("created_at")

  store     Store             @relation(fields: [storeId], references: [id])

  @@index([email])
  @@index([token])
  @@map("staff_invites")
}
```

### 2.11 Sửa model `Staff` — thêm các relations mới

```prisma
model Staff {
  // ... giữ các field hiện có (userId, storeId, specialty, bio, rating, ...) ...

  // Thêm relations:
  schedules  StaffSchedule[]
  dayOffs    StaffDayOff[]
  services   StaffService[]
}
```

### 2.12 Sửa model `Store` — thêm relations mới

```prisma
model Store {
  // ... giữ các field hiện có ...

  // Thêm:
  workingHours WorkingHour[]
  combos       Combo[]
  staffInvites StaffInvite[]
}
```

### 2.13 Xử lý `staff-schedule.service.ts` — bug tên field

Code hiện tại:
```typescript
// BUG: Staff không có fullName/email trực tiếp, phải qua user relation
staff: { select: { id: true, fullName: true, email: true } }
```

Phải sửa thành:
```typescript
staff: {
  include: {
    user: { select: { id: true, fullName: true, email: true, phone: true } }
  }
}
```

---

## III. Business Logic Chi tiết

### 3.1 ServiceCategory — Danh mục hệ thống

**Ai quản lý:** Chỉ `SUPER_ADMIN`  
**Ai xem:** Tất cả (public, không cần token)

```
Logic tạo category:
  1. Check name unique (global — không theo shop)
  2. Auto-generate slug từ name: "Chăm sóc da" → "cham-soc-da"
  3. Lưu vào DB
  → Response: { id, name, slug, iconUrl }

Logic lấy categories (public):
  GET /categories
  → Trả tất cả categories + _count services (tổng dịch vụ thuộc category này, trên toàn hệ thống)
  → Dùng để hiển thị filter trên /spas
```

**Bug cần sửa:** `create-category.dto.ts` đang có `shopId` field → **xóa đi**, category là system-level.

### 3.2 Service — Dịch vụ của shop

**Route mới:** `/stores/:storeId/services` (thay vì `/services`)

**Owner — tạo dịch vụ:**
```
POST /stores/:storeId/services
  1. Guard: JWT + shopId từ URL phải khớp UserRole của currentUser
  2. Validate: categoryId phải tồn tại (system category)
  3. Tạo Service { shopId, name, duration, price, costPrice, status: ACTIVE, categoryId }
  4. Return service với category + staffs included
```

**Toggle ẩn/hiện dịch vụ:**
```
PATCH /stores/:storeId/services/:id
  Body: { status: "INACTIVE" }  // hoặc "ACTIVE"
  → Cập nhật status
  → Service INACTIVE không hiện trên public listing
  → Nhưng appointment đã đặt với service này vẫn giữ nguyên
```

**Xóa dịch vụ — soft logic:**
```
DELETE /stores/:storeId/services/:id
  1. Kiểm tra service có appointment PENDING/CONFIRMED không
     → Nếu có: 409 "Không thể xóa dịch vụ đang có lịch hẹn chờ xử lý"
  2. Nếu không: status = INACTIVE (soft delete — không xóa thật)
     → Giữ lại để lịch sử appointments vẫn hiển thị đúng dịch vụ
  // Hard delete chỉ khi không có appointment nào liên quan
```

**Public — xem dịch vụ của shop:**
```
GET /stores/:storeId/services
  → Chỉ trả về status=ACTIVE
  → Include: category
  → Filter: categoryId (optional)
  → Order: name ASC hoặc price ASC/DESC
```

**Gán nhân viên cho dịch vụ:**
```
PUT /stores/:storeId/services/:serviceId/staff
  Body: { staffIds: string[] }
  1. Validate: tất cả staffIds phải thuộc storeId
  2. Xóa toàn bộ StaffService cũ của service này
  3. Tạo StaffService mới
  → Response: service với danh sách staff có thể thực hiện
```

### 3.3 Combo — Gói dịch vụ

**Route mới:** `/stores/:storeId/combos`

**Logic tạo combo:**
```
POST /stores/:storeId/combos
  Body: { name, description, price, estimatedDurationMinutes?, categoryId?, serviceIds }
  1. Validate: tất cả serviceIds phải thuộc storeId và status=ACTIVE
  2. Nếu estimatedDurationMinutes null → tự tính:
       sum(service.duration * comboItem.quantity) cho tất cả items
  3. Tạo Combo + ComboItem records (có order để sắp xếp thứ tự thực hiện)
  4. Return combo với items + từng service detail

Ví dụ combo:
  "Gói Cô Dâu": giá 2.500.000đ
  - Chăm sóc da mặt (60 phút) × 1  [order=1]
  - Làm tóc cô dâu (120 phút) × 1  [order=2]
  - Nail tay (45 phút) × 2         [order=3]
  estimatedDuration = 60 + 120 + 45×2 = 270 phút
```

**Tính giá combo:**
```
Combo thường có giá THẤP HƠN tổng giá lẻ từng dịch vụ
  totalPriceIfSeparate = sum(service.price * quantity) = 3.000.000đ
  combo.price = 2.500.000đ  (tiết kiệm 500.000đ)

Frontend hiển thị: "Tiết kiệm 500.000đ (17%)"
Backend không tự tính — owner nhập giá combo thủ công
```

### 3.4 Staff Invite — Mời nhân viên

**Flow đầy đủ:**

```
┌─── Owner ────────────────────────────────────────────────────────────┐
│  POST /stores/:storeId/staff/invite  { email: "nv@example.com" }     │
└──────────────────────────────────────────────────────────────────────┘
         │
         ▼ StaffInviteService.invite()
  ┌──────────────────────────────────────────────────────────────┐
  │  1. Guard: Owner của store này                               │
  │  2. Check email chưa là staff của shop này                   │
  │     (User với email này đã có UserRole STAFF + shopId này?)  │
  │  3. Check chưa có invite PENDING chưa hết hạn cho email này  │
  │  4. Generate token: crypto.randomBytes(32).toString('hex')   │
  │  5. Tạo StaffInvite {                                        │
  │       storeId, email, token,                                 │
  │       status: PENDING,                                       │
  │       expiresAt: now + 7 ngày                                │
  │     }                                                        │
  │  6. Gửi email:                                               │
  │     Subject: "[Tên shop] đã mời bạn làm nhân viên"           │
  │     Body: Link /accept-invite?token={token}                  │
  │     (Phase 3: log ra console; Phase 6: SMTP thật)            │
  │  7. Return { message: "Đã gửi lời mời tới email" }           │
  └──────────────────────────────────────────────────────────────┘
         │
         ▼ (User nhận email, click link)
┌─── Frontend ─────────────────────────────────────────────────────────┐
│  GET /accept-invite?token=xxx                                         │
│    Nếu chưa login → redirect /login?redirect=/accept-invite?token=xxx │
│    Nếu đã login → gọi API                                             │
└──────────────────────────────────────────────────────────────────────┘
         │
         ▼
  POST /staff/accept-invite  { token }
  ┌──────────────────────────────────────────────────────────────┐
  │  1. Tìm StaffInvite theo token                               │
  │  2. Kiểm tra:                                                │
  │     - status === PENDING → ✅                                │
  │     - expiresAt > now → ✅ (nếu hết hạn: 410 GONE)          │
  │  3. Kiểm tra currentUser.email === invite.email              │
  │     → Nếu không khớp: 403 "Lời mời không dành cho bạn"      │
  │  4. Kiểm tra chưa phải staff của shop này                    │
  │  5. prisma.$transaction([                                    │
  │       a. Tạo Staff { userId, storeId, status: ACTIVE }       │
  │       b. Tìm/tạo shop-specific STAFF role:                   │
  │          - Tìm Role { code='STAFF', shopId=storeId }         │
  │          - Nếu chưa có → clone từ template STAFF role        │
  │       c. Tạo UserRole {                                      │
  │            userId: currentUser.id,                           │
  │            roleId: staffRole.id,                             │
  │            shopId: storeId                                   │
  │          }                                                   │
  │       d. Update StaffInvite { status: ACCEPTED }             │
  │     ])                                                       │
  │  6. Invalidate Redis cache của user này                      │
  │  7. Return { message: "Đã tham gia thành công", storeId }    │
  └──────────────────────────────────────────────────────────────┘
```

**Các edge case cần xử lý:**
- User chưa có tài khoản khi nhận invite → redirect `/register?invite=token` → sau khi register, hệ thống auto-xử lý accept
- Owner hủy invite trước khi user accept: `DELETE /stores/:storeId/staff/invites/:inviteId` → update status=CANCELLED
- Invite hết hạn: cronjob (Phase 6) hoặc check lazy khi user click link

### 3.5 Staff — Quản lý nhân viên

**Xem danh sách nhân viên:**
```
GET /stores/:storeId/staff
  → Include: user (fullName, email, phone, avatarUrl), schedules, services count
  → Filter: status (ACTIVE/INACTIVE)

Response:
  [{
    id, userId,
    user: { fullName, email, phone, avatarUrl },
    specialty, bio, rating, totalReviews, status,
    _count: { services: 3, schedules: 5 }
  }]
```

**Vô hiệu hóa nhân viên:**
```
DELETE /stores/:storeId/staff/:staffId
  1. Kiểm tra staff không có appointment PENDING/CONFIRMED nào
     → Nếu có: 409 "Nhân viên đang có lịch hẹn chờ xử lý"
  2. Update Staff { status: INACTIVE }
  3. Update UserRole { ... } — xóa shop role (hoặc giữ để history?)
     → Đề xuất: KHÔNG xóa UserRole, chỉ update Staff.status = INACTIVE
     → UserRole giữ lại để audit trail
  4. Invalidate permission cache của user đó
```

**Gán dịch vụ cho nhân viên:**
```
PUT /stores/:storeId/staff/:staffId/services
  Body: { serviceIds: string[] }
  1. Validate: serviceIds thuộc storeId và status=ACTIVE
  2. Transaction: xóa cũ + tạo mới StaffService
  3. Return staff với danh sách services mới
```

### 3.6 StaffSchedule — Lịch làm việc theo tuần

**Cài lịch cho nhân viên:**
```
POST /stores/:storeId/staff/:staffId/schedules
  Body: { dayOfWeek: "MONDAY", startTime: "09:00", endTime: "18:00" }

  1. Validate: staffId thuộc storeId
  2. Check @@unique([staffId, dayOfWeek]) — nếu đã có: 409 "Đã có lịch ngày này"
     → Dùng upsert thay thế nếu muốn ghi đè
  3. Tạo StaffSchedule

Bulk set (cho lần đầu setup):
PUT /stores/:storeId/staff/:staffId/schedules
  Body: [{ dayOfWeek, startTime, endTime, isActive }]  // 7 records
  → Transaction: deleteMany cũ + createMany mới
```

**Lấy lịch làm việc:**
```
GET /stores/:storeId/staff/:staffId/schedules
  → Trả 7 records (một per dayOfWeek)
  → Nếu chưa set → trả [] (Phase 4 sẽ coi như không available)

GET /stores/:storeId/schedules  (tổng hợp tất cả nhân viên)
  → Ma trận lịch: { MONDAY: [staff1, staff3], TUESDAY: [...], ... }
  → Dùng cho owner xem tổng quan
```

### 3.7 StaffDayOff — Ngày nghỉ

```
POST /stores/:storeId/staff/:staffId/day-off
  Body: { date: "2025-12-25", reason: "Nghỉ lễ" }

  1. Validate: date phải là tương lai (không đăng ký nghỉ ngày đã qua)
  2. Check @@unique([staffId, date]) — nếu đã nghỉ: 409
  3. Check không có appointment CONFIRMED vào ngày đó cho staff này
     → Nếu có: 409 "Nhân viên đã có lịch hẹn xác nhận vào ngày này"
     → Hoặc: cho phép đăng ký nhưng cảnh báo (warning response)
  4. Tạo StaffDayOff

GET /stores/:storeId/staff/:staffId/day-off
  Query: ?from=2025-12-01&to=2025-12-31
  → Danh sách ngày nghỉ trong tháng

DELETE /stores/:storeId/staff/:staffId/day-off/:dayOffId
  → Hủy đăng ký nghỉ (chỉ được hủy nếu date > now)
```

---

## IV. API Endpoints — Thiết kế đầy đủ

### Category (Super Admin + Public)

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/categories` | Public | Danh sách tất cả categories + service count |
| `GET` | `/categories/:id` | Public | Chi tiết category |
| `POST` | `/categories` | `CREATE_CATEGORY` | Super Admin tạo category |
| `PATCH` | `/categories/:id` | `UPDATE_CATEGORY` | Cập nhật |
| `DELETE` | `/categories/:id` | `DELETE_CATEGORY` | Xóa (nếu không có service nào) |

### Service (Owner + Public)

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/stores/:storeId/services` | Public | Danh sách services ACTIVE của shop |
| `GET` | `/stores/:storeId/services/:id` | Public | Chi tiết service |
| `POST` | `/stores/:storeId/services` | JWT + ownership | Tạo service |
| `PATCH` | `/stores/:storeId/services/:id` | JWT + ownership | Cập nhật / toggle status |
| `DELETE` | `/stores/:storeId/services/:id` | JWT + ownership | Soft delete (INACTIVE) |
| `POST` | `/stores/:storeId/services/:id/image` | JWT + ownership | Upload ảnh (Multer) |
| `PUT` | `/stores/:storeId/services/:id/staff` | JWT + ownership | Gán nhân viên cho dịch vụ |

### Combo (Owner + Public)

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/stores/:storeId/combos` | Public | Danh sách combos ACTIVE |
| `GET` | `/stores/:storeId/combos/:id` | Public | Chi tiết combo + items |
| `POST` | `/stores/:storeId/combos` | JWT + ownership | Tạo combo |
| `PATCH` | `/stores/:storeId/combos/:id` | JWT + ownership | Cập nhật |
| `DELETE` | `/stores/:storeId/combos/:id` | JWT + ownership | Xóa / ẩn |

### Staff (Owner)

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/stores/:storeId/staff` | JWT + ownership | Danh sách nhân viên |
| `GET` | `/stores/:storeId/staff/:staffId` | JWT + ownership | Chi tiết nhân viên |
| `POST` | `/stores/:storeId/staff/invite` | JWT + ownership | Gửi lời mời qua email |
| `GET` | `/stores/:storeId/staff/invites` | JWT + ownership | Danh sách lời mời |
| `DELETE` | `/stores/:storeId/staff/invites/:id` | JWT + ownership | Hủy lời mời |
| `POST` | `/staff/accept-invite` | JWT | Nhân viên chấp nhận lời mời |
| `PATCH` | `/stores/:storeId/staff/:staffId` | JWT + ownership | Cập nhật specialty, bio |
| `DELETE` | `/stores/:storeId/staff/:staffId` | JWT + ownership | Vô hiệu hóa nhân viên |
| `PUT` | `/stores/:storeId/staff/:staffId/services` | JWT + ownership | Gán dịch vụ cho nhân viên |

### StaffSchedule (Owner + Staff)

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/stores/:storeId/staff/:staffId/schedules` | JWT | Xem lịch tuần |
| `PUT` | `/stores/:storeId/staff/:staffId/schedules` | JWT + ownership | Set/ghi đè lịch tuần (bulk 7 records) |
| `PATCH` | `/stores/:storeId/staff/:staffId/schedules/:id` | JWT | Cập nhật 1 ngày cụ thể |

### StaffDayOff (Owner + Staff xem của mình)

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/stores/:storeId/staff/:staffId/day-off` | JWT | Danh sách ngày nghỉ |
| `POST` | `/stores/:storeId/staff/:staffId/day-off` | JWT | Đăng ký nghỉ |
| `DELETE` | `/stores/:storeId/staff/:staffId/day-off/:id` | JWT | Hủy nghỉ |

### WorkingHour (Owner + Public)

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/stores/:storeId/working-hours` | Public | Giờ mở cửa shop |
| `PUT` | `/stores/:storeId/working-hours` | JWT + ownership | Set giờ mở cửa (bulk 7 records) |

---

## V. DTOs cần sửa / tạo mới

### Sửa `CreateCategoryDto` — xóa `shopId`

```typescript
// TRƯỚC (sai):
export class CreateCategoryDto {
  @IsUUID() shopId!: string;   // ← XÓA
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
}

// SAU (đúng):
export class CreateCategoryDto {
  @IsString() @MinLength(2) @MaxLength(100)
  name!: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsUrl()
  iconUrl?: string;
}
```

### Sửa `CreateServiceDto` — align với schema mới

```typescript
export class CreateServiceDto {
  // Bỏ shopId — lấy từ URL param :storeId
  @IsString() @MinLength(2) @MaxLength(150)
  name!: string;

  @IsOptional() @IsString()
  description?: string;

  @IsInt() @Min(15) @Max(480)
  duration!: number;  // phút — giữ nguyên tên "duration" (schema sẽ đổi theo)

  @IsNumber() @Min(0)
  price!: number;

  @IsOptional() @IsNumber() @Min(0)
  costPrice?: number;

  @IsOptional() @IsUUID()
  categoryId?: string;  // system category

}
```

### Mới: `InviteStaffDto`

```typescript
export class InviteStaffDto {
  @IsEmail()
  email!: string;

  @IsOptional() @IsString() @MaxLength(200)
  message?: string;  // lời nhắn cá nhân kèm email mời
}
```

### Mới: `AcceptInviteDto`

```typescript
export class AcceptInviteDto {
  @IsString() @IsNotEmpty()
  token!: string;
}
```

### Mới: `SetStaffSchedulesDto` (bulk)

```typescript
class ScheduleItemDto {
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @IsString() @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;  // "09:00"

  @IsString() @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;    // "18:00"

  @IsBoolean()
  isActive!: boolean;
}

export class SetStaffSchedulesDto {
  @ValidateNested({ each: true }) @Type(() => ScheduleItemDto)
  @ArrayMaxSize(7)
  schedules!: ScheduleItemDto[];
}
```

### Sửa `CreateStaffScheduleDto` — startTime/endTime kiểu string "HH:mm"

```typescript
// TRƯỚC (sai — IsDateString() cho time):
@IsDateString() startTime!: string;

// SAU (đúng):
@IsString() @Matches(/^\d{2}:\d{2}$/)
startTime!: string;   // "09:00"

@IsString() @Matches(/^\d{2}:\d{2}$/)
endTime!: string;
```

---

## VI. Cấu trúc thư mục — Tái tổ chức

### Hiện tại (flat, cần đổi sang store-scoped)

```
src/features/
├── catalog/
│   ├── categories/    ← OK, giữ nguyên route /categories
│   ├── services/      ← đổi route → /stores/:storeId/services
│   ├── combos/        ← đổi route → /stores/:storeId/combos
└── staff/
    ├── working-hour/      ← đổi route → /stores/:storeId/working-hours
    ├── staff-schedule/    ← đổi route → /stores/:storeId/staff/:staffId/schedules
    └── staff-day-off/     ← đổi route → /stores/:storeId/staff/:staffId/day-off
```

### Cần thêm module Staff mới (invite + gán service)

```
src/features/
└── stores/
    └── staff/
        ├── staff.module.ts
        ├── staff.controller.ts    ← GET/PATCH/DELETE staff, invite endpoints
        ├── staff.service.ts
        └── dto/
            ├── invite-staff.dto.ts
            └── accept-invite.dto.ts
```

### Lưu ý về nested routing trong NestJS

```typescript
// stores.controller.ts
@Controller('stores')
export class StoresController {
  @Get(':storeId/services')
  getServices(@Param('storeId') storeId: string) { ... }

  @Post(':storeId/services')
  createService(
    @Param('storeId') storeId: string,
    @Body() dto: CreateServiceDto,
    @CurrentUser() user: UserPayload
  ) { ... }
}
```

Hoặc dùng module riêng với prefix:
```typescript
// services module được import vào stores module và mount tại /stores/:storeId/services
```

---

## VII. Business Rules tổng hợp

| Rule | Mô tả |
|------|-------|
| Service chỉ của shop ACTIVE | Owner shop PENDING/BANNED không tạo được service |
| Category là system-level | Owner không tạo category riêng, chỉ dùng category có sẵn |
| Xóa service → soft delete | status=INACTIVE, không hard delete nếu có lịch sử appointment |
| Combo chỉ chứa service cùng shop | Không ghép service của shop khác vào combo |
| Staff invite hết hạn sau 7 ngày | Token expired → user phải xin invite mới |
| Staff chỉ nhận 1 invite/shop tại 1 thời điểm | Không gửi 2 invite PENDING cùng email+shop |
| StaffDayOff không ghi đè appointment đã confirmed | Cảnh báo khi đăng ký nghỉ có appointment |
| Nhân viên chỉ thực hiện service được phân công | Khi booking, chỉ hiện staff có trong StaffService |
| Max 3 shop roles | Từ Phase 1 — khi accept invite mà đã có 3 shop roles → 400 |
| WorkingHour default khi tạo shop | Phase 2 đã tạo, Phase 3 chỉ cập nhật qua PUT |

---

## VIII. Luồng tổng hợp — Phase 4 cần gì từ Phase 3

Phase 4 (Booking) dùng trực tiếp dữ liệu từ Phase 3 để tính available slots:

```
GET /stores/:storeId/available-slots?date=2025-12-20&serviceId=xxx

Logic Phase 4 (cần Phase 3 hoàn chỉnh):
  1. Lấy service.duration (Phase 3 schema)
  2. Lấy danh sách staff có thể làm service này:
       StaffService WHERE serviceId = xxx
  3. Với mỗi staff:
     a. Lấy StaffSchedule ngày 2025-12-20 là SATURDAY
          → WHERE staffId=x AND dayOfWeek=SATURDAY AND isActive=true
     b. Check StaffDayOff ngày 2025-12-20
          → WHERE staffId=x AND date=2025-12-20 → nếu có → skip staff này
     c. Lấy WorkingHour của shop ngày SATURDAY
          → WHERE shopId=x AND dayOfWeek=SATURDAY
     d. Generate slots từ staff.startTime đến staff.endTime (step = service.duration)
     e. Loại bỏ slot ngoài giờ mở cửa shop
     f. Loại bỏ slot đã có Appointment (PENDING/CONFIRMED) cho staff này
  4. Trả về: [{ staffId, staffName, availableSlots: ["09:00", "09:30", ...] }]
```

**Kết luận:** Nếu Phase 3 chưa có `StaffService`, `StaffSchedule`, `StaffDayOff`, `WorkingHour` đầy đủ → Phase 4 không thể tính slot được.

---

## IX. Thứ tự Implement

### Bước 1 — Schema (bắt buộc làm trước)

- [ ] Thêm enums: `DayOfWeek`, `ServiceStatus`, `ComboStatus`, `StaffInviteStatus`
- [ ] Sửa model `Service`: đổi `storeId→shopId`, `durationMinutes→duration`, thêm `costPrice`, `status: ServiceStatus`
- [ ] Sửa `Appointment` + `Review`: đổi `serviceId` relation nếu bị ảnh hưởng
- [ ] Thêm model `StaffService`
- [ ] Thêm model `Combo`
- [ ] Thêm model `ComboItem`
- [ ] Thêm model `WorkingHour`
- [ ] Thêm model `StaffSchedule`
- [ ] Thêm model `StaffDayOff`
- [ ] Thêm model `StaffInvite`
- [ ] Cập nhật relations trong `Staff`, `Store`
- [ ] `prisma migrate dev --name phase3_catalog_staff`
- [ ] `prisma generate`

### Bước 2 — Sửa DTOs và Bugs

- [ ] `create-category.dto.ts`: xóa `shopId` field
- [ ] `create-service.dto.ts`: bỏ `shopId` (lấy từ URL), đổi tên field
- [ ] `create-staff-schedule.dto.ts`: sửa `startTime`/`endTime` dùng `Matches(/^\d{2}:\d{2}$/)`
- [ ] Tất cả service files: sửa `staff.fullName` → `staff.user.fullName` (trong includes)

### Bước 3 — Catalog Backend

- [ ] `categories.service.ts`: thêm slug generation, bỏ shopId logic
- [ ] `categories.controller.ts`: route `/categories` giữ nguyên; thêm Swagger
- [ ] `services.service.ts`: thêm `storeId` param, sửa field names, thêm ownership check
- [ ] `services.controller.ts`: đổi route sang `/stores/:storeId/services`; thêm `PUT /:id/staff`
- [ ] `combos.service.ts`: thêm `storeId` param, thêm `estimatedDurationMinutes` auto-calc
- [ ] `combos.controller.ts`: đổi route sang `/stores/:storeId/combos`

### Bước 4 — Staff Backend

- [ ] Tạo `staff.service.ts` mới (trong `stores/staff/`):
  - `findAll(storeId)`
  - `findOne(storeId, staffId)`
  - `update(storeId, staffId, dto)`
  - `deactivate(storeId, staffId)`
  - `assignServices(storeId, staffId, serviceIds[])`
  - `invite(storeId, email, message?)`
  - `acceptInvite(token, currentUserId)`
  - `cancelInvite(storeId, inviteId)`
- [ ] Tạo `staff.controller.ts` với tất cả routes

### Bước 5 — Schedule Backend

- [ ] `working-hour.service.ts`: đổi `shopId` filter, thêm bulk `PUT /working-hours`
- [ ] `working-hour.controller.ts`: đổi route → `/stores/:storeId/working-hours`
- [ ] `staff-schedule.service.ts`: sửa bug `staff.fullName`, thêm bulk set
- [ ] `staff-schedule.controller.ts`: đổi route → `/stores/:storeId/staff/:staffId/schedules`
- [ ] `staff-day-off.service.ts`: thêm check appointment conflict
- [ ] `staff-day-off.controller.ts`: đổi route → `/stores/:storeId/staff/:staffId/day-off`

### Bước 6 — Permissions & Seed

- [ ] Thêm `STORE_STAFF` permissions vào `permissions.ts` nếu cần
- [ ] Cập nhật `seed.sql`: gán `CREATE_STORE` cho SHOP_OWNER template

### Bước 7 — Frontend

- [ ] `lib/catalog.api.ts`: các hàm gọi services, combos, categories APIs
- [ ] `lib/staff.api.ts`: các hàm gọi staff, schedule APIs
- [ ] `/dashboard/services`: CRUD services (form tạo/sửa, toggle ẩn/hiện, gán nhân viên)
- [ ] `/dashboard/services/new`: form tạo service với upload ảnh
- [ ] `/dashboard/combos`: CRUD combos
- [ ] `/dashboard/staff`: danh sách nhân viên, form invite, toggle status
- [ ] `/dashboard/staff/[id]/schedule`: bảng lịch 7 ngày, toggle isActive
- [ ] `/dashboard/staff/[id]/day-off`: calendar đăng ký nghỉ
- [ ] `/accept-invite`: trang chấp nhận lời mời (kiểm tra token + login required)
- [ ] `/spas/[id]`: hiển thị services, combos, giờ hoạt động từ API thật

---

## X. Rủi ro & Lưu ý

| Vấn đề | Giải pháp |
|--------|----------|
| Đổi `storeId → shopId` trong Service phá vỡ Appointment + Review | Migration rename column; update tất cả relations và service code |
| `WorkingSchedule` (workDate) trong schema không dùng | Quyết định: giữ lại cho Phase 4 override thủ công, hoặc xóa migration |
| `StaffSchedule.startTime` lưu kiểu `DateTime @db.Time()` nhưng input là string "09:00" | Service phải parse: `new Date(\`1970-01-01T${dto.startTime}:00\`)` |
| Staff invite email chưa có SMTP | Phase 3: `console.log` link; Phase 6: tích hợp Nodemailer/SendGrid |
| Accept invite khi chưa đăng ký tài khoản | Frontend redirect `/register?invite=token`; sau register auto-redirect về accept |
| Xóa service đang có trong Combo | Cascade vs restrict — đề xuất: restrict (báo lỗi), yêu cầu xóa khỏi combo trước |
| Combo tính duration tự động | Khi service.duration thay đổi, combo.estimatedDurationMinutes không tự cập nhật → document rõ |
| Route `/stores/:storeId/staff/invite` conflict với `/stores/:storeId/staff/:staffId` | NestJS parse `:staffId` trước → đặt `/invite` route TRƯỚC route `:staffId` trong controller |
