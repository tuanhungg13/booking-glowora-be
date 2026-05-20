# Hướng dẫn chạy Unit Test — Glowora Backend

## Tổng quan

Dự án dùng **Jest** + **ts-jest** để chạy unit test.  
Các test được đặt trong các file `*.spec.ts` cùng cấp với file nguồn.

| File spec | Phase | Nội dung |
|-----------|-------|----------|
| `src/features/identity/auth/auth.service.spec.ts` | Phase 1 | Auth, JWT, refresh token, permission matrix |
| `src/features/stores/stores.service.spec.ts` | Phase 2 | Store owner: tạo store, working hours, ownership |
| `src/features/stores/admin-stores.service.spec.ts` | Phase 2 | Admin: duyệt, từ chối, khóa, mở khóa store |

---

## Yêu cầu

- **Node.js** ≥ 20
- **pnpm** (package manager của dự án)
- Không cần kết nối DB hay Redis — test dùng mock hoàn toàn.

---

## Các lệnh chạy test

### Chạy toàn bộ test
```bash
pnpm test
```

### Chạy test theo phase
```bash
# Phase 1 — Auth + RBAC
pnpm test:phase1

# Phase 2 — Store management
pnpm test:phase2
```

### Chạy test một file cụ thể
```bash
pnpm test auth.service
pnpm test stores.service
pnpm test admin-stores.service
```

### Chạy test watch mode (tự chạy lại khi file thay đổi)
```bash
pnpm test:watch
```
Trong watch mode, nhấn:
- `a` — chạy lại toàn bộ test
- `f` — chỉ chạy test đang fail
- `p` — lọc theo tên file (pattern)
- `t` — lọc theo tên test case
- `q` — thoát

### Chạy test với coverage report
```bash
pnpm test:cov
```
Kết quả coverage được xuất ra thư mục `coverage/` (mở `coverage/lcov-report/index.html` để xem trên browser).

### Chạy test ở chế độ debug (gắn Node.js debugger)
```bash
pnpm test:debug
```
Sau đó mở Chrome → `chrome://inspect` hoặc dùng VS Code debugger để kết nối.

---

## Ví dụ output khi test pass

```
 PASS  src/features/identity/auth/auth.service.spec.ts
  AuthService - Phase 1 Auth and RBAC
    ✓ registers a new user and assigns CUSTOMER system role (8 ms)
    ✓ rejects register when email is already used (2 ms)
    ✓ validates active user credentials and strips password from result (3 ms)
    ✓ login signs access and refresh tokens, then persists refresh token (2 ms)
    ✓ refresh rotates tokens and blacklists the old refresh token (5 ms)
    ✓ rejects refresh when token is blacklisted (1 ms)
    ✓ getMe returns profile with role codes and shop context (2 ms)
    ✓ getMe throws NotFoundException for missing user (1 ms)
    ✓ builds permission matrix from DB and caches granted permissions on cache miss (4 ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
```

---

## Cấu trúc mock trong test

Các test **không** dùng NestJS DI container hay database thật. Thay vào đó, các dependency được mock thủ công:

```typescript
// Ví dụ từ auth.service.spec.ts
prisma = {
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  role: { findFirst: jest.fn() },
};
redis = { exists: jest.fn(), get: jest.fn(), set: jest.fn() };

service = new AuthService(prisma, jwtService, config, redis);
```

Pattern này cho phép test chạy nhanh và độc lập, không cần môi trường running.

---

## Thêm test case mới

1. Mở file `*.spec.ts` tương ứng với service cần test.
2. Thêm test case trong `describe` block hiện có:
```typescript
it('mô tả hành vi cần test', async () => {
  // Arrange: setup mock data
  prisma.user.findUnique.mockResolvedValue({ id: 'user-1', ... });

  // Act: gọi method
  const result = await service.someMethod(input);

  // Assert: kiểm tra kết quả
  expect(result).toEqual(expected);
  expect(prisma.user.findUnique).toHaveBeenCalledWith(expectedQuery);
});
```
3. Chạy `pnpm test:watch` để xem test pass/fail ngay khi lưu file.

---

## Troubleshooting

| Lỗi | Nguyên nhân | Cách xử lý |
|-----|-------------|------------|
| `Cannot find module '@prisma/client'` | Chưa generate Prisma client | Chạy `pnpm prisma generate` |
| `SyntaxError: Cannot use import statement` | ts-jest chưa được cấu hình | Kiểm tra `jest` config trong `package.json` |
| Test timeout | `mockResolvedValue` bị thiếu cho một call | Kiểm tra tất cả Prisma calls trong service method đều được mock |
| `jest.fn() not called` | Service chưa chạy đến dòng đó (do throw trước) | Kiểm tra thứ tự mock setup |
