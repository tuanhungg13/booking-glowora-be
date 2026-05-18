# Phase 4 — Booking & Quản lý Lịch hẹn (Chi tiết)

> **Prerequisite:** Phase 1 (Auth + RBAC) + Phase 2 (Store) + Phase 3 (Catalog + Staff + Schedule) hoàn chỉnh.  
> **Stack:** NestJS 11 · Prisma · MySQL · Redis · Next.js 16  
> **Đọc cùng:** `PHASE1_AUTH_PHANQUYEN.md`, `PHASE2_STORE_PHEDUYET.md`, `PHASE3_CATALOG_NHANVIEN.md`

---

## Phát hiện quan trọng trước khi bắt đầu

| Vấn đề | Mô tả | Hành động |
|--------|-------|-----------|
| Model `Appointment` hiện có nhưng thiếu field | Thiếu `duration`, `confirmedAt`, `completedAt`, `cancelledAt` | Thêm vào migration |
| Enum `AppointmentStatus` chưa rõ | Cần verify trong schema hiện tại | Thêm nếu thiếu |
| `WorkingHour.openTime` dùng `@db.Time()` | Prisma trả về Date object với date=1970-01-01 | Parse đúng khi tính slot |
| `StaffSchedule.startTime/endTime` cùng vấn đề | Giống WorkingHour | Parse đúng khi tính slot |
| Race condition khi 2 user đặt cùng slot | Check slot trong application code → không đủ an toàn | Phải re-check trong Prisma transaction |
| `Store.slotIntervalMins` vs `service.duration` | Hai khái niệm khác nhau, dễ nhầm | Xem mục 3.1 |
| Timezone | Store hoạt động theo `store.timezone` (VD: "Asia/Ho_Chi_Minh") | Dùng `date-fns-tz` để convert |

---

## Mục tiêu Phase

1. Khách đặt lịch online với flow multi-step (chọn dịch vụ → nhân viên → ngày → giờ → confirm)
2. Hệ thống tính slot trống theo realtime, đúng lịch nhân viên, đúng giờ mở cửa
3. Owner/Staff xác nhận / từ chối lịch hẹn
4. Khách hủy trước `cancelBeforeHours` giờ
5. Staff đánh dấu hoàn thành → mở khóa tính năng đánh giá (Phase 5)
6. Thông báo in-app + email log tại mỗi bước chuyển trạng thái

---

## I. Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
│  /spas/[id]/book           → Multi-step booking wizard              │
│  /appointments              → Customer: danh sách lịch của mình     │
│  /dashboard/bookings        → Owner/Staff: quản lý + actions        │
│  /dashboard/bookings/calendar → Timeline view theo ngày             │
│  /notifications             → Trang thông báo                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP
┌────────────────────────────▼────────────────────────────────────────┐
│                      NestJS — Phase 4 Modules                        │
│                                                                       │
│  SlotsController                AppointmentsController               │
│  GET /stores/:id/available-slots POST /appointments                  │
│  (Public, ACTIVE store only)     GET  /appointments/my               │
│       │                          GET  /appointments/:id              │
│       ▼                          PATCH /appointments/:id/cancel      │
│  SlotsService ◄──────────────────────────────────────────────────►  │
│    getAvailableSlots()           StoreAppointmentsController         │
│    (thuật toán phức tạp nhất)    GET  /stores/:id/appointments       │
│       │                          GET  /stores/:id/appointments/cal.  │
│       │                          PATCH /appointments/:id/confirm     │
│       │                          PATCH /appointments/:id/reject      │
│       │                          PATCH /appointments/:id/complete    │
│       │                                │                             │
│       └──────────────────────► AppointmentsService                  │
│                                  create()  ← transaction + re-check  │
│                                  confirm() / reject() / complete()   │
│                                  cancel()  ← cancelBeforeHours check │
│                                       │                              │
│                                NotificationsService                  │
│                                  createNotification()   → DB         │
│                                  sendEmail()            → console.log│
└────────────────────────────┬────────────────────────────────────────┘
                             │
               ┌─────────────┴──────────────┐
               │                            │
            MySQL 8                      Redis 7
         appointments                 (permission cache)
         notifications
```

---

## II. Database Schema — Thay đổi cần làm

### 2.1 Enums cần thêm/verify

```prisma
enum AppointmentStatus {
  PENDING      // vừa đặt, chờ xác nhận
  CONFIRMED    // đã xác nhận bởi shop
  COMPLETED    // dịch vụ đã được thực hiện xong
  REJECTED     // shop từ chối
  CANCELLED    // khách tự hủy
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
}
```

### 2.2 Sửa model `Appointment`

```prisma
model Appointment {
  id                 String            @id @default(uuid()) @db.Char(36)
  customerId         String            @map("customer_id") @db.Char(36)
  storeId            String            @map("store_id") @db.Char(36)
  serviceId          String            @map("service_id") @db.Char(36)
  staffId            String?           @map("staff_id") @db.Char(36)
  // staffId null = owner/staff belum assign; auto-fill nếu staffId dùng "any"

  scheduledAt        DateTime          @map("scheduled_at")
  // Thời điểm bắt đầu dịch vụ — lưu UTC, convert sang timezone shop khi hiển thị

  duration           Int
  // Phút — sao chép từ service.duration LÚC ĐẶT LỊCH
  // Quan trọng: không tham chiếu service.duration trực tiếp vì service có thể bị sửa sau

  status             AppointmentStatus @default(PENDING)
  notes              String?           @db.Text           // ghi chú của khách
  cancellationReason String?           @map("cancellation_reason")

  // Timestamps cho audit trail
  confirmedAt  DateTime? @map("confirmed_at")
  completedAt  DateTime? @map("completed_at")
  cancelledAt  DateTime? @map("cancelled_at")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")

  // Relations
  customer  User     @relation("CustomerAppointments", fields: [customerId], references: [id])
  store     Store    @relation(fields: [storeId], references: [id])
  service   Service  @relation(fields: [serviceId], references: [id])
  staff     Staff?   @relation(fields: [staffId], references: [id])
  payment   Payment?
  review    Review?

  @@index([customerId, status])
  @@index([storeId, status])
  @@index([staffId, scheduledAt])    // dùng cho available-slots query
  @@index([scheduledAt])
  @@map("appointments")
}
```

### 2.3 Model mới: `Notification`

```prisma
model Notification {
  id        String           @id @default(uuid()) @db.Char(36)
  userId    String           @map("user_id") @db.Char(36)
  type      NotificationType
  title     String           @db.VarChar(200)
  body      String           @db.Text
  isRead    Boolean          @default(false) @map("is_read")
  metadata  Json?
  // metadata VD: { "appointmentId": "uuid", "storeId": "uuid", "storeName": "Glowora" }

  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@index([userId, createdAt])
  @@map("notifications")
}
```

### 2.4 Sửa model `User` — thêm relation

```prisma
model User {
  // ... existing fields ...
  notifications Notification[]
}
```

### 2.5 Sửa model `Store` — thêm relation (nếu chưa có)

```prisma
model Store {
  // ... existing fields ...
  appointments Appointment[]
}
```

### 2.6 Sửa model `Staff` — thêm relation (nếu chưa có)

```prisma
model Staff {
  // ... existing fields ...
  appointments Appointment[]
}
```

---

## III. Business Logic Chi tiết

### 3.1 Thuật toán tính Available Slots

> Đây là logic phức tạp và quan trọng nhất Phase 4. Cần hiểu rõ 3 khái niệm:
> - **`slotIntervalMins`** (VD: 30): bước thời gian hiển thị cho khách — các slot cách nhau 30 phút
> - **`service.duration`** (VD: 60): thời gian thực hiện dịch vụ — mỗi slot chiếm 60 phút
> - Slot 09:00 với duration=60 → staff bận từ 09:00–10:00 → slot 09:30 bị chặn (overlap)

```
Input:
  storeId:   string
  date:      "2025-12-20"   (YYYY-MM-DD, theo timezone store)
  serviceId: string
  staffId?:  string | null  (null = bất kỳ nhân viên)

─────────────────────────────────────────────────────

Bước 1: Load & validate dữ liệu cơ bản

  service  = prisma.service.findUnique({ where: { id: serviceId, shopId: storeId, status: ACTIVE } })
  store    = prisma.store.findUnique({ where: { id: storeId, status: ACTIVE } })
  
  Validate:
    - service tồn tại và thuộc store → 404 nếu không
    - date >= today (theo timezone store) → 400 "Ngày đã qua"
    - date <= today + store.maxAdvanceDays → 400 "Vượt quá X ngày"

─────────────────────────────────────────────────────

Bước 2: Xác định ngày trong tuần & giờ mở cửa

  dayOfWeek = getDayOfWeek(date, store.timezone)
  // VD: "2025-12-20" là SATURDAY

  workingHour = prisma.workingHour.findUnique({
    where: { shopId: storeId, dayOfWeek }
  })

  Nếu không có workingHour hoặc workingHour.isClosed:
    return { date, staffSlots: [] }

  shopOpenMinutes  = workingHour.openTime.getHours()  * 60 + workingHour.openTime.getMinutes()
  shopCloseMinutes = workingHour.closeTime.getHours() * 60 + workingHour.closeTime.getMinutes()

─────────────────────────────────────────────────────

Bước 3: Lấy danh sách staff hợp lệ

  Nếu staffId được chỉ định:
    Validate staff thuộc store → 404
    Validate StaffService EXISTS WHERE staffId=? AND serviceId=? → 400 "Nhân viên không thực hiện dịch vụ này"
    qualifiedStaffIds = [staffId]
  
  Nếu không:
    qualifiedStaffIds = prisma.staffService.findMany({
      where: { serviceId },
      select: { staffId: true }
    }).map(s => s.staffId)
    
    Nếu rỗng → return { staffSlots: [] }

─────────────────────────────────────────────────────

Bước 4: Với mỗi staffId trong qualifiedStaffIds

  4a. Lấy StaffSchedule cho ngày đó:
      schedule = prisma.staffSchedule.findUnique({
        where: { staffId, dayOfWeek, isActive: true }
      })
      Nếu null → staff không làm ngày này → SKIP

  4b. Kiểm tra ngày nghỉ:
      dayOff = prisma.staffDayOff.findFirst({
        where: { staffId, date: parsedDate }
      })
      Nếu tồn tại → SKIP

  4c. Xác định cửa sổ làm việc (giao giữa giờ shop và lịch staff):
      staffStartMinutes = schedule.startTime.getHours() * 60 + schedule.startTime.getMinutes()
      staffEndMinutes   = schedule.endTime.getHours()   * 60 + schedule.endTime.getMinutes()
      
      windowStart = Math.max(shopOpenMinutes, staffStartMinutes)
      windowEnd   = Math.min(shopCloseMinutes, staffEndMinutes)
      
      Nếu windowStart >= windowEnd → SKIP

  4d. Generate tất cả slot tiềm năng:
      slots = []
      current = windowStart
      while (current + service.duration <= windowEnd):
        slots.push(current)   // phút từ 00:00 của ngày
        current += store.slotIntervalMins

  4e. Load appointments đang chiếm slot của staff trong ngày này:
      existingApts = prisma.appointment.findMany({
        where: {
          staffId,
          status: { in: [PENDING, CONFIRMED] },
          scheduledAt: {
            gte: startOfDay(date, store.timezone),
            lte: endOfDay(date, store.timezone),
          }
        },
        select: { scheduledAt: true, duration: true }
      })

  4f. Filter bỏ slot bị chặn:
      // Slot T (minutes) bị chặn bởi appointment E nếu overlap:
      //   T < (E.scheduledAt + E.duration)  → slot bắt đầu trước khi appointment kết thúc
      // AND
      //   E.scheduledAt < (T + service.duration) → appointment bắt đầu trước khi slot kết thúc

      availableSlots = slots.filter(T => {
        return !existingApts.some(E => {
          const eStart = getMinutesFromMidnight(E.scheduledAt, store.timezone)
          const eEnd   = eStart + E.duration
          const tEnd   = T + service.duration
          return T < eEnd && eStart < tEnd
        })
      })

  4g. Filter bỏ slot quá gần hiện tại:
      // Không cho đặt slot trong vòng X phút (VD: 30 phút buffer)
      nowMinutes = getMinutesFromMidnight(now, store.timezone)
      
      // Nếu date là hôm nay: chỉ lấy slot > nowMinutes + buffer
      if (isToday(date)):
        availableSlots = availableSlots.filter(T => T > nowMinutes + 30)

  4h. Convert minutes → time strings & thêm vào result:
      staffSlots.push({
        staffId,
        staffName: staff.user.fullName,
        avatarUrl: staff.user.avatarUrl,
        specialty: staff.specialty,
        availableSlots: availableSlots.map(t => formatMinutes(t))
        // formatMinutes(570) → "09:30"
      })

─────────────────────────────────────────────────────

Output:
  {
    date: "2025-12-20",
    serviceId,
    serviceDuration: 60,
    slotIntervalMins: 30,
    staffSlots: [
      {
        staffId: "uuid-A",
        staffName: "Nguyễn Thị Lan",
        availableSlots: ["09:00", "10:00", "10:30", "14:00"]
      },
      {
        staffId: "uuid-B",
        staffName: "Trần Văn Nam",
        availableSlots: ["09:00", "09:30", "11:00"]
      }
    ]
  }
```

### 3.2 Timezone Handling

```typescript
// Cài thư viện: npm install date-fns date-fns-tz
import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import { startOfDay, endOfDay } from 'date-fns';

// Chuyển ngày string sang start/end của ngày đó theo timezone store
function getDayBounds(dateStr: string, timezone: string) {
  const zonedDate = toZonedTime(new Date(dateStr), timezone);
  return {
    start: fromZonedTime(startOfDay(zonedDate), timezone),  // UTC
    end:   fromZonedTime(endOfDay(zonedDate),   timezone),  // UTC
  };
}

// Lấy DayOfWeek từ date string theo timezone store
function getDayOfWeek(dateStr: string, timezone: string): DayOfWeek {
  const zonedDate = toZonedTime(new Date(dateStr), timezone);
  const day = zonedDate.getDay();  // 0=Sun, 1=Mon, ...
  const map = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  return map[day] as DayOfWeek;
}

// Parse @db.Time() value từ Prisma (Date với date=1970-01-01)
function getMinutesFromTime(timeDate: Date): number {
  return timeDate.getUTCHours() * 60 + timeDate.getUTCMinutes();
}

// Format minutes → "HH:mm"
function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const m = (totalMinutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}
```

### 3.3 Luồng tạo Appointment (Race-condition safe)

```
POST /appointments
  Body: { storeId, serviceId, staffId?, scheduledAt, notes? }

─────────────────────────────────────────────────────
Pre-checks (trước transaction):
  1. [Guard] JwtAuthGuard → currentUser
  2. [Guard] PermissionsGuard → CREATE_APPOINTMENT
  3. isShopMember check (từ Phase 1):
       prisma.userRole.findFirst({ where: { userId: currentUser.id, shopId: storeId } })
       → Nếu có → 403 "Không thể đặt lịch tại cơ sở bạn đang làm việc"

  4. Load service: status=ACTIVE, shopId=storeId → 404 nếu không
  5. Load store: status=ACTIVE → 404 nếu không
  6. Validate scheduledAt:
       - Phải là tương lai (> now)
       - Phải <= now + maxAdvanceDays
       - Phải nằm trong giờ mở cửa shop ngày đó
       - Phải là bội số của slotIntervalMins (VD: 09:00 OK, 09:17 → 400)

  7. Xử lý staffId:
       - Nếu staffId được cung cấp:
           Validate thuộc store
           Validate có StaffService cho serviceId
           Validate không có DayOff ngày đó
           Validate có StaffSchedule ngày đó và isActive=true
       - Nếu null → auto-pick (xem bước 8 trong transaction)

─────────────────────────────────────────────────────
Transaction (atomic):

  prisma.$transaction(async (tx) => {

    // Bước 8: Auto-pick staff nếu staffId=null
    let resolvedStaffId = dto.staffId;
    if (!resolvedStaffId) {
      const qualified = await tx.staffService.findMany({
        where: { serviceId },
        include: { staff: { include: { schedules: true, dayOffs: true } } }
      });
      resolvedStaffId = findFirstAvailableStaff(qualified, dto.scheduledAt, service.duration);
      if (!resolvedStaffId) throw new ConflictException('Không còn nhân viên khả dụng cho slot này');
    }

    // Bước 9: Re-check slot trong transaction (chống race condition)
    const endTime = new Date(dto.scheduledAt.getTime() + service.duration * 60_000);
    const { start, end } = getDayBounds(dto.scheduledAt, store.timezone);

    const dayAppointments = await tx.appointment.findMany({
      where: {
        staffId: resolvedStaffId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        scheduledAt: { gte: start, lte: end },
      },
      select: { scheduledAt: true, duration: true }
    });

    for (const apt of dayAppointments) {
      const aptEnd = new Date(apt.scheduledAt.getTime() + apt.duration * 60_000);
      if (dto.scheduledAt < aptEnd && apt.scheduledAt < endTime) {
        throw new ConflictException('Slot này vừa được đặt bởi người khác. Vui lòng chọn slot khác.');
      }
    }

    // Bước 10: Tạo appointment
    const status = store.autoConfirm ? 'CONFIRMED' : 'PENDING';
    const appointment = await tx.appointment.create({
      data: {
        customerId: currentUser.id,
        storeId: dto.storeId,
        serviceId: dto.serviceId,
        staffId: resolvedStaffId,
        scheduledAt: dto.scheduledAt,
        duration: service.duration,
        status,
        notes: dto.notes,
        confirmedAt: store.autoConfirm ? new Date() : null,
      }
    });

    return appointment;
  });

─────────────────────────────────────────────────────
Post-transaction:
  11. Gửi thông báo (bất đồng bộ — không chặn response):
        notifyAppointmentCreated(appointment, store, service, staff, customer)
        Nếu autoConfirm: notifyAppointmentConfirmed(appointment)

  12. Return 201 { appointment với include: store, service, staff.user, customer }
```

### 3.4 State Machine & Transition Rules

```
                    confirm()
         ┌──────────────────────────────────► CONFIRMED
         │                                       │
PENDING ─┤                                   complete()
         │                                       │
         ├──── reject(reason) ─────────► REJECTED ▼
         │                                   COMPLETED
         └── cancel(reason) ──────────► CANCELLED

CONFIRMED ─── cancel(reason, customer) ──► CANCELLED  (chỉ trước cancelBeforeHours)
CONFIRMED ─── complete() ─────────────► COMPLETED
```

| Transition | Actor | From Status | Điều kiện |
|-----------|-------|-------------|-----------|
| `confirm` | Owner / Staff của shop | PENDING | — |
| `reject` | Owner / Staff | PENDING | reason bắt buộc |
| `complete` | Owner / Staff | CONFIRMED | — |
| `cancel` | Customer chính chủ | PENDING, CONFIRMED | scheduledAt > now + cancelBeforeHours |

**Validate actor khi confirm/reject/complete:**
```typescript
// User phải có UserRole trong shop của appointment
const userRole = await prisma.userRole.findFirst({
  where: { userId: currentUser.id, shopId: appointment.storeId }
});
if (!userRole) throw new ForbiddenException('Bạn không phải nhân viên của cơ sở này');
```

**Validate cancel:**
```typescript
async cancel(id, userId, reason?) {
  const apt = await prisma.appointment.findUnique({ where: { id } });
  if (apt.customerId !== userId) throw new ForbiddenException();
  if (!['PENDING','CONFIRMED'].includes(apt.status))
    throw new BadRequestException('Không thể hủy ở trạng thái này');

  const store = await prisma.store.findUnique({ where: { id: apt.storeId } });
  const deadline = new Date(apt.scheduledAt.getTime() - store.cancelBeforeHours * 3_600_000);
  if (new Date() > deadline)
    throw new BadRequestException(`Chỉ được hủy trước ${store.cancelBeforeHours} giờ`);

  return prisma.appointment.update({
    where: { id },
    data: { status: 'CANCELLED', cancellationReason: reason, cancelledAt: new Date() }
  });
}
```

### 3.5 Notification Service

```typescript
// Phase 4: gửi email = console.log (Phase 6: SMTP thật)

class NotificationsService {

  async create(userId: string, type: NotificationType, title: string, body: string, metadata?: object) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, isRead: false, metadata }
    });
  }

  async notifyAppointmentCreated(apt: Appointment, store: Store, service: Service, customer: User) {
    // In-app: cho owner của shop
    const ownerUserRole = await this.prisma.userRole.findFirst({
      where: { shopId: apt.storeId, role: { code: 'SHOP_OWNER' } },
      include: { user: true }
    });
    if (ownerUserRole) {
      await this.create(ownerUserRole.userId, 'APPOINTMENT_CREATED',
        `Lịch hẹn mới tại ${store.name}`,
        `${customer.fullName} đã đặt dịch vụ ${service.name} vào ${formatDate(apt.scheduledAt)}`,
        { appointmentId: apt.id, storeId: apt.storeId }
      );
    }

    // In-app + email: cho customer
    await this.create(apt.customerId, 'APPOINTMENT_CREATED',
      'Đặt lịch thành công',
      `Lịch hẹn dịch vụ ${service.name} tại ${store.name} vào ${formatDate(apt.scheduledAt)} đang chờ xác nhận.`,
      { appointmentId: apt.id }
    );

    console.log(`[EMAIL] To: ${customer.email} | Subject: Xác nhận đặt lịch tại ${store.name}`);
  }

  // Tương tự cho: notifyConfirmed, notifyRejected, notifyCompleted, notifyCancelled
}
```

**Template nội dung email theo từng sự kiện:**

| Sự kiện | Gửi cho | Subject | Body chính |
|---------|---------|---------|-----------|
| CREATED | Customer | "Đặt lịch thành công tại [shop]" | Chi tiết lịch hẹn, trạng thái "đang chờ xác nhận" |
| CREATED | Owner | "Có lịch hẹn mới" | Tên khách, dịch vụ, thời gian, nút confirm |
| CONFIRMED | Customer | "Lịch hẹn đã được xác nhận" | Reminder: đến đúng giờ |
| REJECTED | Customer | "Lịch hẹn chưa được xác nhận" | Lý do từ chối, link đặt lại |
| COMPLETED | Customer | "Cảm ơn bạn đã sử dụng dịch vụ" | Link đánh giá (Phase 5) |
| CANCELLED | Owner | "Khách đã hủy lịch hẹn" | Tên khách, dịch vụ, lý do |

---

## IV. API Endpoints

### Available Slots

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/stores/:storeId/available-slots` | Public (store ACTIVE) | Tính slot trống |

Query: `date` (required), `serviceId` (required), `staffId` (optional)

### Appointments — Customer

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `POST` | `/appointments` | JWT + `CREATE_APPOINTMENT` | Đặt lịch mới |
| `GET` | `/appointments/my` | JWT | Lịch hẹn của bản thân |
| `GET` | `/appointments/:id` | JWT | Chi tiết 1 lịch hẹn |
| `PATCH` | `/appointments/:id/cancel` | JWT (customer chính chủ) | Hủy lịch |

### Appointments — Owner / Staff

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/stores/:storeId/appointments` | JWT + shop member | Danh sách lịch của shop |
| `GET` | `/stores/:storeId/appointments/calendar` | JWT + shop member | Dữ liệu calendar theo tháng |
| `PATCH` | `/appointments/:id/confirm` | JWT + shop member | Xác nhận |
| `PATCH` | `/appointments/:id/reject` | JWT + shop member | Từ chối + lý do |
| `PATCH` | `/appointments/:id/complete` | JWT + shop member | Đánh dấu hoàn thành |

### Notifications

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/notifications/my` | JWT | Danh sách thông báo của mình |
| `GET` | `/notifications/my/unread-count` | JWT | Số thông báo chưa đọc (dùng cho badge) |
| `PATCH` | `/notifications/:id/read` | JWT | Đánh dấu đã đọc |
| `PATCH` | `/notifications/read-all` | JWT | Đánh dấu tất cả đã đọc |

---

## V. DTOs

### `CreateAppointmentDto`

```typescript
export class CreateAppointmentDto {
  @IsUUID()
  storeId: string;

  @IsUUID()
  serviceId: string;

  @IsOptional() @IsUUID()
  staffId?: string;
  // null = bất kỳ nhân viên nào; backend tự pick

  @IsISO8601()
  scheduledAt: string;
  // ISO 8601 đầy đủ: "2025-12-20T09:00:00+07:00"

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}
```

### `RejectAppointmentDto`

```typescript
export class RejectAppointmentDto {
  @IsString() @MinLength(5) @MaxLength(500)
  reason: string;
}
```

### `CancelAppointmentDto`

```typescript
export class CancelAppointmentDto {
  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}
```

### `AvailableSlotsQueryDto`

```typescript
export class AvailableSlotsQueryDto {
  @IsDateString()
  date: string;  // "2025-12-20"

  @IsUUID()
  serviceId: string;

  @IsOptional() @IsUUID()
  staffId?: string;
}
```

### `AppointmentFilterDto` (cho Owner/Staff)

```typescript
export class AppointmentFilterDto {
  @IsOptional() @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional() @IsDateString()
  date?: string;  // lọc theo ngày cụ thể

  @IsOptional() @IsDateString()
  from?: string;

  @IsOptional() @IsDateString()
  to?: string;

  @IsOptional() @IsUUID()
  staffId?: string;

  @IsOptional() @IsString()
  search?: string;  // tìm theo tên khách

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @IsOptional() @IsInt() @Min(1) @Max(50) @Type(() => Number)
  limit?: number;
}
```

### `CalendarQueryDto`

```typescript
export class CalendarQueryDto {
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month: string;  // "2025-12"
}
```

---

## VI. Cấu trúc thư mục

```
src/features/
└── booking/
    ├── slots/
    │   ├── slots.module.ts
    │   ├── slots.controller.ts        ← GET /stores/:storeId/available-slots
    │   ├── slots.service.ts           ← Toàn bộ thuật toán tính slot
    │   └── dto/
    │       └── available-slots-query.dto.ts
    │
    ├── appointments/
    │   ├── appointments.module.ts
    │   ├── appointments.controller.ts ← Customer routes
    │   ├── store-appointments.controller.ts ← Owner/Staff routes
    │   ├── appointments.service.ts    ← Tất cả business logic
    │   └── dto/
    │       ├── create-appointment.dto.ts
    │       ├── reject-appointment.dto.ts
    │       ├── cancel-appointment.dto.ts
    │       ├── appointment-filter.dto.ts
    │       └── calendar-query.dto.ts
    │
    └── notifications/                 ← Đã có skeleton, cần implement
        ├── notifications.module.ts
        ├── notifications.controller.ts
        ├── notifications.service.ts
        └── dto/
            └── notification-filter.dto.ts
```

**Lưu ý NestJS routing** — trong `appointments.controller.ts`:
```typescript
@Controller('appointments')
export class AppointmentsController {
  @Get('my')          // PHẢI đặt trước :id
  findMy() {}

  @Get(':id')
  findOne() {}

  @Patch(':id/cancel')
  cancel() {}
}

@Controller('stores/:storeId/appointments')
export class StoreAppointmentsController {
  @Get('calendar')    // PHẢI đặt trước '' (root)
  calendar() {}

  @Get()
  findAll() {}

  @Patch(':id/confirm')   // appointmentId không phải storeId
  confirm() {}
}
```

---

## VII. Permissions cần thêm / verify

```typescript
// src/common/constants/permissions.ts
APPOINTMENT: {
  CREATE:   'CREATE_APPOINTMENT',
  VIEW:     'VIEW_APPOINTMENT',
  UPDATE:   'UPDATE_APPOINTMENT',  // confirm, reject, complete
  DELETE:   'DELETE_APPOINTMENT',  // cancel (bởi customer hoặc admin)
},
NOTIFICATION: {
  VIEW: 'VIEW_NOTIFICATION',
},
```

| Permission | CUSTOMER | STAFF | SHOP_OWNER | SUPER_ADMIN |
|-----------|----------|-------|------------|-------------|
| `CREATE_APPOINTMENT` | ✅ | ❌* | ❌* | ✅ |
| `VIEW_APPOINTMENT` | ✅ (own) | ✅ (shop) | ✅ (shop) | ✅ |
| `UPDATE_APPOINTMENT` | ❌ | ✅ | ✅ | ✅ |
| `DELETE_APPOINTMENT` | ✅ (own+time) | ❌ | ✅ | ✅ |
| `VIEW_NOTIFICATION` | ✅ | ✅ | ✅ | ✅ |

*Service layer chặn bằng isShopMember check

---

## VIII. Frontend — Chi tiết

### `/spas/[id]/book` — Multi-step Booking Wizard

```
State machine (React useState hoặc zustand):
  step: 1 | 2 | 3 | 4 | 5
  selections: { serviceId, staffId, date, timeSlot, notes }

─────────────────────────────────────────
Step 1: Chọn dịch vụ
  Source: GET /stores/:storeId/services (từ Phase 3)
  
  UI: Grid cards — tên, giá, thời gian, category badge
  Select → highlight card → activate Next button

─────────────────────────────────────────
Step 2: Chọn nhân viên (optional step)
  Source: GET /stores/:storeId/staff?serviceId=xxx
  // Chỉ hiện staff có trong StaffService cho service đã chọn

  Option đầu tiên: "Nhân viên bất kỳ" (staffId = null)
  Cards: avatar, tên, specialty, rating stars

─────────────────────────────────────────
Step 3: Chọn ngày
  Component: Calendar (shadcn Calendar hoặc react-day-picker)
  
  Disable rules:
    - Ngày trong quá khứ
    - Ngày quá maxAdvanceDays
    - Ngày store đóng cửa (WorkingHour.isClosed = true)
    // Fetch WorkingHour 1 lần để biết ngày nào đóng
  
  Select ngày → bước 4

─────────────────────────────────────────
Step 4: Chọn giờ
  Trigger: GET /stores/:id/available-slots?date=&serviceId=&staffId=
  
  Loading state: Skeleton grid
  
  Nếu staffId = null → hiển thị tất cả slots unique (union của tất cả staff)
    → Group theo giờ: "09:00", "09:30", "10:00", ...
    → Khi chọn: backend tự pick staff
  
  Nếu staffId cụ thể → chỉ hiện slots của staff đó
  
  Empty state: "Không còn slot trống ngày này. Thử ngày khác?"
  
  Click slot → highlight → Next

─────────────────────────────────────────
Step 5: Xác nhận & Submit
  Summary card:
    - Dịch vụ: tên, giá, thời gian thực hiện
    - Nhân viên: avatar + tên (hoặc "Bất kỳ")
    - Thời gian: Thứ X, DD/MM/YYYY lúc HH:mm
    - Cơ sở: tên + địa chỉ

  Textarea: "Ghi chú cho cơ sở" (optional, maxLength 500)
  
  Submit → POST /appointments → Loading spinner
  
  Success:
    toast.success("Đặt lịch thành công!")
    redirect("/appointments?highlight=" + appointmentId)
  
  Error 409: "Slot vừa được đặt bởi người khác. Quay lại chọn slot mới."
    → reset về step 4, refetch slots
  
  Error 403 (isShopMember): redirect với thông báo
```

### `/appointments` — Customer: Danh sách lịch hẹn

```
Tabs: [Tất cả] [Chờ xác nhận] [Đã xác nhận] [Hoàn thành] [Bị từ chối] [Đã hủy]

Source: GET /appointments/my?status=&page=

Card layout:
  ┌────────────────────────────────────────────┐
  │ [Logo] Tên cơ sở               [PENDING]  │
  │        Địa chỉ                             │
  │                                            │
  │ Dịch vụ: Chăm sóc da cơ bản (60 phút)    │
  │ Nhân viên: Nguyễn Thị Lan                 │
  │ Thời gian: Thứ 7, 20/12/2025 lúc 09:00   │
  │ Ghi chú: ...                               │
  │                                            │
  │ [Hủy lịch]              [Xem chi tiết]    │
  └────────────────────────────────────────────┘

Status badge colors:
  PENDING   → yellow
  CONFIRMED → blue
  COMPLETED → green
  REJECTED  → red
  CANCELLED → gray

Nút "Hủy lịch":
  - Hiển thị khi status = PENDING hoặc CONFIRMED
  - Disable khi scheduledAt - now < cancelBeforeHours (tính từ API)
  - Click → Dialog confirm có textarea lý do → PATCH /appointments/:id/cancel

Nút "Đánh giá" (Phase 5):
  - Hiển thị khi status = COMPLETED và chưa có review
```

### `/dashboard/bookings` — Owner/Staff: Quản lý

```
Filter bar:
  [Tất cả status ▼]  [Nhân viên ▼]  [Ngày: DD/MM/YYYY]  [Tìm tên khách...]

Table columns:
  Khách | Dịch vụ | Nhân viên | Ngày giờ | Trạng thái | Actions

Row actions:
  PENDING   → [✓ Xác nhận] [✗ Từ chối]
  CONFIRMED → [✓ Hoàn thành]
  * → [Xem chi tiết]

Dialog "Xác nhận": "Xác nhận lịch hẹn của [tên khách]?" → PATCH confirm
Dialog "Từ chối":  Textarea lý do (required) → PATCH reject
Dialog "Hoàn thành": "Đánh dấu dịch vụ đã hoàn thành?" → PATCH complete

Pagination: 20 records/page
Real-time update: refetch mỗi 30s hoặc khi focus tab (Phase 6: WebSocket)
```

### `/dashboard/bookings/calendar` — Timeline View

```
Navigation: [← Hôm qua] [Hôm nay] [Ngày mai →]  [chọn ngày]

Source: GET /stores/:id/appointments?date=2025-12-20&limit=100

Layout: CSS Grid
  - Columns: mỗi nhân viên 1 cột
  - Rows: từng giờ trong ngày (mỗi row = 30 phút)

Appointment block:
  - Chiều cao tỷ lệ với duration
  - Màu theo status: PENDING=yellow, CONFIRMED=blue, COMPLETED=green
  - Hover: tooltip với tên khách + dịch vụ
  - Click: slide-over panel với chi tiết + actions

Empty day: "Không có lịch hẹn nào"

Thư viện đề xuất: react-big-calendar hoặc tự dựng với CSS Grid
```

### Notification Bell (Header)

```
Component: <NotificationBell />
  - Source: GET /notifications/my/unread-count (poll mỗi 60s)
  - Badge: số unread (ẩn nếu = 0)
  - Click → Dropdown hiện 5 notification gần nhất
  - "Xem tất cả" → /notifications
  - "Đọc hết" → PATCH /notifications/read-all
```

---

## IX. Thứ tự Implement

### Bước 1 — Schema (bắt buộc trước)

- [ ] Verify model `Appointment`: thêm `duration`, `confirmedAt`, `completedAt`, `cancelledAt` nếu thiếu
- [ ] Thêm/verify enum `AppointmentStatus`
- [ ] Thêm model `Notification` + enum `NotificationType`
- [ ] Sửa `User`: thêm `notifications Notification[]`
- [ ] Sửa `Store`, `Staff`: thêm `appointments Appointment[]` nếu thiếu
- [ ] `prisma migrate dev --name phase4_booking_notifications`
- [ ] `prisma generate`

### Bước 2 — Slots Service (phần khó nhất)

- [ ] Cài `date-fns` + `date-fns-tz`: `npm install date-fns date-fns-tz`
- [ ] Tạo `slots/slots.service.ts`:
  - Helper functions: `getDayOfWeek()`, `getDayBounds()`, `getMinutesFromTime()`, `formatMinutes()`
  - `getAvailableSlots(storeId, date, serviceId, staffId?)` — full algorithm
- [ ] Tạo `slots/slots.controller.ts`: `GET /stores/:storeId/available-slots`
- [ ] Swagger annotations

### Bước 3 — Appointments Service

- [ ] `appointments.service.ts`:
  - `create(dto, currentUserId)` — transaction + race-condition safe + isShopMember check
  - `findMyAppointments(userId, filter)` — customer view
  - `findOne(id, userId)` — customer xem detail (check ownership hoặc shop member)
  - `findStoreAppointments(storeId, filter, userId)` — owner/staff view
  - `findCalendar(storeId, month, userId)` — calendar data
  - `confirm(id, userId)` — PENDING → CONFIRMED
  - `reject(id, userId, reason)` — PENDING → REJECTED
  - `complete(id, userId)` — CONFIRMED → COMPLETED
  - `cancel(id, userId, reason?)` — cancelBeforeHours check
- [ ] Helpers: `checkShopMemberAccess()`, `checkCustomerOwnership()`

### Bước 4 — Controllers

- [ ] `appointments.controller.ts` — Customer routes (đặt `my` trước `:id`)
- [ ] `store-appointments.controller.ts` — Owner/Staff routes (đặt `calendar` trước root)
- [ ] Tất cả Swagger annotations + @ApiTags

### Bước 5 — Notifications Service

- [ ] `notifications.service.ts`:
  - `create(userId, type, title, body, metadata?)`
  - `sendEmail(to, subject, templateData)` → Phase 4: `console.log`
  - `notifyAppointmentCreated/Confirmed/Rejected/Completed/Cancelled(appointment)`
- [ ] `notifications.controller.ts`: GET /my, GET /my/unread-count, PATCH read/read-all
- [ ] Kết nối notifications vào appointments.service.ts sau mỗi transition

### Bước 6 — Permissions & Seed

- [ ] Thêm `APPOINTMENT.*`, `NOTIFICATION.*` vào `permissions.ts`
- [ ] Cập nhật `ALL_PERMISSION_CODES`
- [ ] Cập nhật seed: INSERT permissions mới + gán đúng cho từng role

### Bước 7 — Frontend

- [ ] `lib/appointments.api.ts` — tất cả API calls
- [ ] `lib/slots.api.ts` — getAvailableSlots
- [ ] `lib/notifications.api.ts` — getMyNotifications, markRead, getUnreadCount
- [ ] Component `<BookingWizard />` (dùng trong `/spas/[id]/book`):
  - Step components: ServiceSelector, StaffSelector, DatePicker, SlotPicker, ConfirmForm
  - State management: React Context hoặc zustand
- [ ] `app/(customer)/appointments/page.tsx` — danh sách với tabs
- [ ] `app/(customer)/appointments/[id]/page.tsx` — detail page
- [ ] `app/dashboard/bookings/page.tsx` — management table
- [ ] `app/dashboard/bookings/calendar/page.tsx` — timeline view
- [ ] Component `<NotificationBell />` — thêm vào Navbar

---

## X. Test Cases End-to-End

```bash
# 1. Xem slot trống ngày thường
GET /stores/:id/available-slots?date=2025-12-20&serviceId=xxx
→ 200, { staffSlots: [{staffId, staffName, availableSlots: ["09:00","10:00"]}] }

# 2. Xem slot ngày store đóng cửa
GET /stores/:id/available-slots?date=2025-12-21(Chủ nhật)&serviceId=xxx
→ 200, { staffSlots: [] }

# 3. Xem slot ngày nhân viên nghỉ
# (tất cả staff đều có dayOff ngày đó)
→ 200, { staffSlots: [] }

# 4. Đặt lịch thành công
POST /appointments { storeId, serviceId, staffId, scheduledAt: "2025-12-20T09:00:00+07:00" }
→ 201, { id, status: "PENDING", scheduledAt, ... }

# 5. Race condition: đặt slot vừa bị chiếm
POST /appointments { ...same slot... }  (trong ~100ms sau request #4)
→ 409 "Slot này vừa được đặt"

# 6. Slot mới không còn xuất hiện sau khi đặt
GET /stores/:id/available-slots?date=2025-12-20&serviceId=xxx&staffId=xxx
→ 200, availableSlots không có "09:00" nữa

# 7. Staff cố đặt lịch shop mình làm
POST /appointments { storeId: "shop-where-i-work", ... }  [staffToken]
→ 403 "Không thể đặt lịch tại cơ sở bạn đang làm việc"

# 8. Owner xác nhận lịch
PATCH /appointments/:id/confirm  [ownerToken]
→ 200, { status: "CONFIRMED", confirmedAt: "..." }

# 9. Customer xem lịch của mình
GET /appointments/my  [customerToken]
→ 200, [{ id, status: "CONFIRMED", store: { name }, service: { name } }]

# 10. Staff xác nhận hoàn thành
PATCH /appointments/:id/complete  [staffToken]
→ 200, { status: "COMPLETED", completedAt: "..." }

# 11. Customer hủy sớm (trong giờ cho phép)
PATCH /appointments/:id/cancel { reason: "Bận đột xuất" }  [customerToken]
→ 200, { status: "CANCELLED" }

# 12. Customer hủy trễ (quá cancelBeforeHours)
PATCH /appointments/:id/cancel  (scheduledAt còn 1 tiếng, cancelBeforeHours=2)
→ 400 "Chỉ được hủy trước 2 giờ"

# 13. Đặt lịch ngày quá xa
POST /appointments { scheduledAt: "2026-06-01..." }  (maxAdvanceDays=30)
→ 400 "Vượt quá số ngày đặt trước tối đa"

# 14. Owner xem calendar
GET /stores/:id/appointments/calendar?month=2025-12  [ownerToken]
→ 200, [{ id, scheduledAt, duration, status, staff, customer, service }]
→ Frontend group theo ngày

# 15. Unread notifications sau khi đặt lịch
GET /notifications/my/unread-count  [ownerToken]
→ 200, { count: 1 }
GET /notifications/my  [ownerToken]
→ 200, [{ type: "APPOINTMENT_CREATED", title: "Có lịch hẹn mới", isRead: false }]
```

---

## XI. Rủi ro & Lưu ý

| Vấn đề | Giải pháp |
|--------|----------|
| **Race condition** khi 2 người đặt cùng slot | Re-check trong `prisma.$transaction` — không dựa vào cache hoặc check trước transaction |
| **Timezone bug**: `date-fns` mặc định dùng local system timezone | Luôn dùng `date-fns-tz` với explicit timezone; server deploy UTC |
| **`@db.Time()` parsing**: Prisma trả về Date với year=1970 | Parse bằng `.getUTCHours()` và `.getUTCMinutes()` (không phải `.getHours()`) |
| **`slotIntervalMins` vs `service.duration`** dễ nhầm | Document rõ: `slotIntervalMins` = bước hiển thị; `duration` = thời gian chiếm |
| **Route conflict**: `GET /appointments/my` vs `GET /appointments/:id` | Đặt `my` trước `:id` trong controller class |
| **Route conflict**: `GET /stores/:id/appointments/calendar` vs root | Đặt `calendar` trước `@Get()` root route |
| **auto-pick staff** khi staffId=null nhưng không có ai available | Return 409 kèm suggestion "Chọn ngày khác" |
| **Appointment.duration** vs **service.duration** không đồng bộ | Phase 4 luôn dùng `appointment.duration` (snapshot lúc đặt); không re-query service.duration |
| **Notification flood** khi có nhiều transitions | Phase 4 MVP: OK; Phase 6: dùng Bull queue để async |
| **Calendar với nhiều nhân viên** (>10 staff) | Pagination theo staff, horizontal scroll; tối đa hiển thị 7 cột |
| **cancelBeforeHours = 0** | Edge case: không hạn chế hủy → cho phép hủy bất kỳ lúc nào (< scheduledAt) |
| **autoConfirm = true** | Khi tạo appointment: status=CONFIRMED ngay, gửi email confirmed, không gửi email pending |
| **Staff null trong appointment** | Xảy ra khi auto-pick thất bại → owner phải assign thủ công qua PATCH |
| **Prisma không hỗ trợ native overlap query** | Check overlap trong code (load appointments trong ngày rồi iterate) — với quy mô MVP, đủ hiệu năng |

---

## XII. Phụ thuộc và Checklist trước khi bắt đầu

Trước khi code Phase 4, verify Phase 3 đã có:

- [ ] `WorkingHour` table đã có dữ liệu (Phase 2 tạo store → Phase 3 seeded default hours)
- [ ] `StaffSchedule` table có ít nhất 1 nhân viên đã được set lịch
- [ ] `StaffService` table có ít nhất 1 mapping (nhân viên có thể làm 1 dịch vụ)
- [ ] `Service` table có ít nhất 1 dịch vụ với `status=ACTIVE`
- [ ] `Store.slotIntervalMins`, `cancelBeforeHours`, `maxAdvanceDays`, `autoConfirm`, `timezone` đã có giá trị

Nếu thiếu bất kỳ điều kiện nào → Phase 4 không test được end-to-end.
