<div align="center">

  # Glowora — Booking Business (Backend)

  API nền tảng đặt lịch spa/salon 💆‍♀️ — NestJS + Prisma + MySQL

  [![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
  [![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
  [![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com)
  [![Redis](https://img.shields.io/badge/Redis-cache-DC382D?logo=redis&logoColor=white)](https://redis.io)
  [![RabbitMQ](https://img.shields.io/badge/RabbitMQ-async-FF6600?logo=rabbitmq&logoColor=white)](https://www.rabbitmq.com)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>

Backend cho **Glowora** — nền tảng kết nối khách hàng với các spa/salon (massage, chăm sóc da, nail, ...). Phục vụ ba nhóm người dùng: **khách hàng**, **chủ spa/nhân viên**, **quản trị viên hệ thống**, dùng chung một REST API.

Repo frontend tương ứng: [`booking-fe`](../booking-fe/README.md) (Next.js, giao tiếp qua RTK Query).

---

## ✨ Tính năng chính

- **Auth & RBAC** — JWT (access/refresh, HTTP-only cookie), OTP qua email, đăng nhập Google OAuth, phân quyền theo role scoped theo `storeId`, cache permission trên Redis
- **Store** — đăng ký cửa hàng (KYC: CCCD, giấy phép kinh doanh), giờ làm việc, cấu hình nhận thanh toán, tích hợp Telegram; duyệt/khoá bởi admin
- **Catalog** — danh mục 2 cấp (hệ thống / cửa hàng), dịch vụ với nhiều biến thể (variant) giá & thời lượng
- **Nhân sự** — mời nhân viên, lịch làm việc theo tuần (có snapshot lịch sử khi đổi), nghỉ phép, gọi làm thêm (call-in)
- **Đặt lịch (Booking)** — tính slot trống theo nhân viên, transaction `Serializable` chống double-booking, áp coupon/promotion tự động, huỷ theo chính sách giờ
- **Thanh toán** — chuyển khoản QR qua **SePay** (webhook xác thực HMAC), ghi nhận thanh toán tiền mặt, đặt cọc theo phần trăm
- **Chat** — realtime qua Socket.IO giữa khách hàng và cửa hàng, forward hai chiều với **Telegram** (mỗi cửa hàng = 1 group + forum topics), trợ lý AI (Gemini) qua WebSocket
- **Thông báo** — 20+ loại sự kiện tự động (in-app + email + Web Push VAPID)
- **Analytics & System Log** — thống kê doanh thu/booking cho store và admin, nhật ký hành động polymorphic
- **Xử lý bất đồng bộ** — RabbitMQ cho email, push, forward Telegram, nhắc lịch (không chặn request chính)

---

## 🏗️ Kiến trúc

### Lớp vào & bảo vệ global

```
HTTP Request
  → helmet + CORS + cookie-parser
  → ThrottlerGuard      (rate limit theo IP, storage Redis)
  → JwtAuthGuard        (bỏ qua nếu route gắn @Public)
  → PermissionsGuard    (@RequirePermissions, cache Redis 5 phút)
  → Controller → Service → Prisma → MySQL
```

Ba guard trên chạy **global** (`APP_GUARD` trong `app.module.ts`), theo đúng thứ tự: Throttler chặn flood trước khi tốn chi phí verify JWT, JWT xác thực danh tính, Permissions kiểm tra quyền theo `storeId` (lấy từ header `x-store-id` hoặc param route).

### Xử lý bất đồng bộ (RabbitMQ)

Các tác vụ chậm/không quan trọng-tức-thời (gửi email, push notification, forward Telegram, tick nhắc lịch) được **publish vào queue** thay vì `await` trực tiếp — request chính trả về ngay, consumer xử lý ở "hậu trường" với retry có backoff (3 lần, 5s→15s→45s) rồi rơi vào Dead Letter Queue nếu vẫn lỗi.

| Queue | Producer | Consumer |
|---|---|---|
| `notifications.email` | `MailProducerService` | `MailConsumer` |
| `notifications.push` | `NotificationsService` | `WebPushConsumer` |
| `telegram.forward` | `ConversationsService` | `TelegramConsumer` |
| `booking.reminder-tick` | `BookingReminderService` (cron) | `BookingReminderConsumer` |

### Cluster mode

`main.ts` fork một worker process cho mỗi CPU core (`WEB_CONCURRENCY`, mặc định = số core) để tận dụng hết CPU dưới tải cao — Node chỉ chạy JS trên 1 thread nên phần CPU-bound (verify JWT, validate DTO, serialize response) sẽ nghẽn nếu chạy đơn tiến trình. Socket.IO được đồng bộ giữa các worker qua Redis pub/sub (`redis-io.adapter.ts`); RabbitMQ tự chia message cho các worker (competing consumers) nên không lo trùng lặp; riêng cron job nhắc lịch chỉ chạy ở đúng 1 worker được đánh dấu `IS_SINGLETON_WORKER`.

---

## 📦 Domain & schema dữ liệu

Nguồn sự thật cho toàn bộ quan hệ dữ liệu: [`prisma/schema.prisma`](prisma/schema.prisma) — nên đọc trước khi đi sâu vào service.

Các nhóm model chính:

| Nhóm | Model |
|---|---|
| Identity | `User`, `Role`, `Permission`, `RolePermission`, `UserRole` |
| Store | `Store`, `WorkingHour`, `StorePaymentConfig`, `Staff`, `StaffInvite` |
| Catalog | `ServiceCategory`, `Service`, `ServiceVariant` |
| Lịch nhân viên | `StaffSchedule`, `StaffScheduleHistory`, `StaffDayOff`, `StaffCallIn` |
| Booking | `Booking`, `BookingItem`, `Payment`, `Coupon`, `CouponUsage`, `Promotion`, `PromotionCategory`, `PromotionService`, `Review` |
| Chat & thông báo | `Conversation`, `Message`, `Notification`, `PushSubscription` |
| Địa chính | `Province`, `Ward` |
| Hệ thống | `SystemLog` |

Một số điểm thiết kế đáng chú ý:
- **Store scoping**: hầu hết resource (role, category, coupon...) có `storeId` nullable — `null` nghĩa là dùng chung toàn hệ thống (platform-wide).
- **Snapshot dữ liệu**: `BookingItem` lưu lại tên/giá/thời lượng dịch vụ + tên nhân viên tại thời điểm đặt — không phụ thuộc vào dữ liệu gốc bị sửa/xoá sau này.
- **Lịch sử lịch làm việc**: mỗi lần bulk-update `StaffSchedule`, bản ghi cũ được snapshot sang `StaffScheduleHistory` (có `effectiveFrom`/`effectiveTo`) trước khi ghi đè — cho phép tính slot đúng cho các ngày trong quá khứ.
- **`SystemLog.storeId` không phải FK** — cố tình giữ nguyên log kể cả khi store bị xoá.

---

## 🗂️ Cấu trúc thư mục

```
booking-business/
├── prisma/
│   ├── schema.prisma        # Toàn bộ model & quan hệ
│   ├── migrations/
│   └── seed*.ts             # Script seed dữ liệu mẫu
├── src/
│   ├── main.ts              # Bootstrap, cluster fork, guard/pipe/filter global
│   ├── app.module.ts         # Cây module, guard global
│   ├── common/               # Decorator (@Public, @CurrentUser, @RequirePermissions),
│   │                         # filter (Http/Prisma exception), interceptor (transform response)
│   ├── prisma/                # PrismaModule/PrismaService (global) + retry transaction util
│   ├── redis/                 # RedisModule + permission cache service
│   ├── rabbitmq/              # Cấu hình queue, topology (DLQ/retry), ClientProxy dùng chung
│   ├── gateways/               # Socket.IO gateway (chat, ai_chat, join_store) + Redis adapter
│   ├── ai/                     # Gemini AI service (dùng qua gateway, không qua REST)
│   ├── telegram/                # Bot, webhook, consumer forward tin nhắn
│   ├── mail/                     # Nodemailer + template + producer/consumer
│   ├── cloudinary/ upload/        # Upload ảnh (logo, banner, KYC, dịch vụ, chat)
│   ├── system-log/                # Ghi nhật ký hành động
│   └── features/
│       ├── identity/               # auth, users, roles, permissions
│       ├── stores/                 # store, staff-per-store, analytics, admin-analytics
│       ├── catalog/                # categories, services
│       ├── staff/                  # staff-schedule, staff-day-off, staff-call-in, working-hour
│       ├── booking/                 # bookings, slots, payments, coupons, promotions, reviews
│       ├── messaging/                # conversations, messages
│       ├── notifications/            # notifications, web-push
│       └── locations/                 # province, ward
└── test/
```

---

## 🛠️ Công nghệ sử dụng

| Nhóm | Công nghệ |
|---|---|
| ⚙️ Framework | NestJS 11, TypeScript, class-validator/class-transformer |
| 🗄️ Data | Prisma 7 (`@prisma/adapter-mariadb`) → MySQL 8; Redis (cache quyền, OTP, blacklist token) |
| 📨 Async | RabbitMQ (`amqp-connection-manager`) — email, push, Telegram forward, nhắc lịch |
| 🔐 Auth | Passport (JWT + Local + Google OAuth20), bcrypt, cookie HTTP-only |
| 🔌 Realtime | Socket.IO + `@socket.io/redis-adapter` (đồng bộ giữa cluster worker) |
| 🤖 AI | Google Gemini (`@google/generative-ai`) — chat trợ lý qua WebSocket |
| 💬 Tích hợp ngoài | SePay (QR chuyển khoản), Telegram Bot API, Cloudinary (ảnh), Web Push (VAPID), SMTP |
| 🛡️ Bảo mật | Helmet, CORS whitelist, `@nestjs/throttler` (storage Redis, chạy được dưới cluster) |
| 🧪 Test | Jest, Supertest |

---

## 🚀 Bắt đầu

### Yêu cầu
- Node.js 20+, pnpm/npm
- MySQL, Redis, RabbitMQ — chạy nhanh bằng `docker-compose.yml` có sẵn (dev) hoặc `docker-compose.pro.yml` (prod)

### Cài đặt

```bash
npm install
docker compose up -d          # MySQL + Redis + RabbitMQ
```

### Biến môi trường

Tạo `.env` dựa trên [`.env.example`](.env.example). Bắt buộc phải có `JWT_ACCESS_SECRET` và `JWT_REFRESH_SECRET` — app **fail-fast** ngay lúc khởi động nếu thiếu (`assertRequiredEnv()` trong `main.ts`), tránh chạy âm thầm với secret mặc định dễ đoán.

Nhóm biến chính: `DATABASE_URL` (MySQL), `REDIS_*`, `RABBITMQ_*`, `JWT_*`, `MAIL_*` (SMTP), `GEMINI_API_KEY`, `CLOUDINARY_*`, `VAPID_*` (Web Push), `TELEGRAM_BOT_TOKEN`, `FRONTEND_CORS_ORIGINS`, `WEB_CONCURRENCY` (số cluster worker).

### Chạy database

```bash
npx prisma generate
npx prisma migrate dev      # hoặc: npm run db:migrate
npm run db:seed             # seed dữ liệu mẫu (role/permission, tỉnh/thành...)
```

### Chạy dự án

```bash
npm run start:dev    # dev, watch mode
npm run build && npm run start:prod
npm run test          # unit test (Jest)
npm run test:e2e       # e2e test
```

Mặc định lắng nghe cổng `APP_PORT` (mặc định `8080`). Swagger UI chỉ bật khi `NODE_ENV !== production`, tại `/api`.

---

## 🛡️ Bảo mật & phân quyền

- Toàn bộ route yêu cầu **JWT** theo mặc định (`JwtAuthGuard` global) — route công khai phải gắn `@Public()` tường minh (ví dụ `POST /auth/login`, `POST /auth/register`).
- Phân quyền chi tiết dùng `@RequirePermissions({ codes: [...], mode: 'any' | 'all' })`; `PermissionsGuard` gộp quyền từ **mọi role của user tại đúng store đang thao tác** (xác định qua header `x-store-id` hoặc `:storeId`/`:id` trong route `/stores/...`), cache 5 phút trên Redis theo key `user:permissions:{userId}:{storeId|system}` — tự invalidate khi role/permission đổi.
- Refresh token được **rotate** mỗi lần dùng (hash lưu DB) và **blacklist trên Redis** khi logout hoặc refresh — token cũ không dùng lại được.
- Rate limit toàn cục theo IP (`ThrottlerGuard`, storage Redis dùng chung để đúng dưới cluster nhiều worker), route nhạy cảm (login, OTP) có `@Throttle` riêng chặt hơn.
- Webhook thanh toán SePay xác thực bằng chữ ký **HMAC-SHA256** với `webhook_secret` riêng theo từng store.
