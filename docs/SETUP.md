# Hướng dẫn khởi tạo & chạy dự án Glowora

---

## 1. Yêu cầu cài đặt trước

| Công cụ | Phiên bản tối thiểu | Ghi chú |
|---------|-------------------|---------|
| Node.js | 20+ | Khuyến nghị LTS |
| pnpm | 8+ | `npm install -g pnpm` |
| Docker Desktop | bất kỳ | Chạy MySQL + Redis |
| Git | bất kỳ | |

> Dự án **không dùng npm/yarn**, chỉ dùng **pnpm** (có `pnpm-lock.yaml`).

---

## 2. Cấu hình file môi trường (`.env`)

File `.env` đặt tại **root dự án** (ngang hàng `package.json`) — NestJS và Prisma đều đọc từ đây.

```env
# App
NODE_ENV=development
APP_NAME=glowora-backend
APP_PORT=8080

# ─── Database (MySQL) ───────────────────────────────────────────
# PrismaService đọc từng biến riêng (MYSQL_HOST, MYSQL_PORT, ...)
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DB=glowora_business
MYSQL_USER=hwglee
MYSQL_PASSWORD=gloworadev
MYSQL_ROOT_PASSWORD=gloworadev

# Prisma CLI đọc biến này khi chạy migrate / generate
DATABASE_URL=mysql://hwglee:gloworadev@127.0.0.1:3306/glowora_business

# ─── Redis ──────────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=gloworadev
REDIS_DB=0

# ─── JWT ────────────────────────────────────────────────────────
JWT_ACCESS_SECRET=gloworajwt123aaaa
JWT_REFRESH_SECRET=glowora123jwtrf
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

> **Quan trọng:** `MYSQL_HOST` phải là `127.0.0.1` khi chạy app trên máy thật (dev local).
> Chỉ dùng `MYSQL_HOST=glowora_mysql` khi app chạy **bên trong Docker network**.

---

## 3. Khởi động MySQL & Redis bằng Docker

```bash
# Đứng tại thư mục gốc dự án
docker-compose up -d
```

Docker tạo 2 container:

| Container | Image | Port expose | Mật khẩu |
|-----------|-------|-------------|-----------|
| `glowora_mysql` | mysql:8.0 | `127.0.0.1:3306` | root: `gloworadev` |
| `glowora_redis` | redis:7-alpine | `127.0.0.1:6379` | `gloworadev` |

Kiểm tra container đang chạy:

```bash
docker ps
```

Kiểm tra MySQL sẵn sàng:

```bash
docker exec glowora_mysql mysqladmin ping -h localhost
# Kết quả: mysqld is alive
```

Kiểm tra Redis:

```bash
docker exec glowora_redis redis-cli -a gloworadev ping
# Kết quả: PONG
```

---

## 4. Cài đặt dependencies

```bash
pnpm install
```

---

## 5. Prisma — Generate client & Migrate database

### 5.1 Generate Prisma Client

Bắt buộc chạy sau `pnpm install` hoặc sau khi sửa `schema.prisma`:

```bash
pnpm prisma generate
```

### 5.2 Chạy migration (tạo bảng trong MySQL)

```bash
pnpm run db:migrate
# tương đương: prisma migrate dev
```

> Migration hiện tại: `20260505153220_init` — chạy lần đầu sẽ tạo toàn bộ 19 bảng từ `schema.prisma`.

### 5.3 Reset database sạch (nếu cần)

```bash
pnpm run db:reset
# = prisma migrate reset --force && pnpm run db:seed
```

> ⚠️ Lệnh này **xóa toàn bộ dữ liệu** — chỉ dùng trong môi trường dev.

---

## 6. Chạy Seed — Dữ liệu khởi tạo

```bash
pnpm run db:seed
```

Seed tạo ra:

| Dữ liệu | Chi tiết |
|---------|---------|
| **54 Permissions** | Toàn bộ permission codes trong hệ thống |
| **4 System Roles** | `SUPER_ADMIN`, `SHOP_OWNER`, `STAFF`, `CUSTOMER` |
| **Role-Permission mapping** | SUPER_ADMIN có full quyền; các role còn lại theo nghiệp vụ |
| **1 Super Admin user** | `admin@glowora.com` / `Admin@123456` |

Output khi seed thành công:

```
🌱 Seeding database...
✅ 54 permissions seeded
✅ System roles seeded
✅ Role permissions seeded
✅ Super Admin seeded (admin@glowora.com)
🎉 Seed completed!
```

> **Quan trọng:** Seed phải chạy **trước khi gọi bất kỳ API nào**.
> Nếu thiếu seed, tạo store sẽ báo lỗi: `SHOP_OWNER template role is missing. Run database seed first.`

---

## 7. Chạy dự án

**Development (hot-reload):**

```bash
pnpm run start:dev
```

**Production:**

```bash
pnpm run build
pnpm run start:prod
```

| Endpoint | URL |
|----------|-----|
| API server | `http://localhost:8080` |
| Swagger UI | `http://localhost:8080/api` |

---

## 8. Thứ tự đầy đủ — Lần đầu cài đặt

```bash
# Bước 1: Vào thư mục dự án
cd D:/DoAnCode/booking-business

# Bước 2: Đảm bảo file .env đã có và đúng
# (kiểm tra MYSQL_HOST=127.0.0.1)

# Bước 3: Cài dependencies
pnpm install

# Bước 4: Khởi động Docker (MySQL + Redis)
docker-compose up -d

# Bước 5: Chờ MySQL sẵn sàng (~15 giây), rồi generate + migrate
pnpm prisma generate
pnpm run db:migrate

# Bước 6: Seed dữ liệu ban đầu
pnpm run db:seed

# Bước 7: Chạy server
pnpm run start:dev
```

---

## 9. Bảng tra cứu biến môi trường

| Biến | Đọc bởi | Ý nghĩa | Giá trị dev |
|------|---------|---------|-------------|
| `DATABASE_URL` | Prisma CLI | Connection string cho migrate/generate | `mysql://hwglee:gloworadev@127.0.0.1:3306/glowora_business` |
| `MYSQL_HOST` | PrismaService | Host kết nối DB (adapter mariadb) | `127.0.0.1` |
| `MYSQL_PORT` | PrismaService | Port MySQL | `3306` |
| `MYSQL_DB` | PrismaService | Tên database | `glowora_business` |
| `MYSQL_USER` | PrismaService + Docker | Username MySQL | `hwglee` |
| `MYSQL_PASSWORD` | PrismaService + Docker | Mật khẩu user | `gloworadev` |
| `MYSQL_ROOT_PASSWORD` | Docker only | Mật khẩu root MySQL | `gloworadev` |
| `REDIS_HOST` | RedisService | Host Redis | `localhost` |
| `REDIS_PORT` | RedisService | Port Redis | `6379` |
| `REDIS_PASSWORD` | RedisService + Docker | Mật khẩu Redis | `gloworadev` |
| `REDIS_DB` | RedisService | Redis database index | `0` |
| `JWT_ACCESS_SECRET` | JwtStrategy | Secret ký access token | _(dùng giá trị mạnh trong prod)_ |
| `JWT_REFRESH_SECRET` | AuthService | Secret ký refresh token | _(dùng giá trị mạnh trong prod)_ |
| `JWT_ACCESS_EXPIRES_IN` | AuthService | Thời hạn access token | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | AuthService | Thời hạn refresh token | `7d` |
| `APP_PORT` | main.ts | Port server lắng nghe | `8080` |
| `NODE_ENV` | PrismaService | Log level Prisma | `development` |

> **Lưu ý kết nối DB:** `PrismaService` dùng `@prisma/adapter-mariadb` (driver-level adapter), kết nối qua các biến `MYSQL_*` riêng lẻ — **không** đọc `DATABASE_URL` lúc runtime. `DATABASE_URL` chỉ dùng cho **Prisma CLI** (`migrate`, `generate`, `studio`).

---

## 10. Một số lỗi thường gặp

### `DATABASE_URL is not defined`
File `.env` chưa có hoặc sai vị trí. Phải nằm ở root dự án, ngang hàng `package.json`.

### `SHOP_OWNER template role is missing`
Chưa chạy seed. Chạy:
```bash
pnpm run db:seed
```

### `Can't reach database server at 127.0.0.1:3306`
Docker chưa chạy hoặc container chưa healthy. Chạy:
```bash
docker-compose up -d
# Chờ 15 giây rồi thử lại
```

### `Redis connection refused`
Redis container chưa chạy, hoặc `REDIS_PASSWORD` trong `.env` không khớp với Docker.
Kiểm tra:
```bash
docker ps
docker logs glowora_redis
```

### `P2002: Unique constraint failed` khi seed
Seed đã chạy trước đó — bình thường, seed dùng `upsert` nên idempotent. Nếu muốn clean slate:
```bash
pnpm run db:reset
```

### Prisma generate lỗi `Cannot find module`
Chạy lại:
```bash
pnpm install
pnpm prisma generate
```

---

## 11. Test API với Postman

Dự án có sẵn Postman collection trong thư mục `test/`:

| File | Nội dung |
|------|---------|
| `test/phase1/phase1-auth-rbac.postman_collection.json` | Auth + RBAC (login, register, roles, permissions) |
| `test/phase1/phase1-env.postman_environment.json` | Biến môi trường Postman phase 1 |
| `test/phase2/phase2-store-management.postman_collection.json` | Quản lý store (tạo, duyệt, khóa) |
| `test/phase2/phase2-env.postman_environment.json` | Biến môi trường Postman phase 2 |

**Cách import:** Postman → **File → Import** → chọn cả file collection + environment → set environment active ở góc trên phải.

**Tài khoản Super Admin mặc định:**

```
Email:    admin@glowora.com
Password: Admin@123456
```

---

## 12. Các lệnh hữu ích khác

```bash
# Mở Prisma Studio (UI duyệt database trên trình duyệt)
pnpm prisma studio

# Xem trạng thái migration
pnpm prisma migrate status

# Lint code
pnpm run lint

# Chạy unit test
pnpm run test

# Chạy test phase 1 (auth)
pnpm run test:phase1

# Chạy test phase 2 (stores)
pnpm run test:phase2

# Chạy test với coverage
pnpm run test:cov

# Dừng Docker containers
docker-compose down

# Dừng và xóa volumes (mất toàn bộ data)
docker-compose down -v
```
