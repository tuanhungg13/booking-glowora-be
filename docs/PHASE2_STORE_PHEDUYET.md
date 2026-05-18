# Phase 2 — Quản lý Shop & Phê duyệt (Chi tiết)

> **Prerequisite:** Phase 1 (Auth & RBAC) phải hoàn chỉnh trước — cụ thể: schema có `Role`, `UserRole`, `Permission`, `RolePermission`; seed data đã chạy; `POST /auth/login` trả về token hợp lệ.  
> **Stack:** NestJS 11 · Prisma · MySQL · Redis · Next.js 16

---

## Mục tiêu Phase

1. Owner tạo được cơ sở (shop) — hệ thống lưu trạng thái `PENDING`
2. Super Admin xem xét và phê duyệt / từ chối / khóa shop
3. Shop được cấu hình đầy đủ: giờ mở cửa, địa chỉ, booking config
4. Public listing hiển thị đúng chỉ shop `ACTIVE`
5. Khi tạo shop, RBAC tự động gán OWNER role cho cơ sở đó

---

## I. Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  /spas (public)   /become-owner   /dashboard/shop   /admin/stores │
└─────────────┬───────────────────────────────────────────────────┘
              │ HTTP
┌─────────────▼───────────────────────────────────────────────────┐
│                      NestJS — Store Module                       │
│                                                                   │
│   StoresController          AdminStoresController                 │
│   POST   /stores            GET    /admin/stores                  │
│   GET    /stores            GET    /admin/stores/:id              │
│   GET    /stores/mine       PATCH  /admin/stores/:id/approve      │
│   GET    /stores/:id        PATCH  /admin/stores/:id/reject       │
│   PATCH  /stores/:id        PATCH  /admin/stores/:id/lock         │
│   PUT    /stores/:id/hours  PATCH  /admin/stores/:id/unlock       │
│   POST   /stores/:id/logo                                         │
│   POST   /stores/:id/banner                                       │
│                │                                                   │
│         StoresService                                             │
│           create() ─────────────────────────────────────────────►│
│             │ 1. Tạo Store (PENDING)                              │
│             │ 2. Tạo StoreHour x7 (default)                       │
│             │ 3. Clone OWNER template Role → shop-specific Role   │
│             │ 4. Gán UserRole {owner, shopOwnerRole, storeId}     │
│             │ 5. Invalidate permission cache owner                 │
│             │ 6. Notify Super Admin                                │
└─────────────┬───────────────────────────────────────────────────┘
              │
    ┌─────────┴──────────┐
    │                    │
 MySQL 8              Redis 7
 stores               user:permissions:{userId}  ← invalidate sau khi gán role
 store_hours
 roles (shop-specific)
 user_roles
```

---

## II. Database Schema

### 2.1 Mở rộng model `Store`

**Hiện tại** (thiếu nhiều field):
```prisma
model Store {
  id, ownerId, name, address, phone, logoUrl, description, status
  // Không có: city, district, giờ hoạt động, approval tracking,
  //           booking config, avgRating, slug, bannerUrl, ...
}
```

**Cần sửa thành:**
```prisma
model Store {
  // === Định danh ===
  id       String  @id @default(uuid()) @db.Char(36)
  slug     String? @unique @db.VarChar(200)
  // slug auto-generate từ name, dùng cho URL: /spas/glowora-ha-noi

  // === Chủ sở hữu ===
  ownerId  String  @map("owner_id") @db.Char(36)

  // === Thông tin cơ bản ===
  name        String  @db.VarChar(150)
  phone       String  @db.VarChar(20)
  email       String? @db.VarChar(150)   // email liên hệ của shop
  website     String? @db.VarChar(200)
  description String?

  // === Địa chỉ (tách để filter theo tỉnh/thành) ===
  address  String                        // "123 Nguyễn Du"
  city     String  @db.VarChar(100)      // "Hà Nội" | "TP.HCM" | ...
  district String? @db.VarChar(100)      // "Quận 1" | "Cầu Giấy" | ...
  latitude  Float?                        // Phase 6: tính năng "gần tôi"
  longitude Float?

  // === Hình ảnh ===
  logoUrl   String? @map("logo_url")
  bannerUrl String? @map("banner_url")   // ảnh bìa hiển thị trên listing

  // === Trạng thái phê duyệt ===
  status          StoreStatus @default(PENDING)
  approvedById    String?  @map("approved_by_id") @db.Char(36)
  approvedAt      DateTime? @map("approved_at")
  rejectionReason String?  @map("rejection_reason")
  // rejectionReason dùng cho cả reject (từ chối) lẫn lock (khóa)

  // === Cấu hình đặt lịch ===
  timezone          String  @default("Asia/Ho_Chi_Minh") @db.VarChar(50)
  slotIntervalMins  Int     @default(30)    @map("slot_interval_mins")
  // Bước slot: 30 phút → khách chỉ chọn 8:00, 8:30, 9:00, ...
  cancelBeforeHours Int     @default(2)     @map("cancel_before_hours")
  // Hủy lịch phải thực hiện trước X giờ
  maxAdvanceDays    Int     @default(30)    @map("max_advance_days")
  // Đặt lịch trước tối đa X ngày
  autoConfirm       Boolean @default(false) @map("auto_confirm")
  // true = xác nhận tự động, false = owner phải confirm thủ công

  // === Thống kê (tự động cập nhật sau mỗi review) ===
  avgRating    Decimal @default(0.00) @map("avg_rating") @db.Decimal(3, 2)
  totalReviews Int     @default(0)    @map("total_reviews")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")

  // === Relations ===
  owner        User              @relation("StoreOwner",    fields: [ownerId],      references: [id])
  approvedBy   User?             @relation("StoreApprover", fields: [approvedById], references: [id])
  storeHours   StoreHour[]
  staff        Staff[]
  workingSchedules WorkingSchedule[]
  services     Service[]
  appointments Appointment[]
  roles        Role[]     @relation("ShopRoles")      // Phase 1 RBAC
  userRoles    UserRole[] @relation("UserShopRoles")  // Phase 1 RBAC

  @@index([ownerId])
  @@index([status])
  @@index([city, status])
  @@map("stores")
}
```

### 2.2 Model mới: `StoreHour`

```prisma
// Giờ hoạt động theo từng ngày trong tuần
model StoreHour {
  id        String  @id @default(uuid()) @db.Char(36)
  storeId   String  @map("store_id") @db.Char(36)
  dayOfWeek Int     @map("day_of_week")
  // 0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7
  openTime  String  @map("open_time")  @db.VarChar(5)
  // Format "HH:mm": "08:00", "09:30"
  closeTime String  @map("close_time") @db.VarChar(5)
  // Format "HH:mm": "20:00", "21:30"
  isClosed  Boolean @default(false) @map("is_closed")
  // true = shop nghỉ nguyên ngày hôm đó

  store     Store   @relation(fields: [storeId], references: [id], onDelete: Cascade)

  @@unique([storeId, dayOfWeek])   // mỗi store chỉ 1 record/ngày
  @@index([storeId])
  @@map("store_hours")
}
```

> **Tại sao dùng model riêng thay vì JSON?**
> Phase 4 cần query `WHERE dayOfWeek = ? AND isClosed = false` để tính available slots.
> Nếu lưu JSON thì phải load toàn bộ rồi parse trong code — không hiệu quả.

### 2.3 Sửa model `User` (thêm relation mới)

```prisma
model User {
  // ... giữ nguyên các field ...

  // Thêm relation approver:
  approvedStores Store[] @relation("StoreApprover")
}
```

### 2.4 Giá trị mặc định StoreHour khi tạo shop

```
Thứ 2 (1) → 08:00 – 20:00, isClosed=false
Thứ 3 (2) → 08:00 – 20:00, isClosed=false
Thứ 4 (3) → 08:00 – 20:00, isClosed=false
Thứ 5 (4) → 08:00 – 20:00, isClosed=false
Thứ 6 (5) → 08:00 – 20:00, isClosed=false
Thứ 7 (6) → 08:00 – 20:00, isClosed=false
Chủ nhật (0) → isClosed=true
```

Owner vào `/dashboard/shop/hours` để chỉnh sau.

---

## III. Business Logic & Luồng dữ liệu

### 3.1 Luồng tạo shop (Owner)

```
POST /stores
    │
    ├─ [Guard] JwtAuthGuard → lấy currentUser
    ├─ [Guard] PermissionsGuard → kiểm tra STORE.CREATE
    │
    ▼
StoresService.create(dto, currentUserId)
    │
    ├─ 1. Kiểm tra user đã có shop cùng tên ở cùng địa chỉ chưa (tránh trùng)
    │
    ├─ 2. Generate slug từ name + city
    │       "Glowora Hà Nội" → "glowora-ha-noi"
    │       Nếu slug đã tồn tại → thêm suffix: "glowora-ha-noi-2"
    │
    ├─ 3. prisma.$transaction([
    │       a. Tạo Store { ...dto, slug, status: PENDING, ownerId }
    │
    │       b. Tạo StoreHour x7 (default hours cho store vừa tạo)
    │
    │       c. Tìm template Role { code: 'SHOP_OWNER', shopId: null }
    │          Clone → Role mới { ...template, shopId: store.id, isSystem: false }
    │          Copy toàn bộ RolePermission từ template sang role mới
    │          // Đây là "shop-specific OWNER role" cho cơ sở này
    │
    │       d. Tạo UserRole {
    │            userId:  currentUserId,
    │            roleId:  clonedOwnerRole.id,
    │            shopId:  store.id
    │          }
    │     ])
    │
    ├─ 4. Invalidate Redis permission cache của owner
    │       redis.del(`user:permissions:${currentUserId}`)
    │
    ├─ 5. Gửi thông báo cho Super Admin (in-app Notification)
    │       "Có cơ sở mới đăng ký phê duyệt: [tên shop]"
    │
    └─ 6. Return store (id, name, slug, status: PENDING)

Response 201:
{
  "id": "uuid",
  "name": "Glowora Hà Nội",
  "slug": "glowora-ha-noi",
  "status": "PENDING",
  "message": "Cơ sở đã được đăng ký, vui lòng chờ phê duyệt"
}
```

### 3.2 Luồng phê duyệt (Super Admin)

```
PATCH /admin/stores/:id/approve
    │
    ├─ [Guard] JwtAuthGuard + PermissionsGuard(STORE.APPROVE)
    │
    ▼
AdminStoresService.approve(storeId, adminId)
    │
    ├─ 1. Tìm store, kiểm tra status === PENDING
    │       Nếu không phải PENDING → 400 "Chỉ duyệt được shop đang chờ"
    │
    ├─ 2. Kiểm tra admin không phải owner của shop
    │       store.ownerId !== adminId
    │       (ngăn tự phê duyệt shop của mình)
    │
    ├─ 3. Update Store {
    │       status: ACTIVE,
    │       approvedById: adminId,
    │       approvedAt: new Date()
    │     }
    │
    ├─ 4. Gửi email + Notification cho Owner:
    │       "Chúc mừng! Cơ sở [tên] đã được phê duyệt và hiển thị công khai."
    │
    └─ 5. Return store đã cập nhật

─────────────────────────────────────────

PATCH /admin/stores/:id/reject   Body: { reason: string }
    │
    ├─ 1. status === PENDING → check
    ├─ 2. Update { status: INACTIVE, rejectionReason: reason }
    ├─ 3. Email Owner: "Cơ sở chưa được duyệt. Lý do: {reason}"
    └─ 4. Return store

─────────────────────────────────────────

PATCH /admin/stores/:id/lock     Body: { reason: string }
    │
    ├─ 1. status === ACTIVE → check
    ├─ 2. Update { status: BANNED, rejectionReason: reason }
    ├─ 3. Email Owner: "Cơ sở bị khóa. Lý do: {reason}"
    └─ 4. Return store

─────────────────────────────────────────

PATCH /admin/stores/:id/unlock
    │
    ├─ 1. status === BANNED → check
    ├─ 2. Update { status: ACTIVE, rejectionReason: null }
    ├─ 3. Email Owner: "Cơ sở đã được mở khóa."
    └─ 4. Return store
```

### 3.3 State machine của StoreStatus

```
                  approve()
        ┌────────────────────────────────► ACTIVE ──────────┐
        │                                    │               │
  PENDING ──► reject()                    lock()        unlock()
        │         │                          │               │
        │         ▼                          ▼               │
        └────── INACTIVE               BANNED ──────────────┘
```

| Trạng thái | Hiển thị public | Owner vào dashboard | Khách đặt lịch |
|-----------|----------------|---------------------|----------------|
| `PENDING` | ❌ | ✅ (chỉ đọc) | ❌ |
| `ACTIVE` | ✅ | ✅ (đầy đủ) | ✅ |
| `INACTIVE` | ❌ | ✅ (xem được, sửa để nộp lại) | ❌ |
| `BANNED` | ❌ | ❌ | ❌ |

### 3.4 Slug generation

```typescript
// utils/slugify.ts
import slugify from 'slugify';

async function generateUniqueSlug(
  name: string,
  city: string,
  prisma: PrismaService,
): Promise<string> {
  const base = slugify(`${name} ${city}`, {
    locale: 'vi',
    lower: true,
    strict: true,   // bỏ ký tự đặc biệt
  });
  // "Glowora Hà Nội" → "glowora-ha-noi"

  let slug = base;
  let counter = 2;
  while (await prisma.store.findUnique({ where: { slug } })) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}
```

### 3.5 Guard kiểm tra quyền sở hữu shop

```typescript
// Cho các route: PATCH /stores/:id, PUT /stores/:id/hours, POST /stores/:id/logo
// Kiểm tra currentUser.id === store.ownerId

async checkStoreOwnership(storeId: string, userId: string): Promise<Store> {
  const store = await this.prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundException('Không tìm thấy cơ sở');
  if (store.ownerId !== userId)
    throw new ForbiddenException('Bạn không có quyền thao tác với cơ sở này');
  if (store.status === 'BANNED')
    throw new ForbiddenException('Cơ sở đang bị khóa');
  return store;
}
```

### 3.6 GET /stores — Public listing

```typescript
// Bắt buộc: status = ACTIVE
// Filter:   city, categoryId, minRating, maxPrice
// Sort:     'rating' | 'newest' | 'name'
// Paginate: page, limit (default 12)

async findAll(filter: StoreFilterDto) {
  const where: Prisma.StoreWhereInput = {
    status: 'ACTIVE',
    ...(filter.city && { city: { contains: filter.city } }),
    ...(filter.minRating && { avgRating: { gte: filter.minRating } }),
    ...(filter.categoryId && {
      services: { some: { categoryId: filter.categoryId, isVisible: true } },
    }),
  };

  const orderBy = {
    rating:  { avgRating: 'desc' },
    newest:  { createdAt: 'desc' },
    name:    { name: 'asc' },
  }[filter.sort ?? 'rating'];

  const [data, total] = await prisma.$transaction([
    prisma.store.findMany({
      where, orderBy,
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
      include: {
        storeHours: true,
        _count: { select: { services: { where: { isVisible: true } } } },
      },
    }),
    prisma.store.count({ where }),
  ]);

  return { data, total, page: filter.page, limit: filter.limit };
}
```

### 3.7 GET /stores/:idOrSlug — Public detail

```typescript
async findOne(param: string) {
  // Nhận cả UUID lẫn slug
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(param);
  const where = isUuid ? { id: param } : { slug: param };

  const store = await prisma.store.findUnique({
    where,
    include: {
      storeHours: { orderBy: { dayOfWeek: 'asc' } },
      services: {
        where: { isVisible: true },
        include: { category: true },
        orderBy: { createdAt: 'desc' },
      },
      reviews: {              // top 5 reviews gần nhất
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { fullName: true, avatarUrl: true } } },
      },
      _count: { select: { reviews: true } },
    },
  });

  if (!store || store.status !== 'ACTIVE') throw new NotFoundException();
  return store;
}
```

---

## IV. API Endpoints

### Public (không cần token)

| Method | Endpoint | Query Params | Mô tả |
|--------|----------|-------------|-------|
| `GET` | `/stores` | `city`, `categoryId`, `minRating`, `sort`, `page`, `limit` | Danh sách shop ACTIVE |
| `GET` | `/stores/:idOrSlug` | — | Chi tiết shop + services + reviews + giờ hoạt động |

### Owner (JWT + STORE.CREATE / ownership check)

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `POST` | `/stores` | `STORE.CREATE` | Tạo shop mới → PENDING |
| `GET` | `/stores/mine` | JWT | Danh sách shop của mình (kể cả PENDING) |
| `PATCH` | `/stores/:id` | JWT + ownership | Cập nhật info, config |
| `PUT` | `/stores/:id/hours` | JWT + ownership | Bulk upsert 7 records giờ hoạt động |
| `POST` | `/stores/:id/logo` | JWT + ownership | Upload logo (Multer) |
| `POST` | `/stores/:id/banner` | JWT + ownership | Upload banner (Multer) |

### Super Admin (JWT + STORE.APPROVE / STORE.VIEW)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/admin/stores` | Tất cả shops + filter `status` |
| `GET` | `/admin/stores/:id` | Chi tiết shop (bao gồm rejectionReason) |
| `PATCH` | `/admin/stores/:id/approve` | PENDING → ACTIVE |
| `PATCH` | `/admin/stores/:id/reject` | PENDING → INACTIVE + reason |
| `PATCH` | `/admin/stores/:id/lock` | ACTIVE → BANNED + reason |
| `PATCH` | `/admin/stores/:id/unlock` | BANNED → ACTIVE |

---

## V. DTOs

### `CreateStoreDto`

```typescript
export class CreateStoreDto {
  @IsString() @MinLength(3) @MaxLength(150)
  name: string;

  @IsString()
  address: string;

  @IsString()
  city: string;

  @IsOptional() @IsString()
  district?: string;

  @IsPhoneNumber('VN')
  phone: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsUrl()
  website?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  // Booking config — tất cả optional (dùng default nếu bỏ qua)
  @IsOptional() @IsInt() @Min(15) @Max(120)
  slotIntervalMins?: number;  // default: 30

  @IsOptional() @IsInt() @Min(0) @Max(48)
  cancelBeforeHours?: number; // default: 2

  @IsOptional() @IsInt() @Min(1) @Max(90)
  maxAdvanceDays?: number;    // default: 30

  @IsOptional() @IsBoolean()
  autoConfirm?: boolean;      // default: false
}
```

### `UpdateStoreDto`

```typescript
// PartialType(CreateStoreDto) — tất cả field optional
// Ngoài ra có thêm:
@IsOptional() @IsString() @db.VarChar(50)
timezone?: string;  // "Asia/Ho_Chi_Minh" | "Asia/Bangkok" | ...
```

### `UpdateStoreHoursDto`

```typescript
export class StoreHourItemDto {
  @IsInt() @Min(0) @Max(6)
  dayOfWeek: number;

  @IsString() @Matches(/^\d{2}:\d{2}$/)
  openTime: string;  // "08:00"

  @IsString() @Matches(/^\d{2}:\d{2}$/)
  closeTime: string; // "20:00"

  @IsBoolean()
  isClosed: boolean;
}

export class UpdateStoreHoursDto {
  @ValidateNested({ each: true })
  @Type(() => StoreHourItemDto)
  @ArrayMinSize(7) @ArrayMaxSize(7)
  hours: StoreHourItemDto[];
}
```

### `AdminActionDto`

```typescript
export class AdminActionDto {
  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
  // Optional khi approve, bắt buộc khi reject/lock (validate ở service layer)
}
```

### `StoreFilterDto`

```typescript
export class StoreFilterDto {
  @IsOptional() @IsString()
  city?: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @IsNumber() @Min(1) @Max(5)
  minRating?: number;

  @IsOptional() @IsIn(['rating', 'newest', 'name'])
  sort?: string;  // default: 'rating'

  @IsOptional() @IsInt() @Min(1)
  @Type(() => Number)
  page?: number;  // default: 1

  @IsOptional() @IsInt() @Min(1) @Max(50)
  @Type(() => Number)
  limit?: number; // default: 12
}
```

---

## VI. Cấu trúc thư mục Store Module

```
src/features/
└── stores/                           ← Module mới (chưa có)
    ├── stores.module.ts
    ├── stores.controller.ts          ← Public + Owner routes
    ├── stores.service.ts             ← Business logic
    ├── admin-stores.controller.ts    ← /admin/stores/* routes (tách riêng)
    ├── admin-stores.service.ts       ← Admin-specific logic
    └── dto/
        ├── create-store.dto.ts
        ├── update-store.dto.ts
        ├── update-store-hours.dto.ts
        ├── admin-action.dto.ts
        └── store-filter.dto.ts
```

---

## VII. Permissions cần thêm

File: `src/common/constants/permissions.ts`

```typescript
// Thêm vào object Permissions:
STORE: {
  CREATE: 'CREATE_STORE',   // Owner tạo shop
  VIEW:   'VIEW_STORE',     // Admin xem tất cả shops
  UPDATE: 'UPDATE_STORE',   // Owner cập nhật shop của mình
  DELETE: 'DELETE_STORE',   // Admin xóa/vô hiệu hóa shop
  APPROVE:'APPROVE_STORE',  // Super Admin phê duyệt/khóa
},
```

**Phân quyền mặc định:**

| Permission | CUSTOMER | STAFF | SHOP_OWNER | SUPER_ADMIN |
|-----------|----------|-------|------------|-------------|
| `CREATE_STORE` | ❌ | ❌ | ✅ | ✅ |
| `VIEW_STORE` | ❌ | ❌ | ❌ | ✅ |
| `UPDATE_STORE` | ❌ | ❌ | ✅ (own) | ✅ |
| `APPROVE_STORE` | ❌ | ❌ | ❌ | ✅ |

> Seed data (`seed.sql`) phải được cập nhật để thêm 5 permissions mới và gán đúng cho từng role.

---

## VIII. Tích hợp với Phase 1 RBAC

### Vấn đề cốt lõi

Khi Owner tạo shop, hệ thống RBAC (Phase 1) cần tạo shop-specific role ngay lập tức. Điều này đảm bảo Owner có quyền quản lý shop ngay sau khi tạo, không cần Super Admin gán tay.

### Clone template role

```
seed.sql có Role: { code='SHOP_OWNER', shopId=null, isSystem=true }
                          │ Template role — không dùng trực tiếp

Khi tạo shop mới:
  Clone → Role: { code='SHOP_OWNER', shopId=newStoreId, isSystem=false }
                          │ Shop-specific role — gán cho owner cụ thể

Gán: UserRole { userId=owner, roleId=clonedRole.id, shopId=newStoreId }
```

### Tại sao clone thay vì dùng template?

- Mỗi shop có thể có **quyền khác nhau** (Phase 3: Owner tùy chỉnh quyền cho shop mình)
- Khi xóa shop → xóa shop-specific role mà không ảnh hưởng template
- Permission cache invalidation chỉ ảnh hưởng đúng user/shop liên quan

---

## IX. Upload ảnh (Logo & Banner)

### Cấu hình Multer

```typescript
// Dùng @nestjs/platform-express Multer
// Lưu vào thư mục local: uploads/stores/{storeId}/
// Hoặc Phase 6: tích hợp S3/Cloudinary

const storage = diskStorage({
  destination: `uploads/stores/${storeId}`,
  filename: (req, file, cb) => {
    const ext = extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!file.mimetype.match(/image\/(jpeg|png|webp)/)) {
    cb(new BadRequestException('Chỉ chấp nhận file ảnh JPG, PNG, WebP'), false);
  }
  cb(null, true);
};

// Giới hạn: maxSize = 5MB
```

### Endpoints

```
POST /stores/:id/logo    → Multer single('logo')   → update store.logoUrl
POST /stores/:id/banner  → Multer single('banner')  → update store.bannerUrl
```

---

## X. Frontend — Các trang cần xây dựng

### `/become-owner` — Đăng ký cơ sở (Owner)

```
Layout: 2-step form
  Bước 1: Thông tin cơ bản
    - Tên cơ sở, Địa chỉ, Tỉnh/Thành, Quận/Huyện
    - SĐT liên hệ, Email, Website (optional)
    - Mô tả (textarea)
  Bước 2: Cấu hình
    - Múi giờ (select)
    - Bước slot (15/30/45/60 phút)
    - Hủy lịch trước X giờ
    - Tự xác nhận lịch (toggle)
  Submit → POST /stores → Redirect /dashboard/shop?status=pending
```

### `/dashboard/shop` — Quản lý cơ sở (Owner)

```
Tabs:
  [Thông tin] — form cập nhật thông tin shop, upload logo/banner
  [Giờ hoạt động] — bảng 7 ngày, toggle isClosed, timepicker openTime/closeTime
  [Cấu hình đặt lịch] — slotInterval, cancelBefore, maxAdvanceDays, autoConfirm

Banner: nếu status=PENDING → hiển thị "Đang chờ phê duyệt"
Banner: nếu status=INACTIVE → hiển thị reason + hướng dẫn liên hệ admin
Banner: nếu status=BANNED → hiển thị locked message
```

### `/admin/stores` — Danh sách shops (Super Admin)

```
Table columns: Tên | Địa chỉ | Owner | Ngày tạo | Trạng thái | Actions
Filter: [Tất cả] [Chờ duyệt] [Hoạt động] [Bị từ chối] [Bị khóa]
Actions:
  PENDING  → nút [Duyệt] [Từ chối]
  ACTIVE   → nút [Khóa]
  BANNED   → nút [Mở khóa]
  INACTIVE → nút [Duyệt]
```

### `/admin/stores/:id` — Dialog phê duyệt (Super Admin)

```
Dialog khi click [Từ chối] hoặc [Khóa]:
  Textarea: "Lý do từ chối / khóa" (required)
  Button: [Xác nhận]

Dialog khi click [Duyệt] hoặc [Mở khóa]:
  Confirm: "Bạn có chắc muốn phê duyệt/mở khóa cơ sở này?"
  Button: [Xác nhận]
```

### `/spas` — Listing công khai (thay mock data)

```
Filter sidebar: Tỉnh/Thành, Loại dịch vụ, Rating tối thiểu
Sort: Đánh giá cao nhất | Mới nhất | Tên A-Z
Card: Logo, Tên, Địa chỉ, avgRating, số reviews, giờ hoạt động hôm nay
Pagination
```

### `/spas/[id]` — Chi tiết spa (thay mock data)

```
Header: Banner, Logo, Tên, Rating, Địa chỉ, SĐT, Website
Tabs:
  [Dịch vụ] — danh sách services có isVisible=true
  [Đánh giá] — danh sách reviews
  [Thông tin] — mô tả, giờ hoạt động 7 ngày
Nút [Đặt lịch] → /spas/[id]/book (Phase 4)
```

---

## XI. Thứ tự Implement

### Bước 1 — Cập nhật Schema

- [ ] Mở rộng model `Store`: thêm `slug`, `email`, `website`, `city`, `district`, `latitude`, `longitude`, `bannerUrl`, `approvedById`, `approvedAt`, `rejectionReason`, `timezone`, `slotIntervalMins`, `cancelBeforeHours`, `maxAdvanceDays`, `autoConfirm`, `avgRating`, `totalReviews`
- [ ] Thêm relation `approvedBy` / `approvedStores` vào User
- [ ] Thêm model `StoreHour`
- [ ] Thêm relations `roles` và `userRoles` vào Store (nếu Phase 1 chưa làm)
- [ ] `prisma migrate dev --name phase2_store_config`
- [ ] `prisma generate`

### Bước 2 — Permissions & Seed

- [ ] Thêm `STORE` group vào `permissions.ts` (5 codes mới)
- [ ] Cập nhật `ALL_PERMISSION_CODES` (tự động qua Object.values)
- [ ] Cập nhật `seed.sql`: INSERT 5 permissions mới + gán cho SUPER_ADMIN và SHOP_OWNER

### Bước 3 — Store Module (Backend)

- [ ] Tạo `src/features/stores/stores.module.ts`
- [ ] Tạo tất cả DTOs (`create-store`, `update-store`, `update-store-hours`, `admin-action`, `store-filter`)
- [ ] `stores.service.ts` — implement `create()`:
  - Slug generation
  - Transaction: tạo Store + StoreHour x7 + clone OWNER role + gán UserRole
  - Invalidate Redis cache
- [ ] `stores.service.ts` — implement `findAll()`, `findOne()`, `findMine()`
- [ ] `stores.service.ts` — implement `update()`, `updateHours()`
- [ ] `stores.controller.ts` — public + owner routes + Swagger annotations
- [ ] `admin-stores.service.ts` — implement `approve()`, `reject()`, `lock()`, `unlock()`
- [ ] `admin-stores.controller.ts` — admin routes + Swagger annotations
- [ ] Đăng ký `StoresModule` vào feature module cha

### Bước 4 — Upload ảnh

- [ ] Cài `@types/multer`, cấu hình Multer interceptor
- [ ] Tạo `uploads/stores/` directory (thêm vào `.gitignore`)
- [ ] Implement `POST /stores/:id/logo` và `POST /stores/:id/banner`
- [ ] Serve static files: `app.useStaticAssets('uploads')`

### Bước 5 — Frontend

- [ ] Tạo `lib/stores.api.ts` — các hàm gọi Store API (dùng axios instance từ Phase 1)
- [ ] `/become-owner` — form 2 bước, submit → POST /stores
- [ ] `/dashboard/shop` — tabs: thông tin, giờ hoạt động, cấu hình; banner trạng thái
- [ ] `/admin/stores` — bảng danh sách + filter + nút action
- [ ] `/spas` — thay mock data bằng GET /stores với filter + pagination
- [ ] `/spas/[id]` — thay mock data bằng GET /stores/:slug + giờ hoạt động

### Bước 6 — Kiểm tra End-to-End

```bash
# 1. Tạo shop
POST /stores { name, address, city, phone, ... }
→ 201, status=PENDING, storeHours có 7 records

# 2. Owner xem shop của mình
GET /stores/mine  [Bearer ownerToken]
→ 200, [{ status: "PENDING", ... }]

# 3. Admin xem danh sách pending
GET /admin/stores?status=PENDING  [Bearer adminToken]
→ 200, [{ name, owner.email, status: "PENDING" }]

# 4. Admin duyệt
PATCH /admin/stores/:id/approve  [Bearer adminToken]
→ 200, { status: "ACTIVE", approvedAt: "..." }

# 5. Shop xuất hiện public
GET /stores?city=Hà Nội
→ 200, [{ name, avgRating, storeHours }]

# 6. Khách xem chi tiết bằng slug
GET /stores/glowora-ha-noi
→ 200, { name, services: [...], storeHours: [...], reviews: [...] }

# 7. Admin khóa
PATCH /admin/stores/:id/lock { reason: "Vi phạm chính sách" }
→ 200, { status: "BANNED", rejectionReason: "Vi phạm chính sách" }

# 8. Shop không còn hiện public
GET /stores?city=Hà Nội
→ 200, [] (không có shop nào match)
```

---

## XII. Rủi ro & Lưu ý

| Vấn đề | Giải pháp |
|--------|----------|
| Race condition khi 2 request tạo slug giống nhau cùng lúc | Dùng `@@unique([slug])` + retry loop trong service |
| Clone OWNER role nhưng template chưa có trong DB | Phase 1 seed phải chạy trước; kiểm tra template tồn tại trước khi clone |
| Permission cache của owner chưa được invalidate | Gọi `redis.del(key)` trong cùng transaction callback hoặc ngay sau commit |
| Admin tự phê duyệt shop của mình | Service layer check `store.ownerId !== currentUserId` |
| Upload ảnh lớn ảnh hưởng performance | Multer limit 5MB; Phase 6 chuyển sang S3/Cloudinary + resize |
| `GET /stores/mine` conflict với `GET /stores/:id` | Đặt route `mine` trước route `:id` trong controller, hoặc dùng prefix riêng |
| StoreHour default không phù hợp với từng loại spa | Cho phép Owner cập nhật ngay sau khi tạo từ `/dashboard/shop/hours` |
