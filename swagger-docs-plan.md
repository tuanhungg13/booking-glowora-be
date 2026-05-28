# Kế hoạch bổ sung Swagger API Documentation

> **Mục tiêu:** Đạt 100% coverage Swagger cho toàn bộ controller.
> **Nguyên tắc:** Chỉ thêm decorator Swagger — không thay đổi business logic, không refactor.

---

## Hiện trạng

| Mức độ | Số controller | Tỷ lệ |
|---|---|---|
| ✅ FULL | 10 | 42% |
| ⚠️ PARTIAL | 2 | 8% |
| ⚠️ MINIMAL | 1 | 4% |
| ❌ NONE | 11 | 46% |

**Controllers đã đầy đủ (không cần sửa):**
- `AuthController`, `StoresController`, `AdminStoresController`
- `StoreStaffController`, `StaffInvitesController`
- `BookingsController`, `StoreBookingsController`, `SlotsController`
- `PaymentsController`, `ReviewsController`

---

## Priority 1 — Identity / Admin

### 1.1 `RolesController`
**File:** `src/features/identity/roles/roles.controller.ts`
**Trạng thái:** ❌ NONE — không có bất kỳ Swagger decorator nào

**Import cần thêm:**
```ts
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện:**

| Vị trí | Decorator cần thêm |
|---|---|
| Class `RolesController` | `@ApiTags('roles')` + `@ApiBearerAuth()` |
| `POST /roles` | `@ApiOperation({ summary: 'Tạo role mới' })` + `@ApiResponse({ status: 201, description: 'Tạo thành công' })` + `@ApiResponse({ status: 403, description: 'Không có quyền' })` |
| `GET /roles` | `@ApiOperation({ summary: 'Lấy danh sách tất cả role' })` + `@ApiResponse({ status: 200, description: 'Danh sách role' })` |
| `GET /roles/:id` | `@ApiOperation({ summary: 'Lấy chi tiết một role' })` + `@ApiParam({ name: 'id', description: 'Role ID' })` + `@ApiResponse({ status: 404, description: 'Không tìm thấy role' })` |
| `PATCH /roles/:id` | `@ApiOperation({ summary: 'Cập nhật role' })` + `@ApiParam({ name: 'id', description: 'Role ID' })` |
| `DELETE /roles/:id` | `@ApiOperation({ summary: 'Xóa role' })` + `@ApiParam({ name: 'id', description: 'Role ID' })` |

---

### 1.2 `PermissionsController`
**File:** `src/features/identity/permissions/permissions.controller.ts`
**Trạng thái:** ❌ NONE

**Import cần thêm:**
```ts
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện:**

| Vị trí | Decorator cần thêm |
|---|---|
| Class | `@ApiTags('permissions')` + `@ApiBearerAuth()` |
| `POST /permissions` | `@ApiOperation({ summary: 'Tạo permission mới' })` + `@ApiResponse({ status: 201 })` + `@ApiResponse({ status: 403 })` |
| `GET /permissions` | `@ApiOperation({ summary: 'Lấy danh sách tất cả permission' })` |
| `GET /permissions/:id` | `@ApiOperation({ summary: 'Lấy chi tiết permission' })` + `@ApiParam({ name: 'id' })` + `@ApiResponse({ status: 404 })` |
| `PATCH /permissions/:id` | `@ApiOperation({ summary: 'Cập nhật permission' })` + `@ApiParam({ name: 'id' })` |
| `DELETE /permissions/:id` | `@ApiOperation({ summary: 'Xóa permission' })` + `@ApiParam({ name: 'id' })` |

---

### 1.3 `UsersController`
**File:** `src/features/identity/users/users.controller.ts`
**Trạng thái:** ❌ NONE — có query params nhưng chưa doc

**Import cần thêm:**
```ts
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện:**

| Vị trí | Decorator cần thêm |
|---|---|
| Class | `@ApiTags('users')` + `@ApiBearerAuth()` |
| `POST /users` | `@ApiOperation({ summary: 'Tạo user mới (admin)' })` + `@ApiResponse({ status: 201 })` + `@ApiResponse({ status: 403 })` |
| `GET /users` | `@ApiOperation({ summary: 'Lấy danh sách user (admin)' })` + `@ApiQuery({ name: 'status', enum: UserStatus, required: false })` + `@ApiQuery({ name: 'skip', required: false, type: Number })` + `@ApiQuery({ name: 'take', required: false, type: Number })` |
| `PATCH /users/me` | `@ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân' })` + `@ApiResponse({ status: 200, description: 'Cập nhật thành công' })` |
| `GET /users/:id` | `@ApiOperation({ summary: 'Lấy chi tiết user theo ID' })` + `@ApiParam({ name: 'id' })` + `@ApiResponse({ status: 404 })` |
| `PATCH /users/:id` | `@ApiOperation({ summary: 'Cập nhật user (admin)' })` + `@ApiParam({ name: 'id' })` |
| `DELETE /users/:id` | `@ApiOperation({ summary: 'Xóa user (admin)' })` + `@ApiParam({ name: 'id' })` |

---

## Priority 2 — Catalog

### 2.1 `CategoriesController`
**File:** `src/features/catalog/categories/categories.controller.ts`
**Trạng thái:** ❌ NONE — có public endpoints

**Import cần thêm:**
```ts
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện:**

| Vị trí | Decorator cần thêm |
|---|---|
| Class | `@ApiTags('categories')` |
| `POST /categories` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Tạo danh mục mới (admin)' })` + `@ApiResponse({ status: 201 })` + `@ApiResponse({ status: 403 })` |
| `GET /categories` | `@ApiOperation({ summary: 'Lấy danh sách danh mục (public)' })` + `@ApiResponse({ status: 200 })` |
| `GET /categories/:id` | `@ApiOperation({ summary: 'Lấy chi tiết danh mục (public)' })` + `@ApiParam({ name: 'id' })` + `@ApiResponse({ status: 404 })` |
| `PATCH /categories/:id` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Cập nhật danh mục (admin)' })` + `@ApiParam({ name: 'id' })` |
| `DELETE /categories/:id` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Xóa danh mục (admin)' })` + `@ApiParam({ name: 'id' })` |

---

### 2.2 `CombosController`
**File:** `src/features/catalog/combos/combos.controller.ts`
**Trạng thái:** ❌ NONE — có query params + `@ShopId()` header

**Import cần thêm:**
```ts
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện:**

| Vị trí | Decorator cần thêm |
|---|---|
| Class | `@ApiTags('combos')` + `@ApiHeader({ name: 'x-shop-id', description: 'ID của shop', required: true })` |
| `POST /combos` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Tạo combo dịch vụ mới' })` + `@ApiResponse({ status: 201 })` |
| `GET /combos` | `@ApiOperation({ summary: 'Lấy danh sách combo của shop (public)' })` + `@ApiQuery({ name: 'status', enum: ComboStatus, required: false })` + `@ApiQuery({ name: 'categoryId', required: false })` |
| `GET /combos/:id` | `@ApiOperation({ summary: 'Lấy chi tiết combo (public)' })` + `@ApiParam({ name: 'id' })` + `@ApiResponse({ status: 404 })` |
| `PATCH /combos/:id` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Cập nhật combo' })` + `@ApiParam({ name: 'id' })` |
| `DELETE /combos/:id` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Xóa combo' })` + `@ApiParam({ name: 'id' })` |

---

### 2.3 `ServicesController`
**File:** `src/features/catalog/services/services.controller.ts`
**Trạng thái:** ⚠️ PARTIAL — chỉ 2/10 endpoint có `@ApiOperation`

**Import cần bổ sung** (đã có `ApiOperation`, `ApiTags`):
```ts
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện** (chỉ các endpoint còn thiếu):

| Vị trí | Decorator cần thêm |
|---|---|
| Class | Thêm `@ApiHeader({ name: 'x-shop-id', required: true })` vào class decorator |
| `POST /services` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Tạo dịch vụ mới' })` + `@ApiResponse({ status: 201 })` |
| `GET /services/:id` | `@ApiOperation({ summary: 'Lấy chi tiết dịch vụ (public)' })` + `@ApiParam({ name: 'id' })` + `@ApiResponse({ status: 404 })` |
| `PATCH /services/:id` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Cập nhật dịch vụ' })` + `@ApiParam({ name: 'id' })` |
| `POST /services/:id/variants` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Thêm variant cho dịch vụ' })` + `@ApiParam({ name: 'id', description: 'Service ID' })` |
| `PATCH /services/:id/variants/:variantId` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Cập nhật variant' })` + `@ApiParam({ name: 'id' })` + `@ApiParam({ name: 'variantId' })` |
| `DELETE /services/:id/variants/:variantId` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Xóa variant' })` + `@ApiParam({ name: 'id' })` + `@ApiParam({ name: 'variantId' })` |
| `PATCH /services/:id/staff` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Gán nhân viên cho dịch vụ' })` + `@ApiParam({ name: 'id' })` |
| `DELETE /services/:id` | `@ApiBearerAuth()` + `@ApiOperation({ summary: 'Xóa dịch vụ' })` + `@ApiParam({ name: 'id' })` |

---

## Priority 3 — Staff Management

### 3.1 `WorkingHourController`
**File:** `src/features/staff/working-hour/working-hour.controller.ts`
**Trạng thái:** ❌ NONE — có query filter `dayOfWeek`

**Import cần thêm:**
```ts
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện:**

| Vị trí | Decorator cần thêm |
|---|---|
| Class | `@ApiTags('staff / working-hours')` + `@ApiBearerAuth()` |
| `POST /working-hours` | `@ApiOperation({ summary: 'Tạo giờ làm việc cho nhân viên' })` + `@ApiResponse({ status: 201 })` |
| `GET /working-hours` | `@ApiOperation({ summary: 'Lấy danh sách giờ làm việc' })` + `@ApiQuery({ name: 'dayOfWeek', enum: DayOfWeek, required: false })` |
| `GET /working-hours/:id` | `@ApiOperation({ summary: 'Lấy chi tiết giờ làm việc' })` + `@ApiParam({ name: 'id' })` + `@ApiResponse({ status: 404 })` |
| `PATCH /working-hours/:id` | `@ApiOperation({ summary: 'Cập nhật giờ làm việc' })` + `@ApiParam({ name: 'id' })` |
| `DELETE /working-hours/:id` | `@ApiOperation({ summary: 'Xóa giờ làm việc' })` + `@ApiParam({ name: 'id' })` |

---

### 3.2 `StaffScheduleController`
**File:** `src/features/staff/staff-schedule/staff-schedule.controller.ts`
**Trạng thái:** ❌ NONE — nested route `staff/:staffId/schedules`, có bulk upsert

**Import cần thêm:**
```ts
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện:**

| Vị trí | Decorator cần thêm |
|---|---|
| Class | `@ApiTags('staff / schedules')` + `@ApiBearerAuth()` + `@ApiHeader({ name: 'x-shop-id', required: true })` |
| `POST /staff/:staffId/schedules` | `@ApiOperation({ summary: 'Tạo lịch làm việc cho nhân viên' })` + `@ApiParam({ name: 'staffId', description: 'Staff ID' })` + `@ApiResponse({ status: 201 })` |
| `PUT /staff/:staffId/schedules` | `@ApiOperation({ summary: 'Bulk upsert lịch làm việc (ghi đè toàn bộ)' })` + `@ApiParam({ name: 'staffId' })` |
| `GET /staff/:staffId/schedules` | `@ApiOperation({ summary: 'Lấy lịch làm việc của nhân viên' })` + `@ApiParam({ name: 'staffId' })` + `@ApiQuery({ name: 'dayOfWeek', enum: DayOfWeek, required: false })` |
| `PATCH /staff/:staffId/schedules/:id` | `@ApiOperation({ summary: 'Cập nhật một ca lịch cụ thể' })` + `@ApiParam({ name: 'staffId' })` + `@ApiParam({ name: 'id', description: 'Schedule ID' })` |
| `DELETE /staff/:staffId/schedules/:id` | `@ApiOperation({ summary: 'Xóa một ca lịch cụ thể' })` + `@ApiParam({ name: 'staffId' })` + `@ApiParam({ name: 'id' })` |

---

### 3.3 `StaffDayOffController`
**File:** `src/features/staff/staff-day-off/staff-day-off.controller.ts`
**Trạng thái:** ❌ NONE — nested route `staff/:staffId/day-off`, query date range

**Import cần thêm:**
```ts
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện:**

| Vị trí | Decorator cần thêm |
|---|---|
| Class | `@ApiTags('staff / day-off')` + `@ApiBearerAuth()` + `@ApiHeader({ name: 'x-shop-id', required: true })` |
| `POST /staff/:staffId/day-off` | `@ApiOperation({ summary: 'Đăng ký ngày nghỉ cho nhân viên' })` + `@ApiParam({ name: 'staffId' })` + `@ApiResponse({ status: 201 })` |
| `GET /staff/:staffId/day-off` | `@ApiOperation({ summary: 'Lấy danh sách ngày nghỉ (có thể lọc theo khoảng thời gian)' })` + `@ApiParam({ name: 'staffId' })` + `@ApiQuery({ name: 'from', required: false, description: 'ISO date string, VD: 2025-01-01' })` + `@ApiQuery({ name: 'to', required: false, description: 'ISO date string, VD: 2025-01-31' })` |
| `GET /staff/:staffId/day-off/:id` | `@ApiOperation({ summary: 'Lấy chi tiết ngày nghỉ' })` + `@ApiParam({ name: 'staffId' })` + `@ApiParam({ name: 'id', description: 'Day-off ID' })` |
| `PATCH /staff/:staffId/day-off/:id` | `@ApiOperation({ summary: 'Cập nhật ngày nghỉ' })` + `@ApiParam({ name: 'staffId' })` + `@ApiParam({ name: 'id' })` |
| `DELETE /staff/:staffId/day-off/:id` | `@ApiOperation({ summary: 'Hủy ngày nghỉ' })` + `@ApiParam({ name: 'staffId' })` + `@ApiParam({ name: 'id' })` |

---

## Priority 4 — Messaging & Notifications

### 4.1 `ConversationsController`
**File:** `src/features/messaging/conversations/conversations.controller.ts`
**Trạng thái:** ⚠️ PARTIAL — đã có `@ApiTags`, `@ApiBearerAuth` nhưng thiếu `@ApiOperation` ở 5/8 endpoint

**Import cần bổ sung** (đã có `ApiOperation`, `ApiTags`, `ApiBearerAuth`):
```ts
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện** (chỉ các endpoint còn thiếu `@ApiOperation`):

| Vị trí | Decorator cần thêm |
|---|---|
| `POST /conversations` | `@ApiOperation({ summary: 'Tạo cuộc hội thoại mới' })` |
| `GET /conversations` | `@ApiOperation({ summary: 'Lấy danh sách tất cả hội thoại (admin)' })` + `@ApiQuery({ name: 'customerId', required: false })` + `@ApiQuery({ name: 'storeId', required: false })` + `@ApiQuery({ name: 'skip', required: false, type: Number })` + `@ApiQuery({ name: 'take', required: false, type: Number })` |
| `GET /conversations/:id` | `@ApiOperation({ summary: 'Lấy chi tiết hội thoại' })` + `@ApiParam({ name: 'id' })` |
| `PATCH /conversations/:id` | `@ApiOperation({ summary: 'Cập nhật thông tin hội thoại' })` + `@ApiParam({ name: 'id' })` |
| `DELETE /conversations/:id` | `@ApiOperation({ summary: 'Xóa hội thoại' })` + `@ApiParam({ name: 'id' })` |
| `PATCH /conversations/:id/escalate` | Đã có — thêm `@ApiParam({ name: 'id' })` |
| `PATCH /conversations/:id/bot-mode` | Đã có — thêm `@ApiParam({ name: 'id' })` |

---

### 4.2 `MessagesController`
**File:** `src/features/messaging/messages/messages.controller.ts`
**Trạng thái:** ❌ NONE — nested route `conversations/:conversationId/messages`

**Import cần thêm:**
```ts
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện:**

| Vị trí | Decorator cần thêm |
|---|---|
| Class | `@ApiTags('conversations / messages')` + `@ApiBearerAuth()` |
| `POST /conversations/:conversationId/messages` | `@ApiOperation({ summary: 'Gửi tin nhắn trong hội thoại' })` + `@ApiParam({ name: 'conversationId', description: 'Conversation ID' })` |
| `GET /conversations/:conversationId/messages` | `@ApiOperation({ summary: 'Lấy danh sách tin nhắn (phân trang)' })` + `@ApiParam({ name: 'conversationId' })` + `@ApiQuery({ name: 'skip', required: false, type: Number })` + `@ApiQuery({ name: 'take', required: false, type: Number })` |
| `GET /conversations/:conversationId/messages/:id` | `@ApiOperation({ summary: 'Lấy chi tiết tin nhắn' })` + `@ApiParam({ name: 'conversationId' })` + `@ApiParam({ name: 'id', description: 'Message ID' })` |
| `PATCH /conversations/:conversationId/messages/:id` | `@ApiOperation({ summary: 'Chỉnh sửa tin nhắn' })` + `@ApiParam({ name: 'conversationId' })` + `@ApiParam({ name: 'id' })` |
| `DELETE /conversations/:conversationId/messages/:id` | `@ApiOperation({ summary: 'Xóa tin nhắn' })` + `@ApiParam({ name: 'conversationId' })` + `@ApiParam({ name: 'id' })` |

---

### 4.3 `NotificationsController`
**File:** `src/features/notifications/notifications/notifications.controller.ts`
**Trạng thái:** ❌ NONE — 9 endpoints, nhiều endpoint dành riêng cho user hiện tại

**Import cần thêm:**
```ts
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện:**

| Vị trí | Decorator cần thêm |
|---|---|
| Class | `@ApiTags('notifications')` + `@ApiBearerAuth()` |
| `POST /notifications` | `@ApiOperation({ summary: 'Tạo notification (system/admin)' })` + `@ApiResponse({ status: 201 })` |
| `GET /notifications` | `@ApiOperation({ summary: 'Lấy tất cả notifications (admin)' })` + `@ApiQuery({ name: 'userId', required: false })` + `@ApiQuery({ name: 'isRead', required: false, type: Boolean })` + `@ApiQuery({ name: 'type', enum: NotificationType, required: false })` + `@ApiQuery({ name: 'skip', required: false, type: Number })` + `@ApiQuery({ name: 'take', required: false, type: Number })` |
| `GET /notifications/me` | `@ApiOperation({ summary: 'Lấy notifications của user hiện tại' })` + `@ApiQuery({ name: 'isRead', required: false, type: Boolean })` + `@ApiQuery({ name: 'skip', required: false, type: Number })` + `@ApiQuery({ name: 'take', required: false, type: Number })` |
| `GET /notifications/me/unread-count` | `@ApiOperation({ summary: 'Lấy số lượng notification chưa đọc' })` + `@ApiResponse({ status: 200, description: 'Trả về { count: number }' })` |
| `PATCH /notifications/me/read-all` | `@ApiOperation({ summary: 'Đánh dấu tất cả notification là đã đọc' })` |
| `PATCH /notifications/:id/read` | `@ApiOperation({ summary: 'Đánh dấu một notification là đã đọc' })` + `@ApiParam({ name: 'id', description: 'Notification ID' })` |
| `GET /notifications/:id` | `@ApiOperation({ summary: 'Lấy chi tiết notification' })` + `@ApiParam({ name: 'id' })` + `@ApiResponse({ status: 404 })` |
| `PATCH /notifications/:id` | `@ApiOperation({ summary: 'Cập nhật notification (admin)' })` + `@ApiParam({ name: 'id' })` |
| `DELETE /notifications/:id` | `@ApiOperation({ summary: 'Xóa notification' })` + `@ApiParam({ name: 'id' })` |

---

## Priority 5 — Misc

### 5.1 `AppController`
**File:** `src/app.controller.ts`
**Trạng thái:** ❌ NONE — health check endpoint đơn giản

**Import cần thêm:**
```ts
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
```

**Thay đổi cần thực hiện:**

| Vị trí | Decorator cần thêm |
|---|---|
| Class | `@ApiTags('health')` |
| `GET /` | `@ApiOperation({ summary: 'Health check' })` + `@ApiResponse({ status: 200, description: 'Server đang chạy bình thường' })` |

---

### 5.2 `TelegramController`
**File:** `src/telegram/telegram.controller.ts`
**Trạng thái:** ⚠️ MINIMAL — đã có `@ApiTags('telegram')`, endpoint là webhook nội bộ

**Lựa chọn:**
- **Phương án A (khuyến nghị):** Ẩn khỏi Swagger bằng `@ApiExcludeEndpoint()` vì đây là webhook nội bộ, không dành cho client/dev dùng.
- **Phương án B:** Thêm `@ApiOperation` mô tả đây là Telegram webhook endpoint.

**Nếu chọn Phương án A:**
```ts
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';

// Thêm vào method handleWebhook:
@ApiExcludeEndpoint()
@Public()
@Post('webhook')
async handleWebhook(@Body() update: any) { ... }
```

**Nếu chọn Phương án B:**
```ts
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiOperation({ summary: 'Telegram webhook — nhận update từ Telegram Bot API' })
@ApiResponse({ status: 200, description: 'Luôn trả về { ok: true }' })
```

---

## Tóm tắt số lượng thay đổi

| Priority | Controller | Số endpoint cần sửa | Ghi chú |
|---|---|---|---|
| P1 | `RolesController` | 5 | Thêm từ đầu |
| P1 | `PermissionsController` | 5 | Thêm từ đầu |
| P1 | `UsersController` | 6 | Thêm từ đầu |
| P2 | `CategoriesController` | 5 | Thêm từ đầu |
| P2 | `CombosController` | 5 | Thêm từ đầu |
| P2 | `ServicesController` | 8 | Bổ sung endpoint còn thiếu |
| P3 | `WorkingHourController` | 5 | Thêm từ đầu |
| P3 | `StaffScheduleController` | 5 | Thêm từ đầu, chú ý `@ApiParam` cho `staffId` |
| P3 | `StaffDayOffController` | 5 | Thêm từ đầu, chú ý `@ApiParam` cho `staffId` |
| P4 | `ConversationsController` | 5+2 | Bổ sung endpoint còn thiếu + `@ApiParam` |
| P4 | `MessagesController` | 5 | Thêm từ đầu, chú ý `@ApiParam` cho `conversationId` |
| P4 | `NotificationsController` | 9 | Thêm từ đầu |
| P5 | `AppController` | 1 | Đơn giản |
| P5 | `TelegramController` | 1 | Chọn ẩn hoặc mô tả |
| **TỔNG** | **14 controller** | **~72 endpoint** | |

---

## Verify sau khi hoàn thành

- [ ] Khởi động server: `npm run start:dev`
- [ ] Truy cập `http://localhost:8080/api` — kiểm tra Swagger UI
- [ ] Verify mỗi tag group hiển thị đúng
- [ ] Verify các endpoint có `@ApiBearerAuth()` hiển thị nút lock
- [ ] Verify các public endpoint không có lock
- [ ] Verify `@ApiParam`, `@ApiQuery` hiển thị đúng field
- [ ] Verify `@ApiHeader` cho `x-shop-id` hiển thị đúng trên các controller cần
