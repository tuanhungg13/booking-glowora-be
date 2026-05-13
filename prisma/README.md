# Prisma — Dữ liệu và domain

## Vai trò

File **`schema.prisma`** mô tả toàn bộ model PostgreSQL: user, shop, lịch hẹn, thanh toán, chat, v.v. Đây là **nguồn sự thật** về cấu trúc DB; service layer chỉ “thực thi” quy tắc nghiệp vụ trên các bảng này.

## Cách đọc schema hiệu quả

1. **Enums** — Trạng thái appointment, payment, conversation, v.v. Giúp code không dùng “magic string”.
2. **User & Shop** — Multi-tenant: mỗi shop có owner, roles gắn `shopId`, catalog gắn `shopId`.
3. **Catalog** — `Category` → `Service`, `Combo` + `ComboItem`; không quản lý nguyên vật liệu/kho.
4. **Booking** — `Appointment` 1-n `AppointmentItem`; combo mở rộng parent/child (`COMBO` + `COMBO_CHILD`). `StaffBooking` khóa slot nhân viên theo thời gian.
5. **Payment** — `Payment` 1-1 với appointment; `PaymentTransaction` ghi từng lần charge/refund.
6. **Messaging** — `Conversation`, `Message`; có thể liên kết `appointmentId`.
7. **Staff** — `WorkingHour` (shop), `StaffSchedule`, `StaffDayOff`.

Trong schema có **comment** giải thích các quyết định thiết kế (ví dụ timezone shop, exclude constraint cho `StaffBooking` — có thể cần SQL thủ công sau migrate).

## Prisma trong code

- **`src/prisma/prisma.module.ts`** — Module global export `PrismaService`.
- **`PrismaService`** — Inject vào service để gọi `this.prisma.appointment.create(...)`, v.v.

## Lệnh thường dùng

```bash
npx prisma generate    # Sinh client sau khi đổi schema
npx prisma migrate dev # Tạo migration (dev)
npx prisma studio      # UI xem/sửa dữ liệu (dev)
```

## Biến môi trường

`DATABASE_URL` trỏ tới PostgreSQL (định nghĩa trong `datasource db` của schema / env).
