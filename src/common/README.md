# `src/common/` — Dùng chung

## Vai trò

Chứa **decorators**, **pipes**, và đôi khi **guards** tái sử dụng để controller/service không lặp logic cross-cutting (public route, user hiện tại, permission).

## Decorators quan trọng

| Decorator | Ý nghĩa |
|-----------|---------|
| **`@Public()`** | Đánh dấu route **không** cần JWT. `JwtAuthGuard` đọc metadata và bỏ qua xác thực. |
| **`@CurrentUser()`** | Lấy payload user từ request sau khi JWT đã validate (dùng trong handler). |
| **`@RequirePermissions({ codes: [...], mode?: 'any' \| 'all' })`** | Yêu cầu một hoặc tất cả permission; `PermissionsGuard` xử lý. |

## Guard (cũng nằm dưới `features/identity/auth/guards`)

Guard global được đăng ký trong **`app.module.ts`**, không nằm trong `common/`, nhưng **phối hợp** với decorators ở đây:

- **JwtAuthGuard** + `@Public()`
- **PermissionsGuard** + `@RequirePermissions()`

## Pipe

Thư mục `pipes/` (ví dụ `index.ts`) — export pipe dùng chung nếu có; validation chính vẫn qua **global `ValidationPipe`** trong `main.ts`.

## Khi thêm API mới

1. Mặc định route **cần JWT**.
2. Route đăng ký/đăng nhập hoặc webhook công khai → thêm `@Public()`.
3. Thao tác nhạy cảm theo shop → thêm `@RequirePermissions()` với mã permission đã seed trong DB.
