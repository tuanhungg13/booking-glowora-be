# Kế hoạch Phát triển — Nền tảng Booking Spa (Glowora)

> **Đồ án Tốt nghiệp** · Stack: NestJS 11 + Prisma + MySQL + Redis · Next.js 16 + shadcn/ui  
> Tài liệu này là roadmap tổng quát. Mỗi phase sẽ được đi vào chi tiết riêng khi bắt đầu sprint.

---

## Tổng quan Kiến trúc

```
┌─────────────────────────────┐        ┌─────────────────────────────────┐
│      booking-fe              │        │      booking-business            │
│      Next.js 16              │◄──────►│      NestJS 11 · REST API        │
│      shadcn/ui + Tailwind    │  HTTP  │      JWT · RBAC · Swagger        │
└─────────────────────────────┘        └──────────────┬──────────────────┘
                                                       │
                                             ┌─────────┴────────┐
                                             │                  │
                                          MySQL 8            Redis 7
                                        (Prisma ORM)    (Permission cache,
                                                          Token blacklist)
```

---

## Vai trò Người dùng

| Role | Mô tả | Quyền chính |
|------|-------|------------|
| `CUSTOMER` | Khách hàng | Tìm kiếm, đặt lịch, thanh toán, đánh giá |
| `STAFF` | Nhân viên spa | Xem & cập nhật lịch hẹn được phân công |
| `OWNER` | Chủ cơ sở | Quản lý shop, dịch vụ, nhân viên |
| `SUPER_ADMIN` | Quản trị hệ thống | Phê duyệt/khóa shop, quản lý người dùng |

---

## Trạng thái Hiện tại

### ✅ Đã có (Backend)
- Cấu trúc modules đầy đủ: Identity, Catalog, Booking, Staff, Messaging, Notifications
- Prisma schema hoàn chỉnh với tất cả models
- Global guards: `JwtAuthGuard`, `PermissionsGuard`
- Controllers đã tạo skeleton: auth, users, roles, permissions, services, categories, combos, appointments, payments, reviews, staff-schedule, working-hour, conversations, messages, notifications
- Redis permission cache (5 phút TTL)
- Docker Compose: MySQL 8 + Redis 7

### ✅ Đã có (Frontend)
- Pages skeleton: trang chủ, danh sách spa, chi tiết spa, đặt lịch, dashboard (bookings/services/staff), chat, appointments
- UI components: shadcn/ui, TailwindCSS, dark/light mode
- Layout: Navbar, Footer, Dashboard sidebar

### ❌ Chưa có / Cần làm
- Backend: Logic nghiệp vụ bên trong các service (hầu hết còn trống), endpoint refresh/logout/me, Store module
- Frontend: Trang login/register, API client layer, auth state, tất cả trang đang dùng mock data

---

## Roadmap theo Phase

---

### PHASE 1 — Auth & Phân quyền
> **Mục tiêu:** 3 loại user đăng ký/đăng nhập được, hệ thống RBAC hoạt động end-to-end  
> **Ưu tiên:** 🔴 Cao nhất — tất cả phase sau đều phụ thuộc vào phase này

#### Backend
| Module | Việc cần làm | File |
|--------|-------------|------|
| Auth | Hoàn thiện `register` (hash password, gán role) | `identity/auth/auth.service.ts` |
| Auth | Thêm `POST /auth/refresh` — dùng refresh token lấy access token mới | `auth.controller.ts` |
| Auth | Thêm `POST /auth/logout` — blacklist refresh token trong Redis | `auth.controller.ts` |
| Auth | Thêm `GET /auth/me` — trả về thông tin user hiện tại | `auth.controller.ts` |
| Auth | Hoàn thiện JWT strategy (verify, attach user vào request) | `auth/strategies/` |
| Users | `GET /users/:id` — xem profile | `users.controller.ts` |
| Users | `PATCH /users/:id` — cập nhật profile (fullName, phone, avatar) | `users.controller.ts` |
| Roles/Permissions | Seed: CUSTOMER, STAFF, OWNER, SUPER_ADMIN roles + permission codes | `prisma/seed.sql` |

#### Frontend
| Trang/Component | Việc cần làm |
|----------------|-------------|
| `lib/api.ts` | Axios instance, base URL, auto attach Bearer token |
| `lib/api.ts` | Interceptor: tự động gọi refresh khi nhận 401 |
| `contexts/auth-context.tsx` | Lưu user state, cung cấp login/logout actions |
| `app/(auth)/login/page.tsx` | Form đăng nhập (email + password) |
| `app/(auth)/register/page.tsx` | Form đăng ký (chọn role: Khách hàng / Chủ cơ sở) |
| `middleware.ts` | Bảo vệ route: redirect nếu chưa login hoặc sai role |
| Layout | Header hiển thị tên user, nút logout khi đã đăng nhập |

---

### PHASE 2 — Quản lý Shop & Phê duyệt
> **Mục tiêu:** Owner đăng ký cơ sở → Admin phê duyệt → Public nhìn thấy trên listing  
> **Ưu tiên:** 🔴 Cao — prerequisite cho tất cả tính năng shop

#### Backend
| Module | Việc cần làm | Ghi chú |
|--------|-------------|---------|
| Store (mới) | `POST /stores` — Owner tạo shop, status mặc định `PENDING` | Cần tạo module mới |
| Store | `GET /stores` — Public: danh sách shop `ACTIVE`, có filter (name, address), pagination | |
| Store | `GET /stores/:id` — Public: chi tiết shop + services + reviews tóm tắt | |
| Store | `PATCH /stores/:id` — Owner cập nhật thông tin | Chỉ owner của shop |
| Store | `POST /stores/:id/logo` — Upload logo (Multer) | |
| Admin - Store | `GET /admin/stores` — Super Admin xem tất cả shops + filter theo status | |
| Admin - Store | `PATCH /admin/stores/:id/approve` — Phê duyệt shop (`PENDING → ACTIVE`) | |
| Admin - Store | `PATCH /admin/stores/:id/lock` — Khóa shop (`ACTIVE → BANNED`) kèm lý do | |
| Admin - Store | `PATCH /admin/stores/:id/unlock` — Mở khóa shop | |

#### Frontend
| Trang | Việc cần làm |
|-------|-------------|
| `/become-owner` | Form đăng ký cơ sở (tên, địa chỉ, SĐT, mô tả, upload logo) |
| `/dashboard/shop` | Owner: xem trạng thái shop, cập nhật thông tin |
| `/admin/stores` | Super Admin: bảng danh sách shops + filter status |
| `/admin/stores/:id` | Dialog phê duyệt / khóa (kèm textarea lý do) |
| `/spas` | Thay mock data bằng API call thật (filter, pagination) |
| `/spas/[id]` | Chi tiết spa thật từ API |

---

### PHASE 3 — Catalog Dịch vụ & Nhân viên
> **Mục tiêu:** Owner quản lý danh mục dịch vụ, thêm nhân viên và phân quyền  
> **Ưu tiên:** 🟠 Cao — cần có dịch vụ mới cho khách đặt lịch

#### Backend - Catalog
| Module | Việc cần làm |
|--------|-------------|
| ServiceCategory | `CRUD /categories` — Super Admin quản lý danh mục hệ thống (Skincare, Massage, Nail...) |
| Service | `POST /stores/:storeId/services` — Owner tạo dịch vụ (tên, mô tả, giá, thời gian, ảnh, danh mục) |
| Service | `GET /stores/:storeId/services` — Public: danh sách dịch vụ của shop |
| Service | `PATCH /stores/:storeId/services/:id` — Cập nhật, toggle ẩn/hiện |
| Service | `DELETE /stores/:storeId/services/:id` — Xóa dịch vụ |
| Service | Upload ảnh dịch vụ (Multer) |

#### Backend - Staff
| Module | Việc cần làm |
|--------|-------------|
| Staff | `POST /stores/:storeId/staff/invite` — Mời nhân viên qua email, gửi link kích hoạt |
| Staff | `GET /stores/:storeId/staff` — Danh sách nhân viên của shop |
| Staff | `PATCH /stores/:storeId/staff/:staffId` — Cập nhật specialty, bio |
| Staff | `DELETE /stores/:storeId/staff/:staffId` — Vô hiệu hóa nhân viên |
| Staff | `PUT /stores/:storeId/staff/:staffId/permissions` — Gán quyền (view bookings, manage services...) |
| WorkingSchedule | `POST /stores/:storeId/staff/:staffId/schedules` — Cài lịch làm việc theo ngày/tuần |
| WorkingSchedule | `GET /stores/:storeId/staff/:staffId/schedules` — Xem lịch làm |
| StaffDayOff | `POST /stores/:storeId/staff/:staffId/day-off` — Đăng ký ngày nghỉ |

#### Frontend
| Trang | Việc cần làm |
|-------|-------------|
| `/dashboard/services` | CRUD dịch vụ (đã có UI skeleton) — gắn API thật |
| `/dashboard/staff` | Danh sách nhân viên, invite form, bảng phân quyền |
| `/dashboard/staff/:id/schedule` | Xem/cập nhật lịch làm việc nhân viên |

---

### PHASE 4 — Booking & Quản lý Lịch hẹn
> **Mục tiêu:** Khách đặt lịch hoàn chỉnh, Owner/Staff quản lý và xác nhận  
> **Ưu tiên:** 🔴 Cao — tính năng cốt lõi của hệ thống

#### Backend
| Module | Việc cần làm | Ghi chú |
|--------|-------------|---------|
| Slots | `GET /stores/:storeId/available-slots` — Tính slot trống theo ngày, dịch vụ, nhân viên | Logic phức tạp nhất: trừ lịch đã đặt, giờ nghỉ, dayOff |
| Appointment | `POST /appointments` — Khách đặt lịch (storeId, serviceId, staffId, scheduledAt) | Kiểm tra slot còn trống |
| Appointment | `GET /appointments/my` — Khách xem lịch hẹn của mình (có filter status) | |
| Appointment | `GET /stores/:storeId/appointments` — Owner/Staff xem lịch hẹn của shop | |
| Appointment | `PATCH /appointments/:id/confirm` — Staff/Owner xác nhận | |
| Appointment | `PATCH /appointments/:id/reject` — Từ chối kèm lý do | |
| Appointment | `PATCH /appointments/:id/complete` — Đánh dấu hoàn thành (kích hoạt review) | |
| Appointment | `PATCH /appointments/:id/cancel` — Khách hủy (chỉ được hủy trước X giờ) | |
| Notification | Gửi email xác nhận khi: đặt lịch, xác nhận, từ chối, nhắc trước 24h/1h | Dùng module Notifications đã có |

#### Frontend
| Trang | Việc cần làm |
|-------|-------------|
| `/spas/[id]/book` | Flow đặt lịch multi-step: Chọn dịch vụ → Chọn nhân viên → Chọn ngày giờ → Confirm |
| `/spas/[id]` | Hiển thị nút "Đặt lịch" dẫn vào flow |
| `/appointments` | Customer: danh sách lịch hẹn, filter theo status, nút hủy |
| `/dashboard/bookings` | Owner/Staff: danh sách + filter, nút confirm/reject/complete |
| `/dashboard/bookings/calendar` | Timeline view lịch hẹn theo ngày |

---

### PHASE 5 — Thanh toán & Đánh giá
> **Mục tiêu:** Thanh toán qua VNPAY, khách đánh giá sau khi sử dụng dịch vụ  
> **Ưu tiên:** 🟠 Trung bình-cao — hoàn thiện vòng đời booking

#### Backend - Payment
| Việc cần làm | Ghi chú |
|-------------|---------|
| `POST /payments/vnpay/create` — Tạo URL thanh toán VNPAY từ appointmentId | Tích hợp VNPAY Sandbox |
| `GET /payments/vnpay/return` — Nhận redirect từ VNPAY, xác minh checksum | Cập nhật Payment + Appointment status |
| `POST /payments/vnpay/ipn` — Webhook IPN từ VNPAY (server-to-server) | Xử lý trường hợp redirect bị mất |
| `POST /payments/stripe/create-intent` — Stripe Payment Intent | Dành cho khách quốc tế (optional) |

#### Backend - Review
| Việc cần làm | Ghi chú |
|-------------|---------|
| `POST /appointments/:id/review` — Tạo đánh giá (rating 1-5, comment) | Chỉ khi appointment = `COMPLETED`, mỗi appointment chỉ review 1 lần |
| `GET /stores/:storeId/reviews` — Danh sách reviews của shop (public, có phân trang) | |
| `GET /services/:serviceId/reviews` — Reviews theo dịch vụ | |
| Auto-update `Service.avgRating` và `Staff.rating` sau mỗi review mới | Dùng Prisma transaction |

#### Frontend
| Trang | Việc cần làm |
|-------|-------------|
| `/appointments/[id]/payment` | Nút "Thanh toán ngay", chuyển hướng VNPAY |
| `/payment/result` | Trang kết quả: thành công / thất bại |
| `/appointments/[id]/review` | Form đánh giá stars + comment |
| `/spas/[id]` | Hiển thị list reviews, avgRating |

---

### PHASE 6 — Tính năng Nâng cao
> **Mục tiêu:** Trải nghiệm người dùng tốt hơn, Admin có công cụ quản lý đầy đủ  
> **Ưu tiên:** 🟡 Trung bình — làm sau khi 5 phase trên hoàn chỉnh

#### Real-time (Socket.IO — đã cài sẵn)
- Chat khách hàng ↔ shop (module Messaging đã có skeleton)
- Thông báo real-time: có lịch hẹn mới, xác nhận lịch
- Online indicator cho nhân viên

#### Admin Dashboard
- Thống kê hệ thống: tổng shops, users, appointments, doanh thu
- Quản lý users: xem danh sách, ban/unban
- Xem log hoạt động

#### Owner Analytics
- Doanh thu theo ngày/tuần/tháng (recharts đã có)
- Lịch hẹn đã hoàn thành vs hủy
- Dịch vụ/nhân viên được đặt nhiều nhất

#### Tìm kiếm Nâng cao
- Filter spa theo: vị trí (tỉnh/thành), loại dịch vụ, rating, khoảng giá
- Tìm kiếm full-text (MySQL FULLTEXT hoặc thêm Elasticsearch)
- Sort: rating, mới nhất, giá

---

## Quy tắc Phát triển

### Backend
- **Thứ tự:** DTO → Service → Controller → Swagger annotation
- Mọi route (trừ `@Public()`) bắt buộc dùng `@RequirePermissions()`
- Dùng `PrismaService` từ `src/prisma/`, không tạo Prisma client mới
- Error phải throw `HttpException` để `http-exception.filter.ts` bắt đúng format
- Đặt tên permission theo pattern: `RESOURCE.ACTION` (đã có trong `permissions.ts`)

### Frontend
- **Thứ tự:** API hook/function → Component → Page
- Mọi call API qua `lib/api.ts` (Axios instance), không dùng `fetch` trực tiếp
- Form validation bằng `react-hook-form` + `zod`
- Loading/error state phải xử lý — không để trang trắng khi đang fetch
- Protected routes dùng `middleware.ts` + layout check

### Database
- Mọi thay đổi schema phải tạo Prisma migration (`prisma migrate dev`)
- Seed data phải cập nhật khi thêm enum hoặc default data mới

---

## Sơ đồ Luồng Chính

### Luồng Đặt lịch (Happy Path)
```
Customer chọn spa
    → Chọn dịch vụ
    → Chọn nhân viên (optional)
    → GET /stores/:id/available-slots?date=...&serviceId=...
    → Chọn slot
    → POST /appointments  →  status: PENDING
    → Email xác nhận đặt lịch gửi cho customer
    → Owner/Staff nhận thông báo
    → PATCH /appointments/:id/confirm  →  status: CONFIRMED
    → Email xác nhận gửi cho customer
    → (Ngày hẹn) Nhân viên phục vụ xong
    → PATCH /appointments/:id/complete  →  status: COMPLETED
    → POST /payments/vnpay/create
    → Customer redirect đến VNPAY
    → Thanh toán → GET /payments/vnpay/return  →  status: PAID
    → Customer được phép review
    → POST /appointments/:id/review
```

### Luồng Đăng ký Shop
```
Owner đăng ký tài khoản (role: OWNER)
    → POST /stores  →  status: PENDING
    → Super Admin nhận thông báo shop mới
    → Super Admin xem xét
    → PATCH /admin/stores/:id/approve  →  status: ACTIVE
    → Email thông báo phê duyệt gửi cho Owner
    → Shop xuất hiện trên public listing
```

---

## File quan trọng cần biết

```
booking-business/
├── prisma/schema.prisma              ← Database schema (source of truth)
├── src/app.module.ts                 ← Root module, global guards
├── src/common/constants/permissions.ts  ← Tất cả permission codes
├── src/common/decorators/            ← @Public, @CurrentUser, @RequirePermissions
├── src/common/guards/                ← JwtAuthGuard, PermissionsGuard
└── src/features/
    ├── identity/auth/auth.controller.ts
    ├── catalog/services/
    ├── booking/appointments/
    └── booking/payments/

booking-fe/
├── app/layout.tsx                    ← Root layout
├── app/dashboard/layout.tsx          ← Dashboard layout
├── lib/api.ts                        ← (CẦN TẠO) Axios client
├── contexts/auth-context.tsx         ← (CẦN TẠO) Auth state
└── middleware.ts                     ← (CẦN TẠO) Route protection
```
