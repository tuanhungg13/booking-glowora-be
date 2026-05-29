# Kế hoạch: Seed 200 Cửa Hàng Demo — Glowora Platform

> **Cập nhật:** 2026-05-29  
> **Mục tiêu:** Tạo 200 cửa hàng demo đầy đủ dữ liệu, mỗi cửa hàng có nhân viên, dịch vụ, giờ làm việc, tài khoản đăng nhập sẵn sàng dùng cho test và demo.

---

## Mục lục

1. [Tài khoản đăng nhập](#1-tài-khoản-đăng-nhập)
2. [Tổng quan kiến trúc](#2-tổng-quan-kiến-trúc)
3. [UUID — Cách generate đúng chuẩn dự án](#3-uuid--cách-generate-đúng-chuẩn-dự-án)
4. [Cấu trúc file output](#4-cấu-trúc-file-output)
5. [Phân tích ràng buộc DB cần tuân thủ](#5-phân-tích-ràng-buộc-db-cần-tuân-thủ)
6. [Phân loại 200 cửa hàng](#6-phân-loại-200-cửa-hàng)
7. [Phân phối địa lý](#7-phân-phối-địa-lý)
8. [Phase 1 — Generator Script: Skeleton & Helpers](#8-phase-1--generator-script-skeleton--helpers)
9. [Phase 2 — Dữ liệu nền (Templates & Constants)](#9-phase-2--dữ-liệu-nền-templates--constants)
10. [Phase 3 — Users: Owners + Staff](#10-phase-3--users-owners--staff)
11. [Phase 4 — Stores](#11-phase-4--stores)
12. [Phase 5 — Working Hours](#12-phase-5--working-hours)
13. [Phase 6 — User Roles (SHOP_OWNER)](#13-phase-6--user-roles-shop_owner)
14. [Phase 7 — Staff Profiles + User Roles (SHOP_STAFF)](#14-phase-7--staff-profiles--user-roles-shop_staff)
15. [Phase 8 — Staff Schedules](#15-phase-8--staff-schedules)
16. [Phase 9 — Shop-Specific Service Categories](#16-phase-9--shop-specific-service-categories)
17. [Phase 10 — Services + Variants](#17-phase-10--services--variants)
18. [Phase 11 — Staff–Service Assignments](#18-phase-11--staffservice-assignments)
19. [Thứ tự INSERT để tránh FK violation](#19-thứ-tự-insert-để-tránh-fk-violation)
20. [Cách chạy](#20-cách-chạy)
21. [Kiểm tra sau khi seed](#21-kiểm-tra-sau-khi-seed)
22. [Ước tính khối lượng dữ liệu](#22-ước-tính-khối-lượng-dữ-liệu)

---

## 1. Tài khoản đăng nhập

### Mật khẩu chung (tất cả tài khoản demo)
```
Password: Owner@123456
Bcrypt hash: $2b$10$4rNY01kLNBZFcBWQuq.Rsu5P9g490SvP0fZ6PoftwySYtMQTKw/Dq
```
*(Hash này đã có sẵn và dùng lại từ `seed_demo_stores_services.sql` để đồng nhất)*

---

### Tài khoản chủ cửa hàng (200 tài khoản)

| # | Email | Vai trò | Cửa hàng |
|---|---|---|---|
| 1 | `owner.s001@glowora.local` | SHOP_OWNER | Store 001 |
| 2 | `owner.s002@glowora.local` | SHOP_OWNER | Store 002 |
| … | … | … | … |
| 200 | `owner.s200@glowora.local` | SHOP_OWNER | Store 200 |

**Pattern:** `owner.s{NNN}@glowora.local` — NNN là số thứ tự 3 chữ số (001–200)

---

### Tài khoản nhân viên (~800–1,200 tài khoản)

| Pattern | Ví dụ | Giải thích |
|---|---|---|
| `staff.s{SSS}u{UU}@glowora.local` | `staff.s001u01@glowora.local` | Store 001, nhân viên số 01 |

- `SSS` = số thứ tự store (001–200)
- `UU` = số thứ tự nhân viên trong store (01–10)

**Ví dụ cụ thể:**

| Email | Store | Nhân viên thứ |
|---|---|---|
| `staff.s001u01@glowora.local` | Store 001 | 1 |
| `staff.s001u02@glowora.local` | Store 001 | 2 |
| `staff.s050u03@glowora.local` | Store 050 | 3 |
| `staff.s200u05@glowora.local` | Store 200 | 5 |

---

### Tìm danh sách đầy đủ ở đâu?

Sau khi chạy generator, file `prisma/seed_200_accounts.md` sẽ được sinh ra tự động, liệt kê **toàn bộ email + store tương ứng** dạng bảng có thể search được.

Hoặc query thẳng DB:
```sql
-- Xem tất cả chủ cửa hàng
SELECT u.email, s.name as store_name, s.status
FROM users u
JOIN stores s ON s.owner_id = u.id
WHERE u.email LIKE 'owner.s%@glowora.local'
ORDER BY u.email;

-- Xem tất cả nhân viên của store cụ thể (ví dụ store 001)
SELECT u.email, st.specialty, st.status
FROM users u
JOIN staff st ON st.user_id = u.id
JOIN stores s ON s.id = st.store_id
WHERE u.email LIKE 'staff.s001%@glowora.local';
```

---

## 2. Tổng quan kiến trúc

### Approach: TypeScript Generator Script

Thay vì viết ~45,000 dòng SQL thủ công, ta tạo **1 generator script** sinh ra file SQL:

```
prisma/generate_seed_200.ts   ← script generator (chạy 1 lần)
        │
        ▼ output
prisma/seed_200_stores.sql    ← file SQL có thể import trực tiếp vào DB
prisma/seed_200_accounts.md   ← danh sách tài khoản (sinh kèm)
```

**Lý do dùng generator:**
- Random logic (số nhân viên 3–10, số dịch vụ 20–40) cần code
- UUID generation cần `crypto.randomUUID()` — không viết tay được 45k UUIDs
- Dễ re-run, dễ chỉnh sửa template, dễ debug
- Đảm bảo constraint nhất quán (slug unique, FK reference đúng)

---

## 3. UUID — Cách generate đúng chuẩn dự án

### Cách dự án dùng UUID

| Nơi | Cách generate |
|---|---|
| Prisma schema | `@id @default(uuid())` → Prisma tự gen UUID v4 khi insert qua ORM |
| `seed.sql` (roles/permissions) | Hardcode UUID v4 thật, ví dụ: `7b0e395c-e9a3-43c3-9e4e-34aadd5e0b6c` |
| `seed_demo_stores_services.sql` | UUID sequential fake (`10000000-0000-4000-8000-000000000001`) — đúng 36 ký tự nhưng **không phải UUID v4 thật** |

### Quyết định cho file mới

Dùng **`crypto.randomUUID()`** từ Node.js built-in (không cần install thêm package):

```typescript
import { randomUUID } from 'crypto';

const id = randomUUID();
// => "f47ac10b-58cc-4372-a567-0e02b2c3d479"  ← UUID v4 thật, 36 ký tự
```

**Tại sao không dùng sequential fake:**
- Schema dùng `@db.Char(36)` với `@default(uuid())` — rõ ràng thiết kế cho UUID v4
- Tránh collision với data thật khi merge DB
- Đúng với cách Prisma generate trong production

**Không cần install package** vì `@types/node: ^22.10.7` đã bao gồm `crypto.randomUUID()`.

---

## 4. Cấu trúc file output

```
prisma/
├── generate_seed_200.ts          ← script generator (INPUT)
├── seed_200_stores.sql           ← file SQL output (RUN VÀO DB)
├── seed_200_accounts.md          ← danh sách tài khoản (THAM KHẢO)
└── seed_200_stores.run.log       ← log khi chạy generator
```

### Cấu trúc bên trong `seed_200_stores.sql`

```sql
-- ============================================================
-- SEED: 200 Demo Stores — Glowora Platform
-- Generated: {timestamp}
-- Password: Owner@123456
-- ============================================================
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

-- ── SECTION 1: Owner Users (200 records) ─────────────────────
INSERT INTO `users` ...

-- ── SECTION 2: Staff Users (~900-1200 records) ───────────────
INSERT INTO `users` ...

-- ── SECTION 3: Stores (200 records) ──────────────────────────
INSERT INTO `stores` ...

-- ── SECTION 4: Working Hours (200 × 7 = 1,400 records) ───────
INSERT INTO `working_hours` ...

-- ── SECTION 5: User Roles — SHOP_OWNER (200 records) ─────────
INSERT INTO `user_roles` ...

-- ── SECTION 6: Staff Profiles (~900-1200 records) ────────────
INSERT INTO `staff` ...

-- ── SECTION 7: User Roles — SHOP_STAFF (~900-1200 records) ───
INSERT INTO `user_roles` ...

-- ── SECTION 8: Staff Schedules (~4,500 records) ──────────────
INSERT INTO `staff_schedules` ...

-- ── SECTION 9: Services (~6,000 records) ─────────────────────
INSERT INTO `services` ...

-- ── SECTION 10: Service Variants (~14,000 records) ───────────
INSERT INTO `service_variants` ...

-- ── SECTION 11: Staff–Service Assignments (~15,000 records) ──
INSERT INTO `staff_services` ...

COMMIT;
```

---

## 5. Phân tích ràng buộc DB cần tuân thủ

| Bảng | Ràng buộc | Cách xử lý trong generator |
|---|---|---|
| `users` | UNIQUE `email` | Pattern email đảm bảo unique |
| `stores` | UNIQUE `slug` | Sinh slug từ `{brand}-{city}-s{NNN}`, đảm bảo unique |
| `stores` | FK `owner_id → users.id` | Insert owners trước stores |
| `working_hours` | UNIQUE `(store_id, day_of_week)` | Mỗi store insert đúng 7 ngày, không trùng |
| `user_roles` | UNIQUE `(user_id, role_id, shop_id)` | Generator track đã gán chưa, skip nếu duplicate |
| `staff` | UNIQUE `(user_id, store_id)` | Mỗi user chỉ là staff của 1 store trong seed này |
| `staff_schedules` | UNIQUE `(staff_id, day_of_week)` | Mỗi staff insert đúng 5–6 ngày làm việc |
| `services` | UNIQUE `(shop_id, slug)` | Slug service = `{service-slug}-{index}` trong store |
| `service_variants` | FK `service_id → services.id` | Insert services trước variants |
| `staff_services` | PK `(staff_id, service_id)` | Dùng Set để track, skip duplicate |
| `role_permissions` | FK `role_id` từ seed.sql | Dùng `SELECT id FROM roles WHERE code = 'SHOP_OWNER'` |

> **Quan trọng:** `user_roles.shop_id` phải là `store.id` (không phải NULL) khi gán role SHOP_OWNER hoặc SHOP_STAFF. NULL chỉ dành cho SUPER_ADMIN và CUSTOMER system roles.

---

## 6. Phân loại 200 cửa hàng

| # | Loại cửa hàng | Số lượng | Loại dịch vụ chính |
|---|---|---|---|
| 1 | **Spa Nghỉ Dưỡng** | 30 | Massage đá nóng, body wrap, thải độc, xông hơi |
| 2 | **Nail & Beauty Salon** | 25 | Gel nail, đắp bột, vẽ nghệ thuật, pedicure, waxing |
| 3 | **Hair Salon Nữ** | 25 | Cắt, nhuộm, uốn, duỗi, ép, phục hồi tóc |
| 4 | **Barber Shop** | 20 | Cắt tóc nam, cạo râu, gội đầu thảo mộc, beard care |
| 5 | **Skincare Clinic** | 25 | Facial, trị mụn, dưỡng trắng, trẻ hóa, peel da |
| 6 | **Yoga & Wellness Studio** | 15 | Yoga, Pilates, thiền, breathwork, PT cá nhân |
| 7 | **Thẩm Mỹ Viện** | 20 | RF lift, HIFU, điêu khắc mặt, nâng cơ, laser |
| 8 | **Eyelash & Brow Studio** | 15 | Nối mi classic/volume, lift mi, tạo dáng lông mày |
| 9 | **Phun Xăm PMU** | 15 | Phun môi, phun chân mày, phun mí, vi phẫu thẩm mỹ |
| 10 | **Body Care & Tắm Trắng** | 10 | Tắm trắng toàn thân, body scrub, ủ thảo dược |
| | **Tổng** | **200** | |

### Tên cửa hàng — Brand × Suffix

**Brands (20 thương hiệu):**
Glowora, An Nhiên, Lumina, Mộc An, Serene, Aurora, La Vie, Herbal, Bloom, Sakura,
Jade, Aura, Lotus, Pearl, Eden, Velvet, Zenith, Ivory, Rosé, Amber

**Suffixes theo loại:**
| Loại | Suffixes |
|---|---|
| Spa | Spa, Wellness Spa, Day Spa, Spa & Resort, Luxury Spa |
| Nail | Nail Studio, Beauty Bar, Nail & Spa, Nail Lounge |
| Hair (Nữ) | Hair Salon, Hair Studio, Beauty Salon, Tóc & Làm Đẹp |
| Barber | Barbershop, Men's Grooming, Barber & Spa, Classic Barber |
| Skincare | Skin Clinic, Beauty Clinic, Skincare Studio, Derma Spa |
| Yoga | Yoga Studio, Wellness Center, Yoga & Pilates, Mind & Body |
| Thẩm mỹ | Beauty Center, Aesthetic Clinic, Beauty Lab, Thẩm Mỹ Viện |
| Eyelash | Lash Studio, Brow & Lash, Eye Beauty, Lash Lounge |
| PMU | PMU Studio, Phun Xăm Studio, Xăm Thẩm Mỹ, Beauty Art |
| Body Care | Body Studio, Tắm Trắng & Spa, Body Lounge, Care House |

---

## 7. Phân phối địa lý

Sử dụng `province_id` và `ward_id` từ `seed_provinces_wards.sql` đã có sẵn:

| Thành phố | province_id | Số stores | Ward IDs mẫu |
|---|---|---|---|
| TP. Hồ Chí Minh | 29 | 50 | 70101001–70141xxx (Quận 1–12, Bình Thạnh, Gò Vấp…) |
| Hà Nội | 1 | 50 | 10101001–10123xxx (Ba Đình, Hoàn Kiếm, Cầu Giấy…) |
| Đà Nẵng | 21 | 25 | 50101001–50107xxx (Hải Châu, Thanh Khê, Sơn Trà…) |
| Cần Thơ | 33 | 20 | 81501001–81511xxx (Ninh Kiều, Bình Thủy…) |
| Huế | 20 | 15 | 46xxx (Phường Phú Hội, Vĩnh Ninh…) |
| Khánh Hòa | 23 | 15 | 56xxx (Nha Trang) |
| Đồng Nai | 28 | 10 | 75xxx (Biên Hòa) |
| Các tỉnh khác | mix | 15 | Hải Phòng(4), Quảng Ninh(3), Lâm Đồng(3), Bình Dương(5)… |

**Tọa độ (lat, lng):** Sinh ngẫu nhiên trong bounding box của từng tỉnh, dải nhỏ để realistic.

---

## 8. Phase 1 — Generator Script: Skeleton & Helpers

**File:** `prisma/generate_seed_200.ts`

```typescript
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ── Seeded pseudo-random (cho reproducibility khi debug) ─────────────────────
// Dùng store index làm seed → cùng run cho cùng kết quả
function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296;
  };
}

// ── UUID v4 thật từ Node.js built-in ─────────────────────────────────────────
function uuid(): string {
  return randomUUID(); // RFC 4122 UUID v4, 36 ký tự
}

// ── SQL escape ────────────────────────────────────────────────────────────────
function sq(s: string | null): string {
  if (s === null) return 'NULL';
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// ── Pick random item from array ───────────────────────────────────────────────
function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

// ── Random int in range [min, max] inclusive ──────────────────────────────────
function randInt(min: number, max: number, rand: () => number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
```

---

## 9. Phase 2 — Dữ liệu nền (Templates & Constants)

### 9.1 Province & Ward mapping

```typescript
// Lấy từ seed_provinces_wards.sql — map những tỉnh chính ta dùng
const PROVINCE_WARDS: Record<number, number[]> = {
  1:  [10105001, 10101003, 10101004, 10101005, 10107006, 10109009, 10113025, ...], // Hà Nội
  21: [50101001, 50101002, 50103001, ...],  // Đà Nẵng
  29: [70101001, 70103001, 70105001, ...],  // TP.HCM
  33: [81501001, 81501002, ...],            // Cần Thơ
  20: [46xxx, ...],                         // Huế
  23: [56xxx, ...],                         // Khánh Hòa
};

const CITY_COORDS: Record<number, {lat: [number,number], lng: [number,number]}> = {
  1:  { lat: [20.95, 21.10], lng: [105.75, 105.90] },  // Hà Nội
  21: { lat: [15.95, 16.10], lng: [108.15, 108.30] },  // Đà Nẵng
  29: { lat: [10.65, 10.90], lng: [106.55, 106.80] },  // TP.HCM
  33: { lat: [9.95, 10.10],  lng: [105.70, 105.85] },  // Cần Thơ
  20: { lat: [16.40, 16.50], lng: [107.55, 107.65] },  // Huế
  23: { lat: [12.20, 12.30], lng: [109.15, 109.25] },  // Khánh Hòa
};
```

### 9.2 Store type definitions

```typescript
type StoreType = {
  key: string;
  suffixes: string[];
  categorySlug: string;   // slug của service_category toàn hệ thống
  workingPattern: 'standard' | 'late' | 'clinic';
  servicePool: ServiceTemplate[];
};
```

### 9.3 HTML Description Templates

Mỗi loại store có **1 template HTML riêng** với placeholder `{NAME}`, `{CITY}`, `{YEARS}`:

**Ví dụ cho Spa:**
```html
<div class="store-desc">
  <img src="{BANNER_URL}" alt="{NAME}" style="width:100%;border-radius:12px;object-fit:cover;max-height:340px;margin-bottom:16px"/>
  <h2 style="color:#2c3e50;font-size:1.5rem;margin-bottom:8px">{NAME}</h2>
  <p style="color:#555;line-height:1.7">
    Chào mừng bạn đến với <strong>{NAME}</strong> — không gian spa cao cấp
    tọa lạc ngay tại trung tâm {CITY}. Với hơn {YEARS} năm kinh nghiệm trong
    ngành chăm sóc sức khỏe và sắc đẹp, chúng tôi mang đến những liệu trình
    được thiết kế riêng cho từng khách hàng.
  </p>
  <h3 style="color:#2c3e50;margin-top:20px">✨ Điểm nổi bật</h3>
  <ul style="color:#555;line-height:2">
    <li>Không gian thư giãn đạt chuẩn 5 sao, ánh sáng ấm, hương thơm tinh tế</li>
    <li>Đội ngũ chuyên viên được đào tạo bài bản trong và ngoài nước</li>
    <li>Sản phẩm thiên nhiên hữu cơ nhập khẩu từ Pháp, Nhật, Hàn Quốc</li>
    <li>Quy trình chăm sóc cá nhân hóa 100% theo tình trạng da và sức khỏe</li>
    <li>Phòng riêng tư, vệ sinh dụng cụ theo tiêu chuẩn y tế</li>
  </ul>
  <h3 style="color:#2c3e50;margin-top:20px">🌿 Quy trình dịch vụ</h3>
  <ol style="color:#555;line-height:2">
    <li>Tư vấn miễn phí: đánh giá tình trạng da/cơ thể, ghi nhận nhu cầu</li>
    <li>Lựa chọn liệu trình phù hợp với chuyên viên</li>
    <li>Thực hiện dịch vụ trong không gian riêng tư, yên tĩnh</li>
    <li>Chăm sóc sau dịch vụ + hướng dẫn skincare tại nhà</li>
    <li>Hỗ trợ đặt lịch tái khám theo dõi kết quả</li>
  </ol>
  <blockquote style="border-left:4px solid #e67e22;padding:12px 16px;color:#777;font-style:italic;margin-top:16px">
    "Mỗi lần ghé thăm đều như một hành trình phục hồi năng lượng — nhẹ nhàng và đáng nhớ."
  </blockquote>
  <p style="margin-top:16px;color:#555">
    Đặt lịch ngay tại <strong>{NAME}</strong> để trải nghiệm sự khác biệt mà
    hàng nghìn khách hàng tin tưởng lựa chọn.
  </p>
</div>
```

*(9 loại còn lại có template riêng tương tự — Nail, Hair, Barber, Skincare, Yoga, Thẩm Mỹ, Eyelash, PMU, Body Care)*

### 9.4 Tên nhân viên Việt Nam (pool 200 tên)

```typescript
const STAFF_FIRST_NAMES = [
  'Nguyễn Thị', 'Trần Thị', 'Lê Thị', 'Phạm Thị', 'Hoàng Thị',
  'Vũ Thị', 'Đặng Thị', 'Bùi Thị', 'Đỗ Thị', 'Hồ Thị',
  'Nguyễn Văn', 'Trần Văn', 'Lê Văn', 'Phạm Văn', 'Hoàng Văn', ...
];
const STAFF_LAST_NAMES = [
  'Lan', 'Hương', 'Thảo', 'Linh', 'Hà', 'Anh', 'Ngọc', 'Mai',
  'Trang', 'Hoa', 'Vy', 'Châu', 'Yến', 'Diệu', 'Nhung',
  'Nam', 'Hùng', 'Đức', 'Bình', 'Minh', 'Tuấn', 'Long', ...
];
```

### 9.5 Service Templates (per store type)

Mỗi loại store có pool **25–35 dịch vụ mẫu**. Generator chọn ngẫu nhiên 20–40 dịch vụ từ pool.

**Ví dụ pool cho Spa (30 dịch vụ mẫu):**

| # | Tên dịch vụ | Category slug | Variant count | Price range |
|---|---|---|---|---|
| 1 | Massage Thư Giãn Toàn Thân | spa-massage | 3 | 300k–600k |
| 2 | Massage Đá Nóng | spa-massage | 3 | 450k–800k |
| 3 | Massage Thái Trị Liệu | spa-massage | 2 | 400k–700k |
| 4 | Massage Cổ Vai Gáy | spa-massage | 2 | 200k–350k |
| 5 | Massage Chân Phản Xạ | spa-massage | 2 | 150k–280k |
| 6 | Chăm Sóc Da Mặt Cơ Bản | cham-soc-da-mat | 3 | 250k–500k |
| 7 | Facial Dưỡng Trắng Chuyên Sâu | cham-soc-da-mat | 3 | 400k–750k |
| 8 | Trị Mụn Công Nghệ Cao | cham-soc-da-mat | 2 | 300k–600k |
| 9 | Peel Da Hóa Học | cham-soc-da-mat | 2 | 500k–900k |
| 10 | Tắm Trắng Body Toàn Thân | xong-hoi-tam-trang | 3 | 350k–700k |
| 11 | Body Scrub Muối Himalaya | cham-soc-co-the | 2 | 280k–480k |
| 12 | Ủ Body Cà Phê & Collagen | cham-soc-co-the | 2 | 300k–550k |
| 13 | Xông Hơi Thảo Mộc | xong-hoi-tam-trang | 2 | 150k–280k |
| 14 | Ngâm Chân Thảo Dược | spa-massage | 1 | 80k–150k |
| 15 | Gội Đầu Dưỡng Sinh | duong-sinh | 3 | 120k–250k |
| … | … | … | … | … |

**HTML Description mẫu cho dịch vụ "Massage Đá Nóng":**
```html
<div class="service-detail">
  <p style="font-size:1.05rem;color:#333;line-height:1.7">
    <strong>Massage Đá Nóng</strong> là liệu trình trị liệu cao cấp kết hợp
    đá bazan được nung nóng đến 55–60°C với kỹ thuật massage Thụy Điển truyền thống.
    Nhiệt từ đá thẩm thấu sâu vào cơ bắp, giải phóng căng thẳng và tăng cường
    lưu thông máu hiệu quả.
  </p>
  <h4 style="color:#2c3e50;margin-top:16px">📋 Quy trình thực hiện</h4>
  <ol style="color:#555;line-height:2">
    <li>Tư vấn tình trạng sức khỏe & vùng cần tập trung</li>
    <li>Làm ấm cơ thể bằng khăn thảo mộc nóng</li>
    <li>Thoa tinh dầu thiên nhiên toàn thân</li>
    <li>Massage đá nóng theo 7 huyệt chính trên lưng + cột sống</li>
    <li>Massage vai gáy và tứ chi với đá nhiệt</li>
    <li>Hoàn thiện với mặt nạ lạnh làm dịu và se khít lỗ chân lông</li>
  </ol>
  <h4 style="color:#2c3e50;margin-top:16px">💎 Lợi ích</h4>
  <ul style="color:#555;line-height:2">
    <li>Giảm đau cơ, đau lưng và căng thẳng cổ vai gáy hiệu quả</li>
    <li>Cải thiện tuần hoàn máu, giảm mệt mỏi nhanh chóng</li>
    <li>Thải độc qua da, tăng cường trao đổi chất</li>
    <li>Ngủ sâu hơn, tinh thần thư thái sau liệu trình</li>
  </ul>
  <p style="margin-top:12px;color:#888;font-size:0.9rem">
    ⏱ Thời gian: 60–120 phút &nbsp;|&nbsp; 👥 Phù hợp: Người bị đau cơ, stress cao, mất ngủ
  </p>
</div>
```

*(Mỗi dịch vụ mẫu có HTML description riêng, không trùng lặp)*

---

## 10. Phase 3 — Users: Owners + Staff

### Owners (200 records)

```sql
INSERT INTO `users`
  (`id`, `full_name`, `email`, `password`, `phone`, `status`, `created_at`, `updated_at`)
VALUES
  ('{uuid}', 'Chủ {STORE_NAME}', 'owner.s001@glowora.local', '{HASH}',
   '090{NNN}0001', 'ACTIVE', NOW(), NOW()),
  ...
```

### Staff Users (~900–1,200 records)

Số nhân viên mỗi store: **randInt(3, 10, seededRand(storeIndex))**

```sql
INSERT INTO `users`
  (`id`, `full_name`, `email`, `password`, `phone`, `status`, `created_at`, `updated_at`)
VALUES
  ('{uuid}', 'Nguyễn Thị Lan', 'staff.s001u01@glowora.local', '{HASH}',
   '091{storeIdx}{staffIdx}', 'ACTIVE', NOW(), NOW()),
  ...
```

---

## 11. Phase 4 — Stores

Mỗi store có đầy đủ tất cả 19 cột theo schema:

```sql
INSERT INTO `stores` (
  `id`, `slug`, `owner_id`, `name`, `phone`, `email`, `website`,
  `description`,              -- HTML string đầy đủ
  `address`, `district`, `ward_id`, `province_id`,
  `latitude`, `longitude`,
  `logo_url`, `banner_url`,
  `status`,                   -- 'ACTIVE' (đã approved)
  `approved_at`,              -- NOW()
  `timezone`,                 -- 'Asia/Ho_Chi_Minh'
  `slot_interval_mins`,       -- 30
  `cancel_before_hours`,      -- random 2–4
  `max_advance_days`,         -- random 30–45
  `booking_buffer_mins`,      -- random 15–30–45
  `auto_confirm`,             -- random 0 hoặc 1
  `avg_rating`,               -- random 4.2–5.0 (decimal 2 chữ số)
  `total_reviews`,            -- random 10–200
  `created_at`, `updated_at`
)
```

**Logo/Banner URL:** Dùng Unsplash public URLs phân theo loại cửa hàng (15 URLs mỗi loại, rotate theo store index).

---

## 12. Phase 5 — Working Hours

3 pattern làm việc, assign theo loại store:

| Pattern | Loại store | Thứ 2–6 | Thứ 7 | Chủ Nhật |
|---|---|---|---|---|
| `standard` | Spa, Nail, Hair | 08:00–20:00 | 08:00–20:00 | 09:00–18:00 |
| `late` | Barber, Beauty | 10:00–22:00 | 09:00–22:00 | 10:00–20:00 |
| `clinic` | Skincare, PMU, Thẩm mỹ | 09:00–18:00 | 09:00–17:00 | CLOSED (is_closed=1) |

```sql
INSERT INTO `working_hours`
  (`id`, `store_id`, `day_of_week`, `open_time`, `close_time`, `is_closed`)
VALUES
  ('{uuid}', '{store_id}', 'MONDAY', '08:00', '20:00', 0),
  ('{uuid}', '{store_id}', 'TUESDAY', '08:00', '20:00', 0),
  ...7 rows per store...
```

---

## 13. Phase 6 — User Roles (SHOP_OWNER)

Dùng subquery để lấy role_id đúng (không hardcode ID từ seed.sql):

```sql
INSERT INTO `user_roles` (`id`, `user_id`, `role_id`, `shop_id`, `created_at`)
SELECT
  '{uuid}',
  '{owner_user_id}',
  (SELECT `id` FROM `roles` WHERE `code` = 'SHOP_OWNER' AND `shop_id` IS NULL LIMIT 1),
  '{store_id}',
  NOW();
```

> **Lý do dùng subquery:** Role IDs trong `seed.sql` là hardcoded UUIDs cố định, nhưng tránh hardcode để không bị break nếu DB được reset và seed lại.

---

## 14. Phase 7 — Staff Profiles + User Roles (SHOP_STAFF)

### Staff Profile

```sql
INSERT INTO `staff`
  (`id`, `user_id`, `store_id`, `specialty`, `bio`, `rating`, `total_reviews`, `status`, `created_at`, `updated_at`)
VALUES
  ('{uuid}', '{staff_user_id}', '{store_id}',
   'Massage Trị Liệu & Đá Nóng',          -- specialty theo loại store
   'Chuyên viên massage với 5 năm kinh nghiệm. Được đào tạo tại Học viện Massage Quốc tế.',
   4.80,   -- random 4.0–5.0
   42,     -- random 5–150
   'ACTIVE', NOW(), NOW()),
  ...
```

### Staff User Roles

```sql
INSERT INTO `user_roles` (`id`, `user_id`, `role_id`, `shop_id`, `created_at`)
SELECT
  '{uuid}',
  '{staff_user_id}',
  (SELECT `id` FROM `roles` WHERE `code` = 'SHOP_STAFF' AND `shop_id` IS NULL LIMIT 1),
  '{store_id}',
  NOW();
```

---

## 15. Phase 8 — Staff Schedules

Mỗi nhân viên có 1 trong 4 ca làm việc (assign theo hash của staff index):

| Ca | Ngày | Giờ bắt đầu | Giờ kết thúc | Staff index % 4 |
|---|---|---|---|---|
| Full-time | T2, T3, T4, T5, T6, T7 | 09:00 | 18:00 | 0 |
| Weekend+ | T3, T4, T5, T6, T7, CN | 10:00 | 19:00 | 1 |
| Morning | T2, T3, T4, T5, T6 | 08:00 | 14:00 | 2 |
| Evening | T2, T3, T4, T5, T6, T7 | 14:00 | 21:00 | 3 |

```sql
INSERT INTO `staff_schedules`
  (`id`, `shop_id`, `staff_id`, `day_of_week`, `start_time`, `end_time`, `is_active`)
VALUES
  ('{uuid}', '{store_id}', '{staff_id}', 'MONDAY', '09:00', '18:00', 1),
  ('{uuid}', '{store_id}', '{staff_id}', 'TUESDAY', '09:00', '18:00', 1),
  ...
```

---

## 16. Phase 9 — Shop-Specific Service Categories

### Hai tầng category trong hệ thống

```
Global categories (shopId = NULL, có slug)   ← seeded bởi seed.ts (18 categories)
        │
        └── Shop categories (shopId = store_id, slug = NULL, parentId → global)
                ← được tạo trong phase này (5–6 per store)
```

**Phát hiện quan trọng từ `categories.service.ts`:**

| Thuộc tính | Global category | Shop category |
|---|---|---|
| `shopId` | NULL | store_id |
| `slug` | Có (unique toàn hệ thống) | **NULL** (application không set) |
| `parentId` | NULL (hoặc trỏ global) | **Bắt buộc trỏ global** (validator cứng) |
| `@@unique([name, shopId])` | Unique per NULL group | Unique per store |

MySQL cho phép nhiều NULL trong unique index → nhiều shop category có `slug = NULL` là hợp lệ.

---

### 16.1 Template danh mục theo từng loại store

Mỗi store được tạo **5–6 shop-specific categories**, mỗi category có `parentId` trỏ về 1 global category.

#### Spa Nghỉ Dưỡng — 5 danh mục

| # | Tên danh mục | parentId (global slug) | Mô tả |
|---|---|---|---|
| 1 | Massage Trị Liệu | `spa-massage` | Các liệu trình massage thư giãn và phục hồi |
| 2 | Chăm Sóc Da Mặt | `cham-soc-da-mat` | Facial, dưỡng trắng, làm sạch sâu |
| 3 | Tắm Trắng & Xông Hơi | `xong-hoi-tam-trang` | Body whitening, xông hơi thảo mộc |
| 4 | Chăm Sóc Cơ Thể | `cham-soc-co-the` | Body scrub, body wrap, ủ dưỡng |
| 5 | Liệu Trình Đặc Biệt | `spa-massage` | Combo cao cấp, gói nghỉ dưỡng trọn gói |

#### Nail & Beauty Salon — 6 danh mục

| # | Tên danh mục | parentId (global slug) | Mô tả |
|---|---|---|---|
| 1 | Nail Gel & Shellac | `nail-mong-tay` | Sơn gel, shellac, dưỡng móng tay |
| 2 | Nail Bột & Cẩm Thạch | `nail-mong-tay` | Đắp bột acrylic, cẩm thạch, ombre |
| 3 | Vẽ Móng Nghệ Thuật | `nail-mong-tay` | Nail art, vẽ tay, đính đá, foil |
| 4 | Pedicure & Chăm Sóc Chân | `nail-mong-tay` | Pedicure, ngâm chân, chăm sóc gót |
| 5 | Waxing & Triệt Lông | `triet-long` | Wax mặt, tay, chân, bikini |
| 6 | Mi & Lông Mày | `long-may-mi-mat` | Nối mi, tạo dáng lông mày cơ bản |

#### Hair Salon Nữ — 5 danh mục

| # | Tên danh mục | parentId (global slug) | Mô tả |
|---|---|---|---|
| 1 | Cắt & Tạo Kiểu Tóc | `toc-nu` | Cắt layer, cắt tỉa, uốn phồng |
| 2 | Nhuộm Tóc | `toc-nu` | Nhuộm màu, highlight, balayage, ombre |
| 3 | Uốn & Duỗi Tóc | `toc-nu` | Uốn xoăn, uốn sóng, duỗi thẳng |
| 4 | Phục Hồi & Dưỡng Tóc | `toc-nu` | Hấp dầu, keratin, Olaplex, phục hồi |
| 5 | Gội Đầu Thảo Mộc | `toc-nu` | Gội đầu thư giãn, massage đầu, dưỡng chân tóc |

#### Barber Shop — 5 danh mục

| # | Tên danh mục | parentId (global slug) | Mô tả |
|---|---|---|---|
| 1 | Cắt Tóc Nam | `cat-toc-barber` | Fade, undercut, classic, buzz cut |
| 2 | Cạo Râu & Beard Care | `cat-toc-barber` | Cạo râu truyền thống, tỉa beard, dưỡng râu |
| 3 | Gội Đầu & Massage Đầu | `cat-toc-barber` | Gội thảo mộc, massage đầu, xả dầu |
| 4 | Tạo Kiểu & Styling | `cat-toc-barber` | Tạo kiểu vuốt, xịt keo, nhuộm tóc nam |
| 5 | Chăm Sóc Da Nam | `cham-soc-da-mat` | Facial dành riêng cho nam, trị mụn, dưỡng ẩm |

#### Skincare Clinic — 6 danh mục

| # | Tên danh mục | parentId (global slug) | Mô tả |
|---|---|---|---|
| 1 | Chăm Sóc Da Cơ Bản | `cham-soc-da-mat` | Làm sạch, tẩy tế bào chết, dưỡng ẩm |
| 2 | Điều Trị Mụn & Thâm | `cham-soc-da-mat` | Nặn mụn, giảm thâm, kiểm soát nhờn |
| 3 | Dưỡng Trắng & Làm Sáng Da | `cham-soc-da-mat` | Vitamin C, laser toning, brightening |
| 4 | Trẻ Hóa & Chống Lão Hóa | `tham-my-vien` | Collagen, peptide, RF, retinol therapy |
| 5 | Peel Da Hóa Học | `cham-soc-da-mat` | AHA/BHA peel, retinol peel, enzyme peel |
| 6 | Điều Trị Sẹo & Rỗ | `cham-soc-da-mat` | Microneedling, fractional laser, filler sẹo |

#### Yoga & Wellness Studio — 5 danh mục

| # | Tên danh mục | parentId (global slug) | Mô tả |
|---|---|---|---|
| 1 | Yoga Cơ Bản & Nâng Cao | `yoga-thien` | Hatha, Vinyasa, Ashtanga, Yin Yoga |
| 2 | Pilates & Core | `fitness-pt` | Mat Pilates, Reformer Pilates, core training |
| 3 | Thiền & Breathwork | `yoga-thien` | Mindfulness, thiền định, kỹ thuật thở |
| 4 | Personal Training | `fitness-pt` | Huấn luyện cá nhân, xây dựng thể lực |
| 5 | Yoga Trị Liệu | `yoga-thien` | Yoga phục hồi, yoga cho đau lưng, prenatal yoga |

#### Thẩm Mỹ Viện — 6 danh mục

| # | Tên danh mục | parentId (global slug) | Mô tả |
|---|---|---|---|
| 1 | Nâng Cơ & Căng Da | `tham-my-vien` | HIFU, RF, thread lift, nâng cơ không phẫu thuật |
| 2 | Điêu Khắc Khuôn Mặt | `tham-my-vien` | Filler, botox, điêu khắc mũi, cằm V-line |
| 3 | Trẻ Hóa Công Nghệ Cao | `tham-my-vien` | PRP, laser CO2, Thermage, Ultherapy |
| 4 | Triệt Lông Laser | `triet-long` | Laser Diode, IPL, Alexandrite toàn thân |
| 5 | Giảm Béo & Định Hình | `cham-soc-co-the` | Cavitation, Cryolipolysis, EMS sculpting |
| 6 | Điều Trị Thâm Nám & Tàn Nhang | `tham-my-vien` | Laser trị nám, IPL, pico laser |

#### Eyelash & Brow Studio — 5 danh mục

| # | Tên danh mục | parentId (global slug) | Mô tả |
|---|---|---|---|
| 1 | Nối Mi Classic & Volume | `long-may-mi-mat` | Classic 1:1, hybrid, volume 2D–6D |
| 2 | Lift Mi & Uốn Mi | `long-may-mi-mat` | Lift mi keratin, perm mi, nhuộm mi |
| 3 | Tạo Dáng Lông Mày | `long-may-mi-mat` | Wax, thread, tint, tạo dáng theo khuôn mặt |
| 4 | Chăm Sóc Mi Tự Nhiên | `long-may-mi-mat` | Dưỡng mi, serum mi, tháo mi an toàn |
| 5 | Dịch Vụ Combo Mắt | `long-may-mi-mat` | Combo mắt hoàn hảo: mi + lông mày + trang điểm |

#### Phun Xăm PMU — 5 danh mục

| # | Tên danh mục | parentId (global slug) | Mô tả |
|---|---|---|---|
| 1 | Phun Môi Thẩm Mỹ | `phun-xam-tham-my` | Phun môi ombre, lip blush, phủ bóng môi |
| 2 | Phun & Điêu Khắc Chân Mày | `phun-xam-tham-my` | Microblading, powder brow, ombre brow |
| 3 | Phun Mí Mắt | `phun-xam-tham-my` | Phun mí trên/dưới, eyeliner PMU |
| 4 | Chăm Sóc Sau Phun | `phun-xam-tham-my` | Tái khám, bổ sung màu, dưỡng sau phun |
| 5 | Combo Phun Xăm Trọn Gói | `phun-xam-tham-my` | Gói phun môi + chân mày, phun 3 vùng |

#### Body Care & Tắm Trắng — 5 danh mục

| # | Tên danh mục | parentId (global slug) | Mô tả |
|---|---|---|---|
| 1 | Tắm Trắng Toàn Thân | `xong-hoi-tam-trang` | Nước khoáng, glutathione, sữa dê, carbon |
| 2 | Body Scrub & Tẩy Da Chết | `cham-soc-co-the` | Scrub muối, cà phê, đường, thảo mộc |
| 3 | Ủ Body & Mặt Nạ Cơ Thể | `cham-soc-co-the` | Ủ collagen, ủ tinh chất, wrap dưỡng ẩm |
| 4 | Xông Hơi & Ngâm Tắm | `xong-hoi-tam-trang` | Xông hơi khô/ướt, ngâm thảo dược, onsen |
| 5 | Massage Thư Giãn | `spa-massage` | Massage body cơ bản, kết hợp với tắm trắng |

---

### 16.2 SQL Template

**Lưu ý quan trọng:**
- `slug = NULL` — shop category không có slug
- `parent_id` dùng subquery lấy global category theo slug
- `@@unique([name, shopId])` được đảm bảo vì mỗi tên chỉ xuất hiện 1 lần trong 1 store

```sql
-- ── SECTION 9: Shop-Specific Service Categories (~1,050 records) ─────────────
-- Mỗi store: 5–6 categories, slug = NULL, parentId → global category

INSERT INTO `service_categories`
  (`id`, `name`, `slug`, `description`, `icon_url`, `shop_id`, `parent_id`, `created_at`, `updated_at`)
VALUES
  -- Store 001 — Spa (5 categories)
  ('{uuid}', 'Massage Trị Liệu', NULL,
   'Các liệu trình massage thư giãn, trị liệu cơ xương khớp và phục hồi năng lượng.',
   NULL,
   '{store_001_id}',
   (SELECT `id` FROM `service_categories` WHERE `slug` = 'spa-massage' AND `shop_id` IS NULL LIMIT 1),
   NOW(), NOW()),

  ('{uuid}', 'Chăm Sóc Da Mặt', NULL,
   'Facial chuyên sâu, điều trị da, dưỡng trắng và trẻ hóa làn da.',
   NULL,
   '{store_001_id}',
   (SELECT `id` FROM `service_categories` WHERE `slug` = 'cham-soc-da-mat' AND `shop_id` IS NULL LIMIT 1),
   NOW(), NOW()),

  ('{uuid}', 'Tắm Trắng & Xông Hơi', NULL,
   'Tắm trắng toàn thân và xông hơi thảo mộc thanh lọc cơ thể.',
   NULL,
   '{store_001_id}',
   (SELECT `id` FROM `service_categories` WHERE `slug` = 'xong-hoi-tam-trang' AND `shop_id` IS NULL LIMIT 1),
   NOW(), NOW()),

  -- ... (tiếp tục cho các stores khác)
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `updated_at`  = NOW();
```

**Lý do dùng `ON DUPLICATE KEY UPDATE`:** Đảm bảo idempotent khi chạy lại, vì `@@unique([name, shopId])` sẽ bắt duplicate nếu re-run.

---

### 16.3 Mapping services → shop categories

Sau khi tạo categories, mỗi service sẽ được gán `category_id` trỏ đến shop category tương ứng (KHÔNG phải global category):

```
Service "Massage Đá Nóng" → category: "Massage Trị Liệu" (shop category của store đó)
Service "Facial Vitamin C" → category: "Chăm Sóc Da Mặt" (shop category của store đó)
Service "Tắm Trắng Carbon" → category: "Tắm Trắng & Xông Hơi" (shop category của store đó)
```

Generator sẽ map dịch vụ → shop category theo `categoryKey` trong service template:

```typescript
type ServiceTemplate = {
  name: string;
  shopCategoryKey: string;  // key để map sang shop category của store đó
  htmlDescription: string;
  baseSlug: string;
  variantCount: 2 | 3 | 4;
  priceRange: [number, number][];  // per variant
  durationRange: number[];          // per variant (phút)
};

// Ví dụ:
{
  name: 'Massage Đá Nóng',
  shopCategoryKey: 'massage-tri-lieu',  // → shop category tên "Massage Trị Liệu"
  htmlDescription: '...',
  baseSlug: 'massage-da-nong',
  variantCount: 3,
  priceRange: [[350000, 500000], [500000, 700000], [700000, 950000]],
  durationRange: [60, 90, 120],
}
```

---

## 17. Phase 10 — Services + Variants

### Services

Số dịch vụ mỗi store: **randInt(20, 40, seededRand(storeIndex + 1000))**

```sql
INSERT INTO `services`
  (`id`, `shop_id`, `category_id`, `name`, `slug`, `description`, `image_url`, `status`, `avg_rating`, `created_at`, `updated_at`)
VALUES
  ('{uuid}', '{store_id}',
   '{shop_category_id}',    -- UUID của shop category thuộc store này (đã tạo ở Phase 9)
   'Massage Đá Nóng',
   'massage-da-nong-1',     -- slug unique trong store: {service-slug}-{local_index}
   '{HTML_DESCRIPTION}',    -- HTML string đầy đủ như template ở trên
   '{IMAGE_URL}',
   'ACTIVE',
   4.70,    -- random 4.0–5.0
   NOW(), NOW()),
  ...
```

> **Lưu ý:** `category_id` trỏ về **shop category** (shopId = store_id), KHÔNG phải global category.
> Generator tra cứu UUID của shop category bằng map đã build trong bộ nhớ khi xử lý Phase 9.

### Service Variants

**Quy tắc:**
- **10 dịch vụ đầu tiên** của mỗi store: **random 2–4 variants** (bắt buộc)
- **Dịch vụ còn lại:** **random 1–2 variants**

```sql
INSERT INTO `service_variants`
  (`id`, `service_id`, `name`, `description`, `duration`, `price`, `cost_price`, `sort_order`, `status`, `created_at`, `updated_at`)
VALUES
  -- Variant 1: cơ bản
  ('{uuid}', '{service_id}',
   '60 phút - Cơ Bản',
   'Phù hợp lần đầu trải nghiệm, tập trung lưng và vai gáy.',
   60, 350000.00, 180000.00, 0, 'ACTIVE', NOW(), NOW()),

  -- Variant 2: nâng cao
  ('{uuid}', '{service_id}',
   '90 phút - Nâng Cao',
   'Toàn thân, bổ sung massage chân phản xạ và chườm đá nóng.',
   90, 500000.00, 260000.00, 1, 'ACTIVE', NOW(), NOW()),

  -- Variant 3: VIP (nếu có)
  ('{uuid}', '{service_id}',
   '120 phút - VIP Trọn Gói',
   'Trọn gói toàn thân, mặt nạ thảo dược, nước detox và dưỡng ẩm sau liệu trình.',
   120, 720000.00, 380000.00, 2, 'ACTIVE', NOW(), NOW()),
  ...
```

**Price ranges theo loại dịch vụ:**

| Loại dịch vụ | Price variant 1 | Price variant 2 | Price variant 3 |
|---|---|---|---|
| Massage | 200k–400k | 350k–600k | 550k–900k |
| Facial/Skincare | 250k–500k | 450k–750k | 700k–1,200k |
| Nail (gel/bột) | 150k–250k | 280k–420k | 450k–650k |
| Hair (cắt/nhuộm) | 100k–250k | 280k–500k | 550k–900k |
| Waxing/Triệt lông | 100k–200k | 250k–450k | 500k–800k |
| Yoga (session) | 150k–200k | 300k–450k | 500k–800k/tháng |
| PMU (phun xăm) | 1,500k–3,000k | 2,500k–5,000k | 4,000k–8,000k |
| HIFU/RF | 800k–1,500k | 1,500k–3,000k | 3,000k–6,000k |
| Lash extension | 200k–350k | 400k–600k | 650k–950k |

---

## 18. Phase 11 — Staff–Service Assignments

Logic: Mỗi nhân viên được gán **50–70%** dịch vụ của store (random theo staff index).
Đảm bảo: mỗi dịch vụ có **ít nhất 1 nhân viên** thực hiện được.

```sql
INSERT INTO `staff_services` (`staff_id`, `service_id`)
VALUES
  ('{staff_id}', '{service_id_1}'),
  ('{staff_id}', '{service_id_3}'),
  ('{staff_id}', '{service_id_5}'),
  ...
```

**Thuật toán trong generator:**

```typescript
// Sau khi tạo xong staff và services cho 1 store:
for (const service of storeServices) {
  // Đảm bảo mỗi service có ít nhất 1 staff
  const firstStaff = storeStaff[serviceIndex % storeStaff.length];
  assignments.push({ staffId: firstStaff.id, serviceId: service.id });
}

// Random assign thêm
for (const staff of storeStaff) {
  const rand = seededRand(staff.index * 7919);
  for (const service of storeServices) {
    if (rand() < 0.6) { // 60% chance
      assignments.push({ staffId: staff.id, serviceId: service.id });
    }
  }
}

// Deduplicate bằng Set trước khi output SQL
```

---

## 19. Thứ tự INSERT để tránh FK violation

```
1.  users (owners + staff)              — không có FK ngoài
2.  stores                              — FK: owner_id → users.id
3.  working_hours                       — FK: store_id → stores.id
4.  user_roles (SHOP_OWNER)             — FK: user_id → users.id, shop_id → stores.id
5.  staff                               — FK: user_id → users.id, store_id → stores.id
6.  user_roles (SHOP_STAFF)             — FK: user_id → users.id, shop_id → stores.id
7.  staff_schedules                     — FK: staff_id → staff.id, shop_id → stores.id
8.  service_categories (shop-specific)  — FK: shop_id → stores.id, parent_id → service_categories.id (global)
9.  services                            — FK: shop_id → stores.id, category_id → service_categories.id (shop)
10. service_variants                    — FK: service_id → services.id
11. staff_services                      — FK: staff_id → staff.id, service_id → services.id
```

> **Quan trọng bước 8:** Global categories (`slug` không NULL) phải tồn tại TRƯỚC khi insert shop categories.
> Điều này có nghĩa `pnpm run db:seed` (tạo global categories) phải chạy trước `db:seed:200`.

---

## 20. Cách chạy

### Điều kiện tiên quyết

```bash
# Bước 0a: Seed roles, permissions, global categories (nếu chưa có)
pnpm run db:seed

# Bước 0b: Seed provinces & wards (nếu chưa có)
npx prisma db execute --file prisma/seed_provinces_wards.sql
```

### Bước 1: Chạy generator để tạo file SQL

```bash
npx ts-node -r tsconfig-paths/register prisma/generate_seed_200.ts
```

Output:
```
✅ Generating 200 stores...
✅ Section 1:  200  owner users
✅ Section 2:  1,043 staff users
✅ Section 3:  200  stores
✅ Section 4:  1,400 working hours
✅ Section 5:  200  owner roles
✅ Section 6:  1,043 staff profiles
✅ Section 7:  1,043 staff roles
✅ Section 8:  5,215 staff schedules
✅ Section 9:  1,087 shop-specific service categories
✅ Section 10: 5,847 services
✅ Section 11: 14,332 service variants
✅ Section 12: 16,891 staff-service assignments

📄 Output: prisma/seed_200_stores.sql (9.1 MB)
📄 Accounts: prisma/seed_200_accounts.md
⏱  Generation time: 2.5s
```

### Bước 2: Import vào database

```bash
# Option A: qua npm script (thêm vào package.json)
pnpm run db:seed:200

# Option B: trực tiếp với mysql client
mysql -u root -p glowora_business < prisma/seed_200_stores.sql

# Option C: qua prisma db execute
npx prisma db execute --file prisma/seed_200_stores.sql
```

### Thêm script vào `package.json`

```json
"scripts": {
  "db:seed:200": "prisma db execute --file prisma/seed_200_stores.sql"
}
```

---

## 21. Kiểm tra sau khi seed

```sql
-- Đếm tổng
SELECT 'stores' as t, COUNT(*) FROM stores WHERE email LIKE '%@glowora.local'
UNION SELECT 'shop_categories', COUNT(*) FROM service_categories
  WHERE shop_id IN (SELECT id FROM stores WHERE email LIKE '%@glowora.local')
UNION SELECT 'services', COUNT(*) FROM services
  WHERE shop_id IN (SELECT id FROM stores WHERE email LIKE '%@glowora.local')
UNION SELECT 'variants', COUNT(*) FROM service_variants sv
  JOIN services s ON s.id = sv.service_id
  WHERE s.shop_id IN (SELECT id FROM stores WHERE email LIKE '%@glowora.local');

-- Kiểm tra mỗi store có đủ data không
SELECT
  s.name,
  (SELECT COUNT(*) FROM staff WHERE store_id = s.id) as staff_count,
  (SELECT COUNT(*) FROM services WHERE shop_id = s.id) as service_count,
  (SELECT COUNT(*) FROM working_hours WHERE store_id = s.id) as wh_count,
  (SELECT COUNT(*) FROM service_categories WHERE shop_id = s.id) as cat_count
FROM stores s
WHERE s.email LIKE '%@glowora.local'
LIMIT 10;

-- Kiểm tra shop category có parent hợp lệ không
SELECT sc.name, sc.shop_id, p.name as parent_name, p.slug as parent_slug
FROM service_categories sc
JOIN service_categories p ON p.id = sc.parent_id
WHERE sc.shop_id IN (SELECT id FROM stores WHERE email LIKE '%@glowora.local')
  AND p.shop_id IS NULL  -- parent phải là global category
LIMIT 10;

-- Kiểm tra service trỏ đúng shop category (không trỏ global)
SELECT COUNT(*) as wrong_category_count
FROM services s
JOIN service_categories sc ON sc.id = s.category_id
WHERE s.shop_id IN (SELECT id FROM stores WHERE email LIKE '%@glowora.local')
  AND sc.shop_id IS NULL;  -- phải = 0

-- Kiểm tra service có variant không
SELECT s.name, COUNT(sv.id) as variant_count
FROM services s
LEFT JOIN service_variants sv ON sv.service_id = s.id
WHERE s.shop_id IN (SELECT id FROM stores WHERE email LIKE '%@glowora.local')
GROUP BY s.id
HAVING variant_count = 0
LIMIT 5;  -- phải trả về 0 rows
```

**Tiêu chí pass:**
- [ ] Đúng 200 stores mới với status `ACTIVE`
- [ ] Mỗi store có 3–10 staff
- [ ] Mỗi store có 20–40 services
- [ ] Mỗi store có đúng 7 working_hour records
- [ ] Mỗi store có 5–6 shop-specific categories (slug = NULL, parentId → global)
- [ ] Không có service nào trỏ về global category (phải trỏ shop category)
- [ ] Không có service nào có 0 variant
- [ ] Không có service nào có 0 staff được assign
- [ ] Login được với `owner.s001@glowora.local` / `Owner@123456`

---

## 22. Ước tính khối lượng dữ liệu

| Bảng | Min | Avg | Max | Ghi chú |
|---|---|---|---|---|
| users (owners) | 200 | 200 | 200 | |
| users (staff) | 600 | **1,050** | 2,000 | 3–10 per store |
| stores | 200 | 200 | 200 | |
| working_hours | 1,400 | 1,400 | 1,400 | 7 per store |
| user_roles | 800 | **1,250** | 2,200 | owners + staff |
| staff profiles | 600 | **1,050** | 2,000 | |
| staff_schedules | 3,000 | **5,250** | 12,000 | 5–6 days per staff |
| **service_categories (shop)** | **1,000** | **1,087** | **1,200** | **5–6 per store, slug=NULL** |
| services | 4,000 | **5,800** | 8,000 | 20–40 per store |
| service_variants | 5,000 | **13,500** | 32,000 | 1–4 per service |
| staff_services | 8,000 | **16,000** | 40,000 | 50–70% coverage |
| **TỔNG** | **~25,000** | **~46,787** | **~101,200** | |

**File SQL ước tính:** 9–13 MB (do HTML descriptions + category data)  
**Thời gian import:** 20–50 giây (phụ thuộc máy và DB engine)

---

*Kế hoạch này là tài liệu tham chiếu cho quá trình implementation. Mọi thay đổi về số lượng, phân loại, hoặc template nên được cập nhật tại đây trước khi code.*
