# Phase 1 — Auth & Phân quyền (Chi tiết)

> Tài liệu này mô tả chi tiết thiết kế và việc cần làm cho Phase 1.  
> Stack: NestJS 11 · Prisma · MySQL · Redis

---

## Phát hiện quan trọng: Schema chưa đồng bộ

`auth.service.ts` và `jwt.strategy.ts` đang tham chiếu các model **chưa có** trong `prisma/schema.prisma`:

| Code đang dùng | Hiện có trong schema.prisma |
|---------------|---------------------------|
| `user.userRoles[]` (relation) | `user.role: Role` (enum đơn) |
| `user.password` | `user.passwordHash` |
| `Role.code`, `Role.shopId`, `Role.permissions[]` | Không có model `Role` |
| `Permission.code` | Không có model `Permission` |
| `UserRole.shopId`, `UserRole.roleId` | Không có model `UserRole` |
| `RolePermission` (join table) | Không có |

**→ Việc đầu tiên: cập nhật `schema.prisma` cho đúng với code đã viết.**

---

## 1. Thiết kế Hệ thống Phân quyền

### 1.1 Mô hình tổng quát

```
User ──< UserRole >── Role ──< RolePermission >── Permission
              │
           (shopId?)
              │
           Store (optional — nếu là shop role)
```

### 1.2 Phân loại Role

| Loại | shopId | Mô tả | Ví dụ |
|------|--------|-------|-------|
| **System role** | `null` | Áp dụng toàn hệ thống | `CUSTOMER`, `SUPER_ADMIN` |
| **Shop role** | `= storeId` | Áp dụng trong phạm vi 1 shop | `OWNER`, `STAFF`, `MANAGER` |

### 1.3 Luật phân quyền

- **Đăng ký tài khoản** → tự động gán system role `CUSTOMER`
- **Tạo shop** → tự động gán shop role `OWNER` (shopId = shop vừa tạo)
- **Được mời làm nhân viên** → gán shop role `STAFF` (shopId = shop mời)
- **Tối đa 3 shop roles** cho 1 tài khoản (không tính system role)
- System role `SUPER_ADMIN` chỉ được gán bởi Super Admin khác

### 1.4 Ma trận Permissions mặc định

| Permission Code | CUSTOMER | STAFF | OWNER | SUPER_ADMIN |
|----------------|----------|-------|-------|-------------|
| `VIEW_SERVICE` | ✅ | ✅ | ✅ | ✅ |
| `CREATE_SERVICE` | ❌ | ❌ | ✅ | ✅ |
| `UPDATE_SERVICE` | ❌ | ❌ | ✅ | ✅ |
| `DELETE_SERVICE` | ❌ | ❌ | ✅ | ✅ |
| `VIEW_APPOINTMENT` | ✅ (own) | ✅ (shop) | ✅ (shop) | ✅ |
| `CREATE_APPOINTMENT` | ✅ | ❌* | ❌* | ✅ |
| `UPDATE_APPOINTMENT` | ❌ | ✅ | ✅ | ✅ |
| `DELETE_APPOINTMENT` | ❌ | ❌ | ✅ | ✅ |
| `VIEW_STAFF_SCHEDULE` | ❌ | ✅ | ✅ | ✅ |
| `CREATE_STAFF_SCHEDULE` | ❌ | ❌ | ✅ | ✅ |
| `VIEW_USER` | ❌ | ❌ | ✅ (own shop) | ✅ |
| `CREATE_ROLE` | ❌ | ❌ | ✅ (shop scope) | ✅ |
| `VIEW_ROLE` | ❌ | ✅ | ✅ | ✅ |
| `CREATE_CATEGORY` | ❌ | ❌ | ❌ | ✅ |

> *STAFF/OWNER có `CREATE_APPOINTMENT` permission nhưng bị chặn **tại service layer** nếu đặt lịch cho chính shop mình (xem mục 4)

---

## 2. Cập nhật Schema Prisma

### 2.1 Models cần thêm/sửa

```prisma
// Xóa enum Role cũ, thay bằng model Role

model Role {
  id          String   @id @default(uuid()) @db.Char(36)
  name        String   @db.VarChar(100)
  code        String   @db.VarChar(50)          // "CUSTOMER", "OWNER", "STAFF", ...
  description String?
  isSystem    Boolean  @default(false) @map("is_system")  // true = system role
  shopId      String?  @map("shop_id") @db.Char(36)      // null = system role

  shop        Store?           @relation("ShopRoles", fields: [shopId], references: [id])
  permissions RolePermission[]
  userRoles   UserRole[]

  @@unique([code, shopId])     // code unique trong scope 1 shop
  @@index([shopId])
  @@map("roles")
}

model Permission {
  id          String   @id @default(uuid()) @db.Char(36)
  code        String   @unique @db.VarChar(100) // "CREATE_SERVICE", ...
  description String?

  roles       RolePermission[]

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
  shopId    String?  @map("shop_id") @db.Char(36)  // null nếu system role
  createdAt DateTime @default(now()) @map("created_at")

  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      Role    @relation(fields: [roleId], references: [id])
  shop      Store?  @relation("UserShopRoles", fields: [shopId], references: [id])

  @@unique([userId, roleId, shopId])
  @@index([userId])
  @@index([shopId])
  @@map("user_roles")
}
```

### 2.2 Sửa model User

```prisma
model User {
  id           String     @id @default(uuid()) @db.Char(36)
  fullName     String     @map("full_name") @db.VarChar(100)
  email        String     @unique @db.VarChar(150)
  password     String                              // ← đổi từ passwordHash
  phone        String?    @db.VarChar(20)
  avatarUrl    String?    @map("avatar_url")
  status       UserStatus @default(ACTIVE)
  refreshToken String?    @map("refresh_token")
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt @map("updated_at")

  // Xóa: role Role @default(CUSTOMER)
  // Thêm:
  userRoles    UserRole[]

  // Relations (giữ nguyên)
  ownedStores    Store[]       @relation("StoreOwner")
  staffProfile   Staff?
  appointments   Appointment[] @relation("CustomerAppointments")
  payments       Payment[]
  reviews        Review[]      @relation("CustomerReviews")
  ...
}
```

### 2.3 Sửa model Store (thêm relations mới)

```prisma
model Store {
  // ... giữ các field hiện có ...

  // Thêm:
  roles     Role[]     @relation("ShopRoles")
  userRoles UserRole[] @relation("UserShopRoles")
}
```

---

## 3. Seed Data

File: `prisma/seed.ts` (hoặc `seed.sql`)

### 3.1 Permissions — tạo từ ALL_PERMISSION_CODES

```typescript
// Tất cả codes từ permissions.ts được insert vào bảng permissions
// VD: { code: 'CREATE_SERVICE', description: 'Tạo dịch vụ mới' }
```

### 3.2 System Roles và Permissions mặc định

```
Role: SUPER_ADMIN (isSystem=true, shopId=null)
  → Tất cả permissions

Role: CUSTOMER (isSystem=true, shopId=null)
  → VIEW_SERVICE, VIEW_CATEGORY, VIEW_COMBO
  → CREATE_APPOINTMENT, VIEW_APPOINTMENT (own)
  → CREATE_PAYMENT, VIEW_PAYMENT (own)
  → CREATE_REVIEW, VIEW_REVIEW
  → CREATE_CONVERSATION, CREATE_MESSAGE, VIEW_MESSAGE

Role: OWNER (isSystem=true, shopId=null) ← template role, clone khi tạo shop
  → Tất cả shop-level permissions
  → VIEW_SERVICE, CREATE_SERVICE, UPDATE_SERVICE, DELETE_SERVICE
  → VIEW_APPOINTMENT, UPDATE_APPOINTMENT, DELETE_APPOINTMENT
  → CREATE_STAFF_SCHEDULE, UPDATE_STAFF_SCHEDULE, VIEW_STAFF_SCHEDULE
  → CREATE_ROLE (shop scope), VIEW_ROLE, UPDATE_ROLE
  → VIEW_USER (own shop)

Role: STAFF (isSystem=true, shopId=null) ← template role, clone khi tạo shop
  → VIEW_SERVICE
  → VIEW_APPOINTMENT, UPDATE_APPOINTMENT
  → VIEW_STAFF_SCHEDULE, CREATE_STAFF_DAY_OFF
  → VIEW_ROLE
```

### 3.3 Super Admin account

```
Email: admin@glowora.com
Password: Admin@123456
→ Gán UserRole: SUPER_ADMIN system role
```

---

## 4. Business Rules Đặc biệt

### 4.1 Chặn đặt lịch / chat với shop mình làm việc

**Vị trí xử lý:** Service layer (không phải Guard — vì cần storeId từ request body)

```typescript
// appointments.service.ts — create()
async create(dto: CreateAppointmentDto, currentUserId: string) {
  // Kiểm tra user có liên kết với shop này không
  const isShopMember = await this.prisma.userRole.findFirst({
    where: {
      userId: currentUserId,
      shopId: dto.storeId,
    },
  });
  if (isShopMember) {
    throw new ForbiddenException(
      'Không thể đặt lịch tại cơ sở bạn đang làm việc'
    );
  }
  // ... tiếp tục tạo appointment
}
```

```typescript
// conversations.service.ts — create()
async create(dto: CreateConversationDto, currentUserId: string) {
  const isShopMember = await this.prisma.userRole.findFirst({
    where: { userId: currentUserId, shopId: dto.storeId },
  });
  if (isShopMember) {
    throw new ForbiddenException(
      'Không thể mở chat với cơ sở bạn đang làm việc'
    );
  }
}
```

### 4.2 Giới hạn tối đa 3 shop roles / tài khoản

**Vị trí xử lý:** `users.service.ts` — khi assign role

```typescript
async assignShopRole(userId: string, roleId: string, shopId: string) {
  // Đếm shop roles hiện tại (không tính system roles)
  const shopRoleCount = await this.prisma.userRole.count({
    where: {
      userId,
      shopId: { not: null },  // chỉ tính shop roles
    },
  });
  if (shopRoleCount >= 3) {
    throw new BadRequestException(
      'Tài khoản đã đạt giới hạn 3 vai trò tại các cơ sở'
    );
  }
  // ... tiếp tục gán role
}
```

**Lưu ý:** Khi chủ shop tạo shop mới, bị tính 1 shop role. Khi được mời làm nhân viên thêm shop, bị tính thêm 1.

### 4.3 Nhân viên được mời — flow

```
Owner gửi invite (email)
→ Tạo StaffInvite record (token, email, storeId, expires)
→ Gửi email với link: /accept-invite?token=xxx
→ User click link → hệ thống gán UserRole STAFF cho storeId
→ Trừ 1 slot trong quota 3 shop roles
```

---

## 5. Auth Endpoints cần hoàn thiện

### Hiện có
- `POST /auth/login` ✅ (có, hoạt động)
- `POST /auth/register` ✅ (có, nhưng chưa gán CUSTOMER role)
- `GET /auth/getMatrix` ✅ (có)

### Cần thêm

#### `POST /auth/refresh`
```
Body: { refreshToken: string }
Logic:
  1. Verify refreshToken (JWT)
  2. Kiểm tra refreshToken có trong Redis blacklist không → nếu có → 401
  3. Tìm user, kiểm tra user.refreshToken === input refreshToken
  4. Tạo access_token mới (15 phút)
  5. Tạo refresh_token mới (7 ngày), lưu vào user.refreshToken
Response: { access_token, refresh_token }
```

#### `POST /auth/logout`
```
Body: { refreshToken: string }
Logic:
  1. Lấy userId từ JWT access token (header Authorization)
  2. Blacklist refreshToken trong Redis (TTL = thời gian còn lại của token)
  3. Xóa user.refreshToken trong DB
Response: { success: true }
```

#### `GET /auth/me`
```
Logic: Lấy CurrentUser từ JWT → query DB → trả về profile + roles + shopIds
Response: {
  id, email, fullName, phone, avatarUrl, status,
  roles: [{ code, name, shopId }]
}
```

### Cần sửa

#### `POST /auth/register`
```
Hiện tại: chỉ tạo User, chưa gán role
Cần thêm:
  1. Tạo User (hash password)
  2. Tìm system role CUSTOMER
  3. Tạo UserRole { userId, roleId: CUSTOMER.id, shopId: null }
  4. Không tạo shop (shop chỉ tạo khi user chủ động tạo)
```

#### `POST /auth/login`
```
Cần thêm vào response:
  - refresh_token (generate + lưu DB)
  - user.roles với shopId context
```

---

## 6. JWT & Token Strategy

### Access Token (15 phút)
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "iat": 1234567890,
  "exp": 1234568790
}
```
> Payload nhỏ, không embed permissions → permissions load từ Redis cache

### Refresh Token (7 ngày)
- Lưu hash vào `user.refreshToken` trong DB
- Blacklist trong Redis khi logout (key: `blacklist:refresh:{token}`, TTL = remaining time)

### Permission Cache (Redis)
```
Key:   user:permissions:{userId}
Value: JSON array of permission codes
TTL:   300 giây (5 phút)

Invalidate khi:
  - Role của user thay đổi
  - Permission của role thay đổi
  - User bị ban
```

---

## 7. Guard & Decorator Flow

### Request lifecycle

```
HTTP Request
    │
    ▼
JwtAuthGuard (global)
  - Bỏ qua nếu @Public()
  - Validate access_token
  - Attach user vào request: { id, email, status, roles }
    │
    ▼
PermissionsGuard (global)
  - Đọc @RequirePermissions() decorator
  - Nếu không có decorator → cho qua
  - Nếu có → load permissions từ Redis (hoặc DB)
  - Kiểm tra user có đủ permission không
    │
    ▼
Controller Handler
  - @CurrentUser() lấy user từ request
  - @RequirePermissions('CREATE_SERVICE') đã được check ở trên
```

### Decorators hiện có (giữ nguyên)
- `@Public()` — bỏ qua JWT
- `@CurrentUser()` — inject user payload
- `@RequirePermissions(...codes)` — require permission codes
- `@ShopPermission()` — shop-level guard (xem mục 4)

---

## 8. Shop Permission Guard (nâng cao)

File: `src/common/guards/shop-permission.guard.ts` (đã có skeleton)

**Mục đích:** Kiểm tra user có quyền thao tác với shop cụ thể không.

```typescript
// Dùng cho các route: PATCH /stores/:storeId/services/:id
// User phải có UserRole với shopId = storeId

@Injectable()
export class ShopPermissionGuard implements CanActivate {
  canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const storeId = request.params.storeId;

    if (!storeId) return true; // Không phải shop route

    // User phải có role trong shop này
    return this.prisma.userRole
      .findFirst({ where: { userId: user.id, shopId: storeId } })
      .then((ur) => !!ur);
  }
}
```

---

## 9. Thứ tự Implement

### Bước 1 — Cập nhật Schema (làm trước tiên)
- [ ] Sửa `prisma/schema.prisma`: thêm `Role`, `Permission`, `RolePermission`, `UserRole`
- [ ] Sửa `User` model: đổi `passwordHash` → `password`, xóa `role` enum, thêm `userRoles`
- [ ] Sửa `Store` model: thêm `roles` và `userRoles` relations
- [ ] Chạy `prisma migrate dev --name add_rbac_models`
- [ ] Chạy `prisma generate`

### Bước 2 — Seed Data
- [ ] Tạo `prisma/seed.ts`
- [ ] Seed tất cả Permission codes từ `permissions.ts`
- [ ] Seed 4 system roles: `CUSTOMER`, `STAFF` (template), `OWNER` (template), `SUPER_ADMIN`
- [ ] Seed permissions cho từng role theo ma trận ở mục 1.4
- [ ] Seed user Super Admin: `admin@glowora.com / Admin@123456`
- [ ] Chạy `prisma db seed`

### Bước 3 — Hoàn thiện Auth Service
- [ ] Sửa `register()`: gán CUSTOMER role sau khi tạo user
- [ ] Sửa `login()`: generate refresh_token, lưu DB, trả về cả hai tokens
- [ ] Thêm `refresh()`: validate + rotate refresh token
- [ ] Thêm `logout()`: blacklist refresh token trong Redis
- [ ] Thêm `getMe()`: trả về profile + roles với shopId context

### Bước 4 — Hoàn thiện Auth Controller
- [ ] `POST /auth/refresh`
- [ ] `POST /auth/logout`
- [ ] `GET /auth/me`
- [ ] Swagger annotation cho tất cả endpoints

### Bước 5 — User Service cơ bản
- [ ] `GET /users/:id` — xem profile
- [ ] `PATCH /users/:id` — cập nhật fullName, phone, avatarUrl
- [ ] `PATCH /users/:id/roles` — Super Admin gán/xóa role (có check max 3 shop roles)

### Bước 6 — Verify Guards hoạt động đúng
- [ ] Kiểm tra `JwtAuthGuard` đang import đúng (`jwt-auth.guard.ts` vs `jwt.guard.ts` — hiện có 2 file)
- [ ] Kiểm tra `PermissionsGuard` load permission từ Redis đúng
- [ ] Test: route cần quyền → 401 nếu không có token → 403 nếu thiếu permission

### Bước 7 — Frontend
- [ ] `lib/api.ts` — Axios instance với interceptor
- [ ] `contexts/auth-context.tsx` — user state, login/logout actions
- [ ] `app/(auth)/login/page.tsx` — form login
- [ ] `app/(auth)/register/page.tsx` — form đăng ký
- [ ] `middleware.ts` — bảo vệ route theo role

---

## 10. Frontend — Chi tiết

### `lib/api.ts`
```typescript
// Axios instance tự động:
// - Gắn Authorization: Bearer {accessToken}
// - Khi nhận 401 → gọi /auth/refresh → retry request gốc
// - Khi refresh thất bại → redirect /login
```

### `contexts/auth-context.tsx`
```typescript
// Cung cấp:
interface AuthContextType {
  user: UserProfile | null;     // từ /auth/me
  isLoading: boolean;
  login: (email, password) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (roleCode: string) => boolean;
  isShopMember: (shopId: string) => boolean; // dùng để ẩn nút "Đặt lịch"
}
```

### `middleware.ts`
```typescript
// Route protection rules:
// /dashboard/*  → cần login, phải có OWNER hoặc STAFF role
// /admin/*      → cần login, phải có SUPER_ADMIN role
// /login, /register → redirect về / nếu đã login
```

### Trang Login
- Email + Password fields (react-hook-form + zod)
- Remember me (lưu refresh token)
- Link "Quên mật khẩu" (Phase 6)
- Link "Đăng ký"

### Trang Register
- Bước 1: Chọn loại tài khoản (Khách hàng / Chủ cơ sở)
  - Khách hàng → form đơn giản → register → redirect /
  - Chủ cơ sở → form register → sau đó redirect /become-owner (Phase 2)
- FullName, Email, Password, Confirm Password
- Validate: email unique (check realtime), password strength

---

## 11. Kiểm tra Phase 1 Hoàn chỉnh

### Test cases Backend

```bash
# 1. Đăng ký
POST /auth/register { email, password, fullName }
→ 201, user được gán role CUSTOMER tự động

# 2. Đăng nhập
POST /auth/login { email, password }
→ 200, { access_token, refresh_token, user: { roles: ['CUSTOMER'] } }

# 3. Xem thông tin
GET /auth/me  [Bearer access_token]
→ 200, { id, email, fullName, roles: [{ code: 'CUSTOMER', shopId: null }] }

# 4. Route không có token
GET /auth/me
→ 401 Unauthorized

# 5. Route cần permission CUSTOMER không có
POST /services  [Bearer customer_token]  (cần CREATE_SERVICE)
→ 403 Forbidden

# 6. Refresh token
POST /auth/refresh { refreshToken }
→ 200, { access_token, refresh_token }

# 7. Logout
POST /auth/logout  [Bearer access_token]
→ 200, refresh token bị blacklist
POST /auth/refresh { refreshToken }  (sau khi logout)
→ 401 (token đã bị blacklist)

# 8. Super Admin role
GET /auth/me  [Bearer superadmin_token]
→ roles: [{ code: 'SUPER_ADMIN', shopId: null }]
```

### Test cases Business Rules

```bash
# 9. Max 3 shop roles
PATCH /users/:id/roles { roleId: ownerRole, shopId: shop4 }
(user đã có 3 shop roles)
→ 400 "Đã đạt giới hạn 3 vai trò"

# 10. Chặn đặt lịch shop mình
POST /appointments { storeId: "shop_where_i_work", ... }  [Bearer staff_token]
→ 403 "Không thể đặt lịch tại cơ sở bạn đang làm việc"
```

---

## 12. Lưu ý và Rủi ro

| Vấn đề | Giải pháp |
|--------|----------|
| 2 file guard trùng tên: `jwt.guard.ts` vs `jwt-auth.guard.ts` | Xóa bỏ 1 file, thống nhất dùng `jwt-auth.guard.ts` |
| `schema.prisma` dùng `passwordHash`, code dùng `password` | Cập nhật schema theo code (field name: `password`) |
| Refresh token chưa implement | Implement trong Bước 3, dùng Redis blacklist |
| Permission cache stale khi role thay đổi | `PermissionCacheService.invalidateUser()` phải được gọi mỗi khi UserRole thay đổi |
| Template roles (OWNER, STAFF) vs shop-specific roles | Khi tạo shop: clone template role với shopId, không dùng trực tiếp template |
