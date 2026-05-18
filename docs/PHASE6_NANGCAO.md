# Phase 6 — Tính năng Nâng cao (Chi tiết)

> **Prerequisite:** Phase 1–5 hoàn chỉnh.  
> **Stack:** NestJS 11 · Prisma · MySQL · Redis · Socket.IO · Bull Queue · Nodemailer · Next.js 16  
> **Đọc cùng:** Tất cả các phase trước — Phase 6 nâng cấp và mở rộng mọi thứ đã có.

---

## Ma trận Ưu tiên

Phase 6 gồm nhiều tính năng độc lập. Làm theo thứ tự ưu tiên:

| Tính năng | Độ ưu tiên | Lý do |
|-----------|-----------|-------|
| Real-time Chat (Socket.IO) | 🔴 Cao nhất | Tính năng demo ấn tượng nhất, phụ thuộc Socket.IO đã cài |
| Real-time Notifications | 🔴 Cao | Tận dụng Socket.IO đã setup |
| Owner Analytics | 🟠 Cao | Recharts đã có, data đã có từ Phase 4-5 |
| Admin Dashboard (stats + user mgmt) | 🟠 Cao | Hoàn thiện hệ thống |
| Email SMTP (nâng cấp console.log) | 🟡 Trung bình | Thay thế tất cả `console.log` từ trước |
| Appointment Reminders (Scheduler) | 🟡 Trung bình | Cần Bull Queue |
| Advanced Search (full-text + filter) | 🟡 Trung bình | Nâng cấp GET /stores |
| System Log (audit trail) | 🟢 Thấp | Admin tool |
| Cloud Storage (S3/Cloudinary) | 🟢 Thấp | Nâng cấp local Multer |
| VNPAY Refund | 🟢 Thấp | Phức tạp, optional |
| Geolocation "Gần tôi" | 🟢 Thấp | Complex, skip nếu không đủ thời gian |

---

## Mục tiêu Phase

1. **Chat real-time** giữa khách hàng và cơ sở — không cần refresh trang
2. **Push notifications** qua WebSocket thay vì polling
3. **Owner xem doanh thu / thống kê** trực quan bằng biểu đồ
4. **Super Admin quản lý** toàn hệ thống: stats, ban user, log hoạt động
5. **Email thật** thay console.log — gửi xác nhận, nhắc lịch 24h/1h
6. **Tìm kiếm nâng cao**: full-text, filter giá, "gần tôi"
7. **Ảnh lên cloud** (S3 hoặc Cloudinary) thay local disk

---

## I. Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                               │
│  Socket.IO client (tất cả trang khi đã login)                       │
│  /chat           → Trang chat                                        │
│  /dashboard/chat → Owner/Staff trả lời hội thoại                    │
│  /dashboard/analytics → Biểu đồ recharts                            │
│  /admin/dashboard → Super Admin stats                                │
│  /admin/users     → Quản lý users                                    │
│  /admin/logs      → System log                                       │
└──────┬─────────────────────────────────────────────────────────────┘
       │ HTTP + WebSocket
┌──────▼──────────────────────────────────────────────────────────────┐
│                       NestJS                                          │
│                                                                        │
│  ┌─────────────────────┐    ┌──────────────────────────────────────┐ │
│  │   ChatGateway        │    │   AppGateway (Notifications)         │ │
│  │   (Socket.IO)        │    │   (Socket.IO, same server)           │ │
│  │                      │    │                                      │ │
│  │  join_room          │    │  User joins user:{id} room           │ │
│  │  send_message ──────┼────┼► emit new_appointment               │ │
│  │  typing_start/stop  │    │  emit appointment_status             │ │
│  │  mark_read          │    │  emit new_notification               │ │
│  └──────────┬──────────┘    └────────────────────────────────────-─┘ │
│             │                                                          │
│  ┌──────────▼──────────┐    ┌─────────────────────────────────────┐  │
│  │  Conversations /     │    │  SchedulerModule (Bull Queue)        │  │
│  │  Messages REST API   │    │  Reminder24h job                    │  │
│  │  + Socket Gateway    │    │  Reminder1h job                     │  │
│  └──────────┬──────────┘    │  ExpireInvites cron                 │  │
│             │               └──────────────────────────────────────┘  │
│  ┌──────────▼───────────────────────────────────────────────────────┐ │
│  │  MailerService (Nodemailer/SendGrid)                              │ │
│  │  - Gọi từ NotificationsService, ReminderProcessor                │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
             ┌─────────────────┴──────────────────┐
             │                                     │
          MySQL 8                              Redis 7
      conversations                     online:{userId} TTL=30s
      messages                          user:permissions:{id}
      system_logs                       bull:reminder queue
      (existing tables)
```

---

## II. Database Schema — Thay đổi cần làm

### 2.1 Verify / Hoàn thiện model `Conversation`

```prisma
model Conversation {
  id         String   @id @default(uuid()) @db.Char(36)
  customerId String   @map("customer_id") @db.Char(36)
  storeId    String   @map("store_id") @db.Char(36)

  lastMessageAt     DateTime? @map("last_message_at")
  lastMessageBody   String?   @map("last_message_body") @db.VarChar(200)
  // Preview 200 ký tự đầu của tin nhắn cuối — dùng cho list view

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  customer  User      @relation("CustomerConversations", fields: [customerId], references: [id])
  store     Store     @relation(fields: [storeId], references: [id])
  messages  Message[]

  @@unique([customerId, storeId])
  // Mỗi cặp customer-store chỉ có 1 conversation
  @@index([customerId, lastMessageAt])
  @@index([storeId, lastMessageAt])
  @@map("conversations")
}
```

### 2.2 Verify / Hoàn thiện model `Message`

```prisma
model Message {
  id             String   @id @default(uuid()) @db.Char(36)
  conversationId String   @map("conversation_id") @db.Char(36)
  senderId       String   @map("sender_id") @db.Char(36)

  content        String   @db.Text
  isRead         Boolean  @default(false) @map("is_read")
  readAt         DateTime? @map("read_at")

  createdAt DateTime @default(now()) @map("created_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User         @relation("SentMessages", fields: [senderId], references: [id])

  @@index([conversationId, createdAt])
  @@map("messages")
}
```

### 2.3 Sửa model `Store` (thêm relation)

```prisma
model Store {
  // ... existing fields ...
  conversations Conversation[]
}
```

### 2.4 Sửa model `User` (thêm relations)

```prisma
model User {
  // ... existing fields ...
  conversations Conversation[] @relation("CustomerConversations")
  sentMessages  Message[]      @relation("SentMessages")
  systemLogs    SystemLog[]    @relation("ActorLogs")
}
```

### 2.5 Model mới: `SystemLog`

```prisma
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

model SystemLog {
  id       String  @id @default(uuid()) @db.Char(36)
  type     LogType
  actorId  String? @map("actor_id") @db.Char(36)
  // null = system action (cronjob, etc.)
  targetId String? @map("target_id") @db.Char(36)
  // ID của entity bị tác động (userId, storeId, appointmentId, ...)
  targetType String? @map("target_type") @db.VarChar(50)
  // "USER", "STORE", "APPOINTMENT", "REVIEW", "PAYMENT"

  metadata Json?
  // { before: {...}, after: {...} } hoặc context thêm

  ipAddress String? @map("ip_address") @db.VarChar(45)
  createdAt DateTime @default(now()) @map("created_at")

  actor User? @relation("ActorLogs", fields: [actorId], references: [id])

  @@index([actorId])
  @@index([type, createdAt])
  @@index([targetId, targetType])
  @@map("system_logs")
}
```

### 2.6 Sửa `User` — thêm `status` check (nếu chưa có đầy đủ)

```prisma
model User {
  // Verify field này tồn tại:
  status    UserStatus @default(ACTIVE)
  // ACTIVE | BANNED | SUSPENDED
  bannedAt  DateTime? @map("banned_at")
  banReason String?   @map("ban_reason")
}

enum UserStatus {
  ACTIVE
  BANNED
  SUSPENDED   // Phase 6 thêm: tạm đình chỉ có thời hạn
}
```

---

## III. Real-time (Socket.IO)

### 3.1 Setup Gateway

```typescript
// src/gateways/app.gateway.ts — 1 gateway chung cho cả chat và notifications

import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
  namespace: '/',  // default namespace
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {

  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}

  // Middleware xác thực JWT khi connect
  afterInit(server: Server) {
    server.use((socket: Socket, next) => {
      const token = socket.handshake.auth?.token
                 || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication required'));

      try {
        const payload = this.jwtService.verify(token);
        socket.data.user = payload;
        next();
      } catch {
        next(new Error('Invalid token'));
      }
    });
  }

  async handleConnection(client: Socket) {
    const user = client.data.user;
    if (!user) { client.disconnect(); return; }

    // Join personal notification room
    client.join(`user:${user.id}`);

    // Set online status trong Redis (TTL 30s — refreshed by heartbeat)
    await this.redisService.set(`online:${user.id}`, '1', 30);

    console.log(`Socket connected: ${user.id}`);
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user;
    if (!user) return;
    // Online status tự expire sau 30s (không cần del thủ công)
    console.log(`Socket disconnected: ${user.id}`);
  }

  // Heartbeat để giữ online status
  @SubscribeMessage('heartbeat')
  async handleHeartbeat(client: Socket) {
    const userId = client.data.user?.id;
    if (userId) {
      await this.redisService.set(`online:${userId}`, '1', 30);
    }
  }
}
```

### 3.2 Chat — Luồng dữ liệu đầy đủ

```
─────────────────────────────────────────
A. Khởi tạo conversation (REST API):

  POST /conversations { storeId }
    1. isShopMember check (Phase 1)
    2. findOrCreate: Conversation WHERE customerId=? AND storeId=?
    3. Load 20 messages gần nhất (với pagination)
    4. Return: { conversation, messages }

  Frontend: lưu conversationId → join socket room

─────────────────────────────────────────
B. Join conversation room (Socket):

  Client → emit 'join_conversation' { conversationId }
  Server:
    1. Verify user có quyền trong conversation:
         conversation.customerId === user.id
      OR prisma.userRole.findFirst({ where: { userId, shopId: conversation.storeId } })
    2. client.join(`conversation:${conversationId}`)
    3. emit 'joined' { conversationId, onlineUsers: [...] }

─────────────────────────────────────────
C. Gửi tin nhắn (Socket):

  Client → emit 'send_message' { conversationId, content }
  Server:
    1. Verify user đang ở trong conversation đó
    2. Validate content không rỗng, max 2000 ký tự
    3. Lưu Message vào DB
    4. Update Conversation.lastMessageAt + lastMessageBody
    5. emit to `conversation:${conversationId}`:
         'new_message' { id, senderId, content, createdAt }
    6. Notify người kia qua personal room nếu không online trong conversation:
         server.to(`user:${otherUserId}`).emit('new_chat_notification', {
           conversationId, storeName, preview: content.slice(0, 50)
         })

─────────────────────────────────────────
D. Đánh dấu đã đọc (Socket):

  Client → emit 'mark_read' { conversationId }
  Server:
    1. Update Message WHERE conversationId=? AND senderId!=currentUser.id AND isRead=false
       SET isRead=true, readAt=now()
    2. emit to `conversation:${conversationId}`:
         'messages_read' { conversationId, readerId: currentUser.id, readAt }
    → Người gửi thấy "tick đã đọc"

─────────────────────────────────────────
E. Typing indicator (Socket):

  Client → emit 'typing_start' { conversationId }
  Server → emit to conversation room (trừ client gửi):
    'user_typing' { userId, conversationId, isTyping: true }

  Client → emit 'typing_stop' { conversationId }
  Server → emit 'user_typing' { ..., isTyping: false }

  Lưu ý: Frontend tự clear typing sau 3s nếu không nhận 'typing_stop'
```

### 3.3 Chat REST API (bổ sung Socket)

```
GET /conversations/my
  → Danh sách conversations của customer, order by lastMessageAt
  → Include: store (name, logoUrl), unread message count

GET /conversations/store/:storeId
  → Danh sách conversations của shop (Owner/Staff xem)
  → Include: customer (fullName, avatarUrl), unread count, lastMessage

GET /conversations/:id/messages?page=1&limit=30
  → Messages với cursor-based pagination (mới nhất trước)

DELETE /conversations/:id
  → Soft delete (ẩn khỏi list, không xóa messages)

GET /conversations/unread-count
  → Tổng số conversations có tin nhắn chưa đọc
```

### 3.4 Real-time Notifications qua Socket

Thay vì polling, push trực tiếp qua Socket từ service:

```typescript
// Trong AppointmentsService.create():
this.appGateway.server
  .to(`user:${ownerId}`)
  .emit('new_appointment', {
    type: 'NEW_APPOINTMENT',
    message: `${customer.fullName} đã đặt lịch dịch vụ ${service.name}`,
    data: { appointmentId, storeId, scheduledAt }
  });

// Trong AppointmentsService.confirm():
this.appGateway.server
  .to(`user:${appointment.customerId}`)
  .emit('appointment_status_changed', {
    type: 'APPOINTMENT_CONFIRMED',
    appointmentId,
    status: 'CONFIRMED',
  });
```

**Socket events từ server → client (tóm tắt):**

| Event | Gửi tới | Trigger |
|-------|---------|---------|
| `new_appointment` | `user:{ownerId}` | Customer đặt lịch |
| `appointment_status_changed` | `user:{customerId}` | Confirm/reject/complete |
| `new_notification` | `user:{userId}` | Mọi loại notification |
| `new_message` | `conversation:{id}` | Tin nhắn mới |
| `new_chat_notification` | `user:{userId}` | Khi không ở trong conversation room |
| `user_typing` | `conversation:{id}` | Typing indicator |
| `messages_read` | `conversation:{id}` | Read receipt |
| `online_status_changed` | `user:{watcherId}` | Staff online/offline |

### 3.5 Online Status (Staff)

```typescript
// GET /users/:id/online — check nhanh qua Redis
async isUserOnline(userId: string): Promise<boolean> {
  const result = await this.redisService.get(`online:${userId}`);
  return result !== null;
}

// GET /stores/:storeId/staff/online — tất cả staff của shop
async getOnlineStaff(storeId: string): Promise<string[]> {
  const staffIds = await this.prisma.staff.findMany({
    where: { storeId, status: 'ACTIVE' },
    select: { user: { select: { id: true } } }
  });

  const onlineChecks = await Promise.all(
    staffIds.map(s => this.redisService.get(`online:${s.user.id}`))
  );

  return staffIds
    .filter((_, i) => onlineChecks[i] !== null)
    .map(s => s.user.id);
}
```

**Frontend dùng để hiển thị badge "Online" khi chọn nhân viên trong booking wizard:**
```typescript
// BookingWizard Step 2: StaffSelector
// Nếu staff.isOnline → hiển thị dot xanh
```

---

## IV. Email SMTP — Nâng cấp từ console.log

### 4.1 Setup Nodemailer với NestJS

```bash
npm install @nestjs-modules/mailer nodemailer
npm install -D @types/nodemailer
# Template engine:
npm install handlebars
```

```typescript
// app.module.ts
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';

MailerModule.forRootAsync({
  useFactory: () => ({
    transport: {
      host: process.env.MAIL_HOST,       // smtp.gmail.com
      port: parseInt(process.env.MAIL_PORT), // 587
      secure: false,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,     // App Password (không phải mật khẩu Gmail)
      },
    },
    defaults: {
      from: `"Glowora" <${process.env.MAIL_FROM}>`,
    },
    template: {
      dir: join(__dirname, 'mail/templates'),
      adapter: new HandlebarsAdapter(),
      options: { strict: true },
    },
  }),
})
```

### 4.2 Cấu trúc template email

```
src/
└── mail/
    ├── mail.module.ts
    ├── mail.service.ts
    └── templates/
        ├── appointment-created.hbs      ← Xác nhận đặt lịch
        ├── appointment-confirmed.hbs    ← Lịch đã xác nhận
        ├── appointment-rejected.hbs     ← Lịch bị từ chối
        ├── appointment-completed.hbs    ← Dịch vụ hoàn thành + review link
        ├── appointment-cancelled.hbs    ← Lịch bị hủy
        ├── appointment-reminder.hbs     ← Nhắc lịch (24h/1h)
        ├── payment-success.hbs         ← Thanh toán thành công
        ├── staff-invite.hbs            ← Mời nhân viên
        ├── store-approved.hbs          ← Shop được duyệt
        └── store-rejected.hbs          ← Shop bị từ chối
```

### 4.3 MailService

```typescript
@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) {}

  async sendAppointmentConfirmed(data: {
    to: string;
    customerName: string;
    storeName: string;
    serviceName: string;
    scheduledAt: Date;
    storePhone: string;
    storeAddress: string;
  }) {
    await this.mailerService.sendMail({
      to: data.to,
      subject: `Lịch hẹn đã được xác nhận — ${data.storeName}`,
      template: 'appointment-confirmed',
      context: {
        ...data,
        scheduledAtFormatted: format(data.scheduledAt, 'HH:mm — EEEE, dd/MM/yyyy', { locale: vi }),
        appUrl: process.env.FRONTEND_URL,
      },
    });
  }

  async sendAppointmentReminder(data: {
    to: string;
    customerName: string;
    storeName: string;
    serviceName: string;
    scheduledAt: Date;
    hoursUntil: 24 | 1;
  }) {
    await this.mailerService.sendMail({
      to: data.to,
      subject: `Nhắc lịch: Còn ${data.hoursUntil} giờ nữa — ${data.storeName}`,
      template: 'appointment-reminder',
      context: { ...data },
    });
  }

  // Các method tương tự cho các event khác...
}
```

### 4.4 Env vars cần thêm

```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your-email@gmail.com
MAIL_PASS=your-app-password   # Gmail: Settings > Security > 2FA > App Passwords
MAIL_FROM=noreply@glowora.com
FRONTEND_URL=http://localhost:3000
```

> **Gmail App Password:** Bật 2FA → Google Account → Security → App passwords → Tạo password cho "Mail"

---

## V. Appointment Reminders — Bull Queue Scheduler

### 5.1 Setup Bull

```bash
npm install @nestjs/bull bull
npm install -D @types/bull
```

```typescript
// app.module.ts
import { BullModule } from '@nestjs/bull';

BullModule.forRoot({
  redis: { host: 'localhost', port: 6379 },
}),
BullModule.registerQueue({ name: 'reminders' }),
```

### 5.2 Schedule reminder khi xác nhận lịch hẹn

```typescript
// appointments.service.ts — trong method confirm():

async confirm(id: string, userId: string) {
  const apt = await this.prisma.appointment.update({
    where: { id },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
    include: { customer: true, service: true, store: true, staff: { include: { user: true } } }
  });

  // Gửi email xác nhận ngay
  await this.mailService.sendAppointmentConfirmed({
    to: apt.customer.email,
    customerName: apt.customer.fullName,
    storeName: apt.store.name,
    serviceName: apt.service.name,
    scheduledAt: apt.scheduledAt,
    storePhone: apt.store.phone,
    storeAddress: apt.store.address,
  });

  // Schedule reminder 24h trước
  const reminder24hDelay = apt.scheduledAt.getTime() - Date.now() - 24 * 3_600_000;
  if (reminder24hDelay > 0) {
    await this.remindersQueue.add(
      'send_reminder',
      { appointmentId: apt.id, type: '24h' },
      { delay: reminder24hDelay, jobId: `reminder-24h-${apt.id}` }
      // jobId unique: tránh duplicate nếu confirm gọi 2 lần
    );
  }

  // Schedule reminder 1h trước
  const reminder1hDelay = apt.scheduledAt.getTime() - Date.now() - 1 * 3_600_000;
  if (reminder1hDelay > 0) {
    await this.remindersQueue.add(
      'send_reminder',
      { appointmentId: apt.id, type: '1h' },
      { delay: reminder1hDelay, jobId: `reminder-1h-${apt.id}` }
    );
  }

  // Xóa reminder jobs nếu lịch bị cancel sau đó
  // → Gọi this.remindersQueue.removeJobs(`reminder-*-${apt.id}`) trong cancel()

  return apt;
}
```

### 5.3 Reminder Processor

```typescript
// reminders.processor.ts
@Processor('reminders')
export class RemindersProcessor {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  @Process('send_reminder')
  async sendReminder(job: Job<{ appointmentId: string; type: '24h' | '1h' }>) {
    const { appointmentId, type } = job.data;

    const apt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        customer: true,
        service: true,
        store: true,
      }
    });

    // Chỉ gửi nếu appointment vẫn CONFIRMED (chưa bị cancel/complete)
    if (!apt || apt.status !== 'CONFIRMED') {
      console.log(`Reminder skipped: ${appointmentId} status=${apt?.status}`);
      return;
    }

    await this.mailService.sendAppointmentReminder({
      to: apt.customer.email,
      customerName: apt.customer.fullName,
      storeName: apt.store.name,
      serviceName: apt.service.name,
      scheduledAt: apt.scheduledAt,
      hoursUntil: type === '24h' ? 24 : 1,
    });

    console.log(`Reminder sent: ${appointmentId} type=${type}`);
  }
}
```

### 5.4 Cronjob: Expire Staff Invites

```typescript
// invite-cleanup.cron.ts (ScheduleModule)
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class InviteCleanupCron {
  constructor(private prisma: PrismaService) {}

  // Chạy mỗi đêm 00:00
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireInvites() {
    const result = await this.prisma.staffInvite.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    console.log(`Expired ${result.count} staff invites`);
  }
}
```

```bash
# Setup NestJS Schedule module:
npm install @nestjs/schedule
```

---

## VI. Admin Dashboard

### 6.1 System Statistics

```typescript
// GET /admin/stats
// Guard: SUPER_ADMIN

async getSystemStats() {
  const now = new Date();
  const startOfToday = startOfDay(now);
  const startOfWeek = startOfWeek(now, { weekStartsOn: 1 });
  const startOfMonth = startOfMonth(now);

  const [
    storeStats,
    userStats,
    appointmentStats,
    revenueStats,
    newUsersToday,
    newStoresThisWeek,
  ] = await Promise.all([
    // Store breakdown by status
    this.prisma.store.groupBy({
      by: ['status'],
      _count: { id: true },
    }),

    // User breakdown by role (via UserRole)
    this.prisma.user.count({ where: { status: 'ACTIVE' } }),

    // Appointment stats this month
    this.prisma.appointment.groupBy({
      by: ['status'],
      where: { scheduledAt: { gte: startOfMonth } },
      _count: { id: true },
    }),

    // Revenue this month
    this.prisma.payment.aggregate({
      where: {
        status: 'PAID',
        paidAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    }),

    // New users today
    this.prisma.user.count({
      where: { createdAt: { gte: startOfToday } }
    }),

    // New stores this week
    this.prisma.store.count({
      where: { createdAt: { gte: startOfWeek } }
    }),
  ]);

  return {
    stores: {
      total: storeStats.reduce((sum, s) => sum + s._count.id, 0),
      active: storeStats.find(s => s.status === 'ACTIVE')?._count.id ?? 0,
      pending: storeStats.find(s => s.status === 'PENDING')?._count.id ?? 0,
      banned: storeStats.find(s => s.status === 'BANNED')?._count.id ?? 0,
      newThisWeek: newStoresThisWeek,
    },
    users: {
      total: userStats,
      newToday: newUsersToday,
    },
    appointments: {
      thisMonth: appointmentStats.reduce((sum, a) => sum + a._count.id, 0),
      completed: appointmentStats.find(a => a.status === 'COMPLETED')?._count.id ?? 0,
      cancelled: appointmentStats.find(a => a.status === 'CANCELLED')?._count.id ?? 0,
    },
    revenue: {
      thisMonth: revenueStats._sum.amount ?? 0,
    },
  };
}
```

### 6.2 Revenue Chart Data (Admin)

```typescript
// GET /admin/stats/revenue?period=week|month|year

async getRevenueChart(period: 'week' | 'month' | 'year') {
  const { from, groupBy } = periodToRange(period);
  // period=week → from=7 ngày trước, groupBy=day
  // period=month → from=30 ngày trước, groupBy=day
  // period=year → from=1 năm trước, groupBy=month

  const data = await this.prisma.$queryRaw<Array<{date: string; revenue: number; count: number}>>`
    SELECT
      DATE_FORMAT(p.paid_at, ${groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m'}) as date,
      SUM(p.amount) as revenue,
      COUNT(p.id) as count
    FROM payments p
    WHERE p.status = 'PAID'
      AND p.paid_at >= ${from}
    GROUP BY date
    ORDER BY date ASC
  `;

  return data;
}
```

### 6.3 User Management (Admin)

```typescript
// GET /admin/users?search=&role=&status=&page=&limit=

async findUsers(filter: AdminUserFilterDto) {
  const where: Prisma.UserWhereInput = {
    ...(filter.search && {
      OR: [
        { fullName: { contains: filter.search } },
        { email: { contains: filter.search } },
      ]
    }),
    ...(filter.status && { status: filter.status }),
  };

  const [data, total] = await this.prisma.$transaction([
    this.prisma.user.findMany({
      where,
      include: {
        userRoles: { include: { role: true } },
        _count: {
          select: { appointments: true, payments: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    this.prisma.user.count({ where }),
  ]);

  return { data, total };
}

// PATCH /admin/users/:id/ban { reason }
async banUser(userId: string, adminId: string, reason: string) {
  await this.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { status: 'BANNED', bannedAt: new Date(), banReason: reason }
    });

    // Xóa permission cache → request tiếp theo sẽ load lại và thấy BANNED
    await this.redisService.del(`user:permissions:${userId}`);

    // Log action
    await tx.systemLog.create({
      data: {
        type: 'USER_BANNED',
        actorId: adminId,
        targetId: userId,
        targetType: 'USER',
        metadata: { reason },
      }
    });
  });
}

// PATCH /admin/users/:id/unban
async unbanUser(userId: string, adminId: string) {
  await this.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', bannedAt: null, banReason: null }
    });
    await tx.systemLog.create({
      data: { type: 'USER_UNBANNED', actorId: adminId, targetId: userId, targetType: 'USER' }
    });
  });
}
```

### 6.4 JwtAuthGuard cần check BANNED status

```typescript
// jwt.strategy.ts — sau khi verify token, check user status
async validate(payload: JwtPayload) {
  // Cache key khác với permission cache để tránh nhầm
  const cacheKey = `user:status:${payload.sub}`;
  let status = await this.redisService.get(cacheKey);

  if (!status) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true }
    });
    status = user?.status ?? 'ACTIVE';
    await this.redisService.set(cacheKey, status, 300); // cache 5 phút
  }

  if (status === 'BANNED') {
    throw new UnauthorizedException('Tài khoản đã bị khóa');
  }

  return { id: payload.sub, email: payload.email };
}

// Khi ban user: phải xóa cả key này
await this.redisService.del(`user:status:${userId}`);
await this.redisService.del(`user:permissions:${userId}`);
```

### 6.5 System Log API

```typescript
// GET /admin/logs?type=&actorId=&from=&to=&page=&limit=

async findLogs(filter: LogFilterDto) {
  const where: Prisma.SystemLogWhereInput = {
    ...(filter.type && { type: filter.type }),
    ...(filter.actorId && { actorId: filter.actorId }),
    ...(filter.from && filter.to && {
      createdAt: { gte: new Date(filter.from), lte: new Date(filter.to) }
    }),
  };

  return this.prisma.systemLog.findMany({
    where,
    include: {
      actor: { select: { fullName: true, email: true, avatarUrl: true } }
    },
    orderBy: { createdAt: 'desc' },
    skip: (filter.page - 1) * filter.limit,
    take: filter.limit,
  });
}
```

---

## VII. Owner Analytics

### 7.1 Revenue Over Time

```typescript
// GET /stores/:storeId/analytics/revenue?period=week|month|year
// Guard: JWT + shop ownership

async getRevenue(storeId: string, period: 'week' | 'month' | 'year') {
  const { from, format } = periodConfig[period];
  // week:  from = 7 ngày trước, format = '%Y-%m-%d'
  // month: from = 30 ngày trước, format = '%Y-%m-%d'
  // year:  from = 12 tháng trước, format = '%Y-%m'

  const data = await this.prisma.$queryRaw<Array<{
    date: string;
    revenue: number;
    appointmentCount: number;
  }>>`
    SELECT
      DATE_FORMAT(p.paid_at, ${format}) as date,
      COALESCE(SUM(p.amount), 0) as revenue,
      COUNT(p.id) as appointmentCount
    FROM payments p
    INNER JOIN appointments a ON p.appointment_id = a.id
    WHERE a.store_id = ${storeId}
      AND p.status = 'PAID'
      AND p.paid_at >= ${from}
    GROUP BY date
    ORDER BY date ASC
  `;

  // Fill in missing dates với 0
  return fillMissingDates(data, from, new Date(), format);
}
```

### 7.2 Appointment Statistics

```typescript
// GET /stores/:storeId/analytics/appointments?period=month

async getAppointmentStats(storeId: string, period: string) {
  const { from } = periodConfig[period];

  // Breakdown by status
  const statusBreakdown = await this.prisma.appointment.groupBy({
    by: ['status'],
    where: {
      storeId,
      scheduledAt: { gte: from },
    },
    _count: { id: true },
  });

  // Appointments by day of week (để biết ngày bận nhất)
  const byDayOfWeek = await this.prisma.$queryRaw<Array<{
    dayOfWeek: number;
    count: number;
  }>>`
    SELECT DAYOFWEEK(scheduled_at) as dayOfWeek, COUNT(id) as count
    FROM appointments
    WHERE store_id = ${storeId}
      AND scheduled_at >= ${from}
      AND status IN ('CONFIRMED', 'COMPLETED')
    GROUP BY dayOfWeek
    ORDER BY dayOfWeek
  `;

  // Appointments by hour (để biết giờ bận nhất)
  const byHour = await this.prisma.$queryRaw<Array<{
    hour: number;
    count: number;
  }>>`
    SELECT HOUR(scheduled_at) as hour, COUNT(id) as count
    FROM appointments
    WHERE store_id = ${storeId}
      AND scheduled_at >= ${from}
      AND status IN ('CONFIRMED', 'COMPLETED')
    GROUP BY hour
    ORDER BY hour
  `;

  return { statusBreakdown, byDayOfWeek, byHour };
}
```

### 7.3 Top Services & Staff

```typescript
// GET /stores/:storeId/analytics/top-services?limit=5&period=month

async getTopServices(storeId: string, limit = 5, period = 'month') {
  const { from } = periodConfig[period];

  const topServiceIds = await this.prisma.appointment.groupBy({
    by: ['serviceId'],
    where: {
      storeId,
      scheduledAt: { gte: from },
      status: { in: ['CONFIRMED', 'COMPLETED'] },
    },
    _count: { id: true },
    _sum: { price: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  });

  // Enrich với service details
  const serviceIds = topServiceIds.map(s => s.serviceId);
  const services = await this.prisma.service.findMany({
    where: { id: { in: serviceIds } },
    select: { id: true, name: true, price: true, imageUrl: true }
  });

  return topServiceIds.map(item => ({
    service: services.find(s => s.id === item.serviceId),
    bookingCount: item._count.id,
    totalRevenue: item._sum.price ?? 0,
  }));
}

// GET /stores/:storeId/analytics/top-staff?limit=5&period=month

async getTopStaff(storeId: string, limit = 5, period = 'month') {
  const { from } = periodConfig[period];

  const topStaffIds = await this.prisma.appointment.groupBy({
    by: ['staffId'],
    where: {
      storeId,
      staffId: { not: null },
      scheduledAt: { gte: from },
      status: { in: ['CONFIRMED', 'COMPLETED'] },
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  });

  const staffIds = topStaffIds.map(s => s.staffId!);
  const staffList = await this.prisma.staff.findMany({
    where: { id: { in: staffIds } },
    include: {
      user: { select: { fullName: true, avatarUrl: true } },
    },
    select: { id: true, rating: true, totalReviews: true, specialty: true, user: true }
  });

  return topStaffIds.map(item => ({
    staff: staffList.find(s => s.id === item.staffId),
    bookingCount: item._count.id,
  }));
}
```

---

## VIII. Advanced Search

### 8.1 Full-text Search với MySQL FULLTEXT

**Migration thêm FULLTEXT index:**

```typescript
// prisma/migrations/xxx_add_fulltext_indexes/migration.sql
-- Thêm vào cuối file migration
ALTER TABLE stores ADD FULLTEXT INDEX ft_stores (name, description);
ALTER TABLE services ADD FULLTEXT INDEX ft_services (name, description);
```

> Prisma không support FULLTEXT trực tiếp → dùng raw SQL trong migration.

**Query full-text:**

```typescript
// GET /stores?keyword=chăm sóc da&city=Hà Nội&minRating=4&sort=relevance

async findAllAdvanced(filter: AdvancedStoreFilterDto) {
  if (filter.keyword) {
    // Full-text search
    const results = await this.prisma.$queryRaw<Array<Store & { relevance: number }>>`
      SELECT s.*,
        MATCH(s.name, s.description) AGAINST(${filter.keyword} IN BOOLEAN MODE) as relevance
      FROM stores s
      WHERE s.status = 'ACTIVE'
        AND MATCH(s.name, s.description) AGAINST(${filter.keyword} IN BOOLEAN MODE)
        ${filter.city ? Prisma.sql`AND s.city LIKE ${`%${filter.city}%`}` : Prisma.empty}
        ${filter.minRating ? Prisma.sql`AND s.avg_rating >= ${filter.minRating}` : Prisma.empty}
      ORDER BY ${filter.sort === 'relevance' ? Prisma.sql`relevance DESC` : Prisma.sql`s.avg_rating DESC`}
      LIMIT ${filter.limit} OFFSET ${(filter.page - 1) * filter.limit}
    `;
    return results;
  }

  // Fallback: Prisma findMany thông thường (từ Phase 2)
  return this.findAll(filter);
}
```

### 8.2 Filter theo khoảng giá dịch vụ

```typescript
// GET /stores?minPrice=100000&maxPrice=500000
// Lọc store có ít nhất 1 service trong khoảng giá

where: {
  status: 'ACTIVE',
  services: {
    some: {
      status: 'ACTIVE',
      ...(filter.minPrice && { price: { gte: filter.minPrice } }),
      ...(filter.maxPrice && { price: { lte: filter.maxPrice } }),
    }
  }
}
```

### 8.3 Geolocation "Gần tôi" (Haversine)

```typescript
// GET /stores?lat=21.0285&lng=105.8542&radiusKm=5

async findNearby(lat: number, lng: number, radiusKm: number) {
  // Haversine formula trong MySQL
  const stores = await this.prisma.$queryRaw<Array<Store & { distanceKm: number }>>`
    SELECT *,
      (6371 * ACOS(
        COS(RADIANS(${lat})) * COS(RADIANS(latitude)) *
        COS(RADIANS(longitude) - RADIANS(${lng})) +
        SIN(RADIANS(${lat})) * SIN(RADIANS(latitude))
      )) AS distanceKm
    FROM stores
    WHERE status = 'ACTIVE'
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    HAVING distanceKm < ${radiusKm}
    ORDER BY distanceKm ASC
    LIMIT 20
  `;
  return stores;
}
```

> **Frontend:** Dùng `navigator.geolocation.getCurrentPosition()` → lấy lat/lng → gọi API.

---

## IX. Cloud Storage (S3 / Cloudinary)

### 9.1 Cloudinary (Đơn giản hơn, free tier đủ dùng cho đồ án)

```bash
npm install cloudinary multer-storage-cloudinary
npm install -D @types/multer
```

```typescript
// cloudinary.config.ts
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// upload.service.ts
async uploadImage(file: Express.Multer.File, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `glowora/${folder}`,
        transformation: [
          { width: 1200, height: 800, crop: 'limit' },  // resize
          { quality: 'auto' },                            // optimize
          { fetch_format: 'auto' },                       // webp nếu browser support
        ],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result!.secure_url);
      }
    );
    uploadStream.end(file.buffer);
  });
}

// Thêm memory storage cho Multer (không lưu local)
const multerConfig = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5_000_000 } });
```

**Thay thế local upload trong các controller:**
```typescript
// TRƯỚC (Phase 2-3): lưu vào uploads/
// SAU (Phase 6): upload lên Cloudinary

@Post(':id/logo')
@UseInterceptors(FileInterceptor('logo'))
async uploadLogo(
  @Param('id') storeId: string,
  @UploadedFile() file: Express.Multer.File,
) {
  const logoUrl = await this.uploadService.uploadImage(file, `stores/${storeId}`);
  return this.storesService.update(storeId, { logoUrl });
}
```

---

## X. API Endpoints Phase 6

### Chat

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `POST` | `/conversations` | JWT (customer) | Tạo/lấy conversation với store |
| `GET` | `/conversations/my` | JWT | Danh sách conversations của customer |
| `GET` | `/conversations/store/:storeId` | JWT + shop member | Conversations của store |
| `GET` | `/conversations/unread-count` | JWT | Số conversation chưa đọc |
| `GET` | `/conversations/:id/messages` | JWT | Messages (pagination) |
| `DELETE` | `/conversations/:id` | JWT (chính chủ) | Ẩn conversation |

### Socket Events

| Direction | Event | Payload |
|-----------|-------|---------|
| C → S | `join_conversation` | `{ conversationId }` |
| C → S | `send_message` | `{ conversationId, content }` |
| C → S | `typing_start` | `{ conversationId }` |
| C → S | `typing_stop` | `{ conversationId }` |
| C → S | `mark_read` | `{ conversationId }` |
| C → S | `heartbeat` | — |
| S → C | `new_message` | `{ id, senderId, content, createdAt, senderName }` |
| S → C | `user_typing` | `{ userId, conversationId, isTyping }` |
| S → C | `messages_read` | `{ conversationId, readerId }` |
| S → C | `new_chat_notification` | `{ conversationId, storeName/customerName, preview }` |
| S → C | `new_appointment` | `{ appointmentId, customerName, serviceName }` |
| S → C | `appointment_status_changed` | `{ appointmentId, status }` |
| S → C | `new_notification` | `{ type, title, body }` |

### Admin

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/admin/stats` | SUPER_ADMIN | Thống kê tổng quan |
| `GET` | `/admin/stats/revenue` | SUPER_ADMIN | Doanh thu theo kỳ |
| `GET` | `/admin/users` | SUPER_ADMIN | Danh sách users |
| `GET` | `/admin/users/:id` | SUPER_ADMIN | Chi tiết user + hoạt động |
| `PATCH` | `/admin/users/:id/ban` | SUPER_ADMIN | Ban user |
| `PATCH` | `/admin/users/:id/unban` | SUPER_ADMIN | Unban user |
| `GET` | `/admin/logs` | SUPER_ADMIN | System logs |

### Owner Analytics

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/stores/:id/analytics/revenue` | JWT + ownership | Doanh thu |
| `GET` | `/stores/:id/analytics/appointments` | JWT + ownership | Thống kê lịch hẹn |
| `GET` | `/stores/:id/analytics/top-services` | JWT + ownership | Top dịch vụ |
| `GET` | `/stores/:id/analytics/top-staff` | JWT + ownership | Top nhân viên |

### Online Status

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/users/:id/online` | JWT | Check 1 user online không |
| `GET` | `/stores/:id/staff/online` | JWT | Danh sách staff đang online |

---

## XI. Cấu trúc thư mục

```
src/
├── gateways/
│   └── app.gateway.ts          ← WebSocket gateway chung (chat + notifications)
│
├── features/
│   ├── messaging/
│   │   ├── messaging.module.ts
│   │   ├── conversations.controller.ts
│   │   ├── conversations.service.ts
│   │   ├── messages.service.ts
│   │   └── dto/
│   │       ├── create-conversation.dto.ts
│   │       └── send-message.dto.ts
│   │
│   └── admin/
│       ├── admin.module.ts
│       ├── admin-stats.controller.ts
│       ├── admin-users.controller.ts
│       ├── admin-logs.controller.ts
│       ├── admin-stats.service.ts
│       ├── admin-users.service.ts
│       └── dto/
│           ├── admin-user-filter.dto.ts
│           ├── ban-user.dto.ts
│           └── log-filter.dto.ts
│
├── analytics/
│   ├── analytics.module.ts
│   ├── store-analytics.controller.ts
│   ├── store-analytics.service.ts
│   └── dto/
│       └── analytics-filter.dto.ts
│
├── mail/
│   ├── mail.module.ts
│   ├── mail.service.ts
│   └── templates/
│       ├── appointment-confirmed.hbs
│       ├── appointment-reminder.hbs
│       └── ... (các template khác)
│
├── scheduler/
│   ├── scheduler.module.ts
│   ├── reminders.processor.ts  ← Bull processor
│   └── invite-cleanup.cron.ts  ← NestJS cron
│
└── upload/
    ├── upload.module.ts
    └── upload.service.ts       ← Cloudinary upload
```

---

## XII. Frontend — Chi tiết

### `/chat` — Customer: Trang chat

```
Layout: 2 cột
  ┌─────────────────┬──────────────────────────────────────────────┐
  │ CONVERSATIONS   │  Glowora Hà Nội                              │
  │                 │  ─────────────────────────────────────────   │
  │ Glowora HN   • │  [Avatar] Nhân viên   10:30 ✓✓              │
  │ Tin nhắn cuối.. │  Xin chào, tôi muốn hỏi về...               │
  │                 │                                              │
  │ Spa ABC      2  │  [Avatar] Bạn         10:32                 │
  │ Ok bạn nhé...   │  Dạ shop mình đang có dịch vụ X...          │
  │                 │  ─────────────────────────────────────────   │
  │                 │  Đang nhập...                               │
  └─────────────────┴──────────────────────────────────────────────┘
                      ┌──────────────────────────────┐ [Gửi]
                      │ Nhập tin nhắn...              │
                      └──────────────────────────────┘

Unread badge: số đỏ trên conversation item
Read receipts: ✓ (sent) | ✓✓ (delivered) | ✓✓ màu xanh (read)
Typing indicator: animated dots khi đối phương đang gõ
```

### `/dashboard/chat` — Owner/Staff: Trả lời hội thoại

```
Layout tương tự nhưng phía trái là danh sách customers:
  Nguyen Van A (2 tin chưa đọc)
  Tran Thi B
  ...

Owner/Staff xem tất cả conversations của shop mình
```

### `/dashboard/analytics` — Owner Analytics

```
Date range picker: [Tuần này ▼]  [Tháng này] [3 tháng] [Năm nay]

Section 1: KPI Cards
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Doanh thu│ │Lịch hoàn │ │Lịch hủy  │ │Đánh giá  │
  │12.500.000│ │thành: 45 │ │    8     │ │  ★ 4.7   │
  │ +12% ↑  │ │          │ │          │ │          │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘

Section 2: Revenue Chart (recharts AreaChart)
  [Tuần] [Tháng] [Năm]
  Trục X: ngày/tháng | Trục Y: triệu đồng
  Tooltip: hover → xem chi tiết ngày đó

Section 3: Appointment Heatmap
  Ma trận: Hàng = Giờ trong ngày, Cột = Thứ trong tuần
  Màu đậm = nhiều booking → biết giờ/ngày nào bận nhất

Section 4: Top 5 Services (horizontal bar chart)
  Dịch vụ A ████████████ 45 lượt
  Dịch vụ B ████████     32 lượt

Section 5: Top 5 Staff (leaderboard)
  #1 Nguyễn Thị Lan  ★4.9  38 lịch
  #2 Trần Văn Nam    ★4.7  29 lịch
```

### `/admin/dashboard` — Super Admin

```
Section 1: System KPIs
  Tổng shop: 52 (ACTIVE: 48, PENDING: 3, BANNED: 1)
  Tổng users: 1,247 | Mới hôm nay: 12
  Lịch hẹn tháng này: 3,891
  Doanh thu hệ thống: 485.000.000₫

Section 2: Recent Activities
  [Bảng real-time] — các actions gần nhất từ system_log

Section 3: Revenue Chart (toàn hệ thống)
```

### `/admin/users` — Quản lý Users

```
Search bar + Filter [ACTIVE] [BANNED] [Role ▼]

Table:
  Avatar | Họ tên | Email | Role | Tham gia | Lịch hẹn | Status | Actions

Row actions:
  ACTIVE → [Khóa tài khoản]
  BANNED → [Mở khóa]
  Click row → xem profile chi tiết

Dialog "Khóa tài khoản":
  Textarea: Lý do (required)
  [Xác nhận khóa]
```

### `/admin/logs` — System Logs

```
Filter: [Loại hành động ▼] [Từ ngày] [Đến ngày] [Tìm theo actor]

Table:
  Thời gian | Hành động | Thực hiện bởi | Đối tượng | Chi tiết

Màu theo type:
  AUTH_*: gray | STORE_*: blue | USER_BAN: red | PAYMENT_*: green
```

### Cập nhật Navbar — Chat + Notification bell

```
Navbar (khi đã login):
  Logo | Khám phá | [Bell 🔔 badge] | [Chat 💬 badge] | Avatar

Bell dropdown: 5 notifications gần nhất + "Xem tất cả"
Chat badge: tổng unread messages
```

---

## XIII. Thứ tự Implement

### Bước 1 — Schema

- [ ] Verify `Conversation`, `Message` models đã đầy đủ field
- [ ] Thêm model `SystemLog` + enum `LogType`
- [ ] Sửa `User`: thêm `bannedAt`, `banReason`, verify `UserStatus` enum có BANNED
- [ ] `prisma migrate dev --name phase6_chat_analytics_logs`
- [ ] `prisma generate`

### Bước 2 — Socket.IO Gateway

- [ ] Cài packages: `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`
- [ ] Tạo `AppGateway` với JWT middleware
- [ ] Implement: `handleConnection`, `handleDisconnect`, `heartbeat`
- [ ] Register gateway trong AppModule: `providers: [AppGateway]`
- [ ] Test connection từ frontend với `socket.io-client`

### Bước 3 — Chat (REST + Socket)

- [ ] `ConversationsService`:
  - `findOrCreate(customerId, storeId)` — isShopMember check
  - `findMyConversations(userId)` — với unread count
  - `findStoreConversations(storeId, userId)` — ownership check
  - `getUnreadCount(userId)`
- [ ] `MessagesService`:
  - `findByConversation(conversationId, userId, page)` — verify access
  - `createMessage(conversationId, senderId, content)` — lưu DB + update lastMessage
  - `markRead(conversationId, userId)` — update isRead
- [ ] `ConversationsController` — REST routes
- [ ] `AppGateway` — thêm chat events: `join_conversation`, `send_message`, `typing_*`, `mark_read`
- [ ] Inject `MessagesService` vào Gateway để lưu message + emit event

### Bước 4 — Real-time Notifications qua Socket

- [ ] Inject `AppGateway` vào `AppointmentsService`
- [ ] Thêm emit calls sau mỗi appointment transition:
  - `confirm()` → emit `appointment_status_changed` tới customer
  - `create()` → emit `new_appointment` tới owner
  - `reject()`, `complete()`, `cancel()` → emit tương ứng
- [ ] `NotificationsService.create()` → emit `new_notification` tới user qua socket

### Bước 5 — Email SMTP

- [ ] Cài `@nestjs-modules/mailer`, `handlebars`, `nodemailer`
- [ ] Tạo `MailModule`, `MailService`
- [ ] Tạo tất cả templates (.hbs)
- [ ] Thay thế tất cả `console.log('[EMAIL]...')` trong `NotificationsService` bằng `MailService.send*()`
- [ ] Thay `console.log` trong staff invite → `MailService.sendStaffInvite()`
- [ ] Test với Gmail sandbox

### Bước 6 — Appointment Reminders

- [ ] Cài `@nestjs/bull`, `bull`
- [ ] Cài `@nestjs/schedule` (cho cronjobs)
- [ ] `BullModule.registerQueue({ name: 'reminders' })` trong AppModule
- [ ] `RemindersProcessor` — xử lý job `send_reminder`
- [ ] Trong `AppointmentsService.confirm()`: enqueue 2 reminder jobs
- [ ] Trong `AppointmentsService.cancel()`: `queue.removeJobs(pattern)` để hủy reminders
- [ ] `InviteCleanupCron` — expire staff invites mỗi đêm

### Bước 7 — Admin APIs

- [ ] `AdminStatsService`: `getSystemStats()`, `getRevenueChart()`
- [ ] `AdminUsersService`: `findUsers()`, `banUser()`, `unbanUser()`
  - Khi ban: xóa Redis cache `user:status:` và `user:permissions:`
- [ ] `SystemLogService`: `create()` (dùng nội bộ), `findLogs()`
- [ ] Thêm log vào các action quan trọng: store approve/ban, user ban, review hide
- [ ] Sửa `JwtStrategy.validate()`: check `user:status:{id}` từ Redis

### Bước 8 — Owner Analytics

- [ ] `StoreAnalyticsService`: `getRevenue()`, `getAppointmentStats()`, `getTopServices()`, `getTopStaff()`
- [ ] `StoreAnalyticsController`

### Bước 9 — Advanced Search

- [ ] Chạy migration SQL thêm FULLTEXT index (ngoài Prisma)
- [ ] `StoresService.findAllAdvanced()`: full-text + price range + geolocation
- [ ] Cập nhật `StoresController.findAll()` dùng method mới
- [ ] Frontend: cập nhật `/spas` filter sidebar

### Bước 10 — Cloud Storage

- [ ] Đăng ký Cloudinary (free tier)
- [ ] Cài `cloudinary`
- [ ] `UploadService.uploadImage()`: upload buffer → Cloudinary → return URL
- [ ] Thay thế `diskStorage` Multer bằng `memoryStorage` + Cloudinary trong:
  - Store logo/banner
  - Service image
  - Review images (Phase 5)
  - User avatar

### Bước 11 — Frontend

- [ ] Setup Socket.IO client: `npm install socket.io-client`
- [ ] `lib/socket.ts` — singleton socket instance, auto-reconnect
- [ ] `hooks/useSocket.ts` — React hook kết nối socket khi login
- [ ] `hooks/useChat.ts` — quản lý chat state
- [ ] `/chat` — trang chat customer
- [ ] `/dashboard/chat` — trang chat owner/staff
- [ ] `/dashboard/analytics` — trang analytics với recharts
- [ ] `/admin/dashboard` — admin stats
- [ ] `/admin/users` — user management
- [ ] `/admin/logs` — system log viewer
- [ ] Cập nhật Navbar: online socket connect, badge notifications + chat

---

## XIV. Test Cases End-to-End

```bash
# CHAT
# 1. Tạo conversation
POST /conversations { storeId }  [customerToken]
→ 201, { id, customerId, storeId, messages: [] }

# 2. Tạo conversation lần 2 (idempotent - findOrCreate)
POST /conversations { storeId }
→ 200, { id (same) }

# 3. Staff/owner cố tạo conversation với shop mình
POST /conversations { storeId: "my-shop" }  [ownerToken]
→ 403 "Không thể chat với cơ sở bạn đang làm việc"

# 4. Socket: gửi tin nhắn
emit 'send_message' { conversationId, content: "Xin chào" }
→ broadcast 'new_message' tới cả 2 bên trong conversation room
→ Message lưu vào DB

# 5. Typing indicator
emit 'typing_start' { conversationId }
→ đối phương nhận 'user_typing' { isTyping: true }
emit 'typing_stop'
→ đối phương nhận 'user_typing' { isTyping: false }

# ADMIN
# 6. Stats
GET /admin/stats  [adminToken]
→ 200, { stores: { active, pending }, users: { total }, revenue: { thisMonth } }

# 7. Ban user
PATCH /admin/users/:id/ban { reason: "Vi phạm quy định" }
→ 200, { status: "BANNED" }
→ User gọi API → 401 "Tài khoản đã bị khóa"

# 8. Unban
PATCH /admin/users/:id/unban
→ 200, { status: "ACTIVE" }
→ User login lại được

# ANALYTICS
# 9. Revenue chart
GET /stores/:id/analytics/revenue?period=month  [ownerToken]
→ 200, [{ date: "2025-12-01", revenue: 2500000 }, ...]

# 10. Top services
GET /stores/:id/analytics/top-services?limit=3&period=month
→ 200, [{ service: {...}, bookingCount: 45, totalRevenue: 22500000 }]

# REMINDER
# 11. Schedule reminder khi confirm (kiểm tra Bull queue)
PATCH /appointments/:id/confirm  [ownerToken]
→ Bull queue có 2 jobs: reminder-24h-{id}, reminder-1h-{id}

# 12. Cancel appointment → reminder jobs bị xóa
PATCH /appointments/:id/cancel  [customerToken]
→ Bull queue: jobs đã bị remove

# SEARCH
# 13. Full-text search
GET /stores?keyword=chăm sóc da mặt
→ 200, stores có tên/mô tả liên quan, sort by relevance

# 14. Search gần đây
GET /stores?lat=21.0285&lng=105.8542&radiusKm=3
→ 200, stores trong 3km, sort by distance
```

---

## XV. Rủi ro & Lưu ý

| Vấn đề | Giải pháp |
|--------|----------|
| **Socket.IO và NestJS scope** | Gateway là Singleton — inject services cẩn thận, tránh circular dependency |
| **Socket reconnection** | Client tự reconnect với exponential backoff; server room persist qua reconnect |
| **Bull Queue + Redis** | Dùng chung Redis với permission cache — đặt prefix riêng cho Bull: `bull:` |
| **Reminder job vẫn chạy sau cancel** | Luôn gọi `removeJobs()` khi cancel; processor check status trước khi gửi |
| **Gmail App Password** | Không dùng mật khẩu Gmail trực tiếp — bắt buộc App Password |
| **FULLTEXT index trong Prisma migrate** | Phải dùng raw SQL trong migration file; `prisma migrate dev` tự apply |
| **`$queryRaw` với dynamic filters** | Dùng `Prisma.sql` tagged template để tránh SQL injection |
| **Cloudinary URL sau upload** | Lưu URL đầy đủ (secure_url) vào DB; không lưu publicId riêng trừ khi cần xóa |
| **Socket auth token hết hạn** | Client cần refresh token và reconnect socket với token mới |
| **Admin ban + Redis cache stale** | Xóa cả `user:status:` VÀ `user:permissions:` khi ban |
| **Conversation findOrCreate race** | `@@unique([customerId, storeId])` + Prisma `upsert` để tránh duplicate |
| **Analytics raw query timezone** | MySQL DATE_FORMAT dùng server timezone — phải đồng bộ với store.timezone |
| **Typing indicator spam** | Debounce 500ms ở client trước khi emit; server không cần throttle |
| **Geolocation "Gần tôi" thiếu lat/lng** | Nhiều store chưa có lat/lng → fallback sang filter thông thường |
| **Bull job persistence** | Bull lưu job trong Redis — nếu Redis restart, jobs pending bị mất → Phase 6 acceptable |

---

## XVI. Tóm tắt Dependencies cần cài

```bash
# Socket.IO
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
npm install socket.io-client  # (frontend)

# Email
npm install @nestjs-modules/mailer nodemailer handlebars
npm install -D @types/nodemailer

# Bull Queue + Scheduler
npm install @nestjs/bull bull @nestjs/schedule
npm install -D @types/bull

# Cloud Storage
npm install cloudinary

# Timezone & Date
npm install date-fns date-fns-tz  # (đã cài từ Phase 4)

# Frontend Charts
npm install recharts  # (có thể đã cài sẵn)
```

```env
# Socket (không cần thêm — dùng cùng server NestJS)

# Email
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your@gmail.com
MAIL_PASS=your-app-password
MAIL_FROM="Glowora <noreply@glowora.com>"
FRONTEND_URL=http://localhost:3000

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Bull (dùng Redis đã có, chỉ cần prefix)
# Không cần env riêng — dùng REDIS_HOST, REDIS_PORT đã có
```
