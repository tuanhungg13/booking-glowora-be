# Thư mục `src/` — Điểm vào và các lớp

## Vai trò

Đây là toàn bộ mã nguồn ứng dụng NestJS: khởi động, cấu hình module, tích hợp Prisma/Redis, và các **feature** theo domain.

## File nên mở đầu tiên

1. **`main.ts`** — `NestFactory.create(AppModule)`, bật `ValidationPipe` (whitelist, forbid non-whitelisted, transform).
2. **`app.module.ts`** — Danh sách module được import và **hai guard global**:
   - `JwtAuthGuard` — mọi route mặc định cần JWT, trừ khi có `@Public()`.
   - `PermissionsGuard` — nếu handler có `@RequirePermissions()`, kiểm tra permission (có cache Redis).

## Các thư mục con

| Thư mục | Mô tả |
|---------|--------|
| **`common/`** | Decorators (`Public`, `CurrentUser`, `RequirePermissions`, …), pipes — dùng xuyên feature. Xem [common/README.md](common/README.md). |
| **`prisma/`** | `PrismaModule` **@Global()** — inject `PrismaService` ở mọi module mà không cần import lại. |
| **`redis/`** | `RedisModule` — dùng trong `PermissionsGuard` (và có thể mở rộng). |
| **`features/`** | Nghiệp vụ chia theo bounded context: identity, catalog, booking, staff, messaging, notifications. Xem [features/README.md](features/README.md). |

## Luồng một HTTP request (tóm tắt)

1. Request đến controller.
2. **ValidationPipe** chuẩn hóa và validate body/query/params theo DTO.
3. **JwtAuthGuard** — nếu không `@Public()`, xác thực JWT và gắn `user` vào `request`.
4. **PermissionsGuard** — nếu có `@RequirePermissions()`, so khớp permission (Redis → DB fallback).
5. Service gọi **Prisma** (và tùy chỗ **Redis**).

## Liên kết

- [README gốc dự án](../README.md) — lộ trình đọc và sơ đồ tổng thể.
