# Glowora — Danh sách chức năng & Trạng thái triển khai

> **Cập nhật:** 2026-06-22  
> **Cột trạng thái:** ✅ Hoàn thành · 🔧 Đang làm · ⬜ Chưa làm · ❌ Bỏ qua/Không cần

---

## Mục lục

1. [Xác thực & Phân quyền](#1-xác-thực--phân-quyền)
2. [Quản lý Cửa hàng](#2-quản-lý-cửa-hàng)
3. [Quản lý Nhân viên](#3-quản-lý-nhân-viên)
4. [Catalog Dịch vụ](#4-catalog-dịch-vụ)
5. [Đặt lịch — Tính Slot](#5-đặt-lịch--tính-slot-trống)
6. [Đặt lịch — Booking](#6-đặt-lịch--booking)
7. [Thanh toán](#7-thanh-toán)
8. [Coupon (Mã giảm giá)](#8-coupon-mã-giảm-giá)
9. [Promotion (Khuyến mãi tự động)](#9-promotion-khuyến-mãi-tự-động)
10. [Đánh giá](#10-đánh-giá)
11. [Chat & Tin nhắn](#11-chat--tin-nhắn)
12. [Thông báo](#12-thông-báo)
13. [Analytics](#13-analytics)
14. [Admin Panel](#14-admin-panel)
15. [Hệ thống & Infrastructure](#15-hệ-thống--infrastructure)

---

## 1. Xác thực & Phân quyền

### 1.1 Auth

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Đăng ký (bước 1 — gửi OTP) | `POST /auth/register` | Ghi OTP vào Redis (TTL 600s) → gửi email | ✅ | ✅ |
| Đăng ký (bước 2 — xác minh OTP) | `POST /auth/verify-otp` | Verify OTP → tạo User + bcrypt(password) + gán role `CUSTOMER` (storeId=null) | ✅ | ✅ |
| Đăng nhập | `POST /auth/login` | LocalAuthGuard → bcrypt.compare + kiểm tra status ACTIVE → tạo access/refresh JWT → lưu bcrypt(refreshToken) vào DB → set HTTP-only cookie | ✅ | ✅ |
| Làm mới token | `POST /auth/refresh` | Verify JWT → kiểm tra Redis blacklist → tạo cặp token mới → blacklist token cũ trên Redis → rotate `refreshToken` hash trong DB | ✅ | ✅ |
| Đăng xuất | `POST /auth/logout` | Blacklist refresh token (Redis TTL = hết hạn) → xóa `refreshToken` field → xóa tất cả `PushSubscription` | ✅ | ✅ |
| Quên mật khẩu | `POST /auth/forgot-password` | OTP 6 số → Redis 600s → gửi email | ✅ | ✅ |
| Đặt lại mật khẩu | `POST /auth/reset-password` | Verify OTP → bcrypt(newPassword) → clear `refreshToken` field | ✅ | ✅ |
| Đổi mật khẩu | `POST /auth/change-password` | Verify old password bcrypt → update hash mới | ✅ | ✅ |
| Lấy thông tin bản thân | `GET /auth/me` | Trả về user + roles kèm storeId scope + province/ward | ✅ | ✅ |
| Lấy permission matrix | `GET /auth/getMatrix` | Trả về `{permissionCode: boolean}` — cache Redis per (userId, storeId), invalidate khi đổi role/permission | ✅ | ✅ |

### 1.2 RBAC — Vai trò & Quyền

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| CRUD Role | `GET/POST/PATCH/DELETE /roles` | `UNIQUE(code, storeId)` — clone role template khi tạo store; `@RequirePermissions` guard | ✅ | ⬜ |
| CRUD Permission | `GET/POST/PATCH/DELETE /permissions` | Atomic permission codes, seed sẵn; invalidate permission cache | ✅ | ⬜ |
| Gán role cho user | (trong users.update) | `UNIQUE(user_id, role_id, store_id)` — tối đa 3 store roles/user | ✅ | ⬜ |

---

## 2. Quản lý Cửa hàng

### 2.1 Tạo & Cập nhật Store

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Đăng ký cửa hàng | `POST /stores` | **Transaction:** tạo Store + 7 WorkingHour mặc định (T2–T7 08:00–20:00, CN đóng) + Role SHOP_OWNER (scoped storeId) + UserRole + Staff cho owner. Validate: ≤3 store/user. Auto-generate slug unique | ✅ | ✅ |
| Danh sách store (public) | `GET /stores` | Filter ACTIVE only, sort: distance (Haversine raw SQL), rating, name, newest. Includes: workingHours, owner, _count(services, reviews, staff) | ✅ | ✅ |
| Chi tiết store (public) | `GET /stores/:slug` | Includes services ACTIVE, top 5 visible reviews, active promotion → apply promotion price per variant | ✅ | ✅ |
| Danh sách store của tôi | `GET /stores/me` | Tất cả stores user có role (flat list: storeId, roleName, roleCode) | ✅ | ✅ |
| Cập nhật store | `PATCH /stores/me` | Kiểm tra ownership, regenerate slug nếu đổi tên | ✅ | ✅ |
| Upload logo | `POST /stores/me/logo` | Upload Cloudinary → xóa ảnh cũ nếu từ Cloudinary | ✅ | ✅ |
| Upload banner | `POST /stores/me/banner` | Tương tự logo | ✅ | ✅ |
| Upload CCCD mặt trước | `POST /stores/me/cccd-front` | Cloudinary, lưu `cccd_front_url` | ✅ | ✅ |
| Upload CCCD mặt sau | `POST /stores/me/cccd-back` | Cloudinary, lưu `cccd_back_url` | ✅ | ✅ |
| Upload giấy phép kinh doanh | `POST /stores/me/business-license` | Cloudinary, lưu `business_license_url` | ✅ | ✅ |

### 2.2 Giờ làm việc

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Xem giờ làm việc | `GET /stores/:storeId/working-hours` | 7 bản ghi `UNIQUE(store_id, day_of_week)` | ✅ | ✅ |
| Cập nhật giờ làm việc | `PUT /stores/:storeId/working-hours` | Upsert tất cả 7 ngày — `open_time/close_time` dạng "HH:MM", `is_closed` boolean | ✅ | ✅ |

### 2.3 Cấu hình Thanh toán SePay

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Xem config thanh toán | `GET /stores/me/payment-config` | Quan hệ 1-1 với Store | ✅ | ✅ |
| Tạo/cập nhật config SePay | `POST /stores/me/payment-config` | Upsert: bank_bin + account_no + account_name + webhook_secret (32-byte hex random). Không thể bật deposit nếu chưa có config | ✅ | ✅ |
| Xóa config | `DELETE /stores/me/payment-config` | Xóa config, disable deposit | ✅ | ✅ |

### 2.4 Tích hợp Telegram

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Generate link setup Telegram | `POST /stores/:storeId/telegram/setup-link` | Tạo temporary link để owner liên kết Telegram Supergroup | ✅ | ✅ |
| Link/Unlink Telegram group | `PATCH /stores/:storeId/telegram` | Lưu `telegram_group_id` vào Store — format `-100xxxxxxxxxx` | ✅ | ✅ |

---

## 3. Quản lý Nhân viên

### 3.1 Mời & Quản lý nhân viên

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Mời nhân viên | `POST /store-staff/invite` | Generate token 32-byte hex, expires 7 ngày → gửi email link + in-app Notification. Validate: user chưa là staff/admin của store | ✅ | ✅ |
| Chấp nhận lời mời | `POST /staff-invites/accept` | Verify token chưa expire + PENDING → **Transaction:** tạo Staff + gán role SHOP_STAFF (scoped storeId) → `staff_id` điền vào invite → ACCEPTED | ✅ | ✅ |
| Danh sách nhân viên | `GET /store-staff` | Paginated, filter status, search name. Includes: user info, province, ward | ✅ | ✅ |
| Chi tiết nhân viên | `GET /store-staff/:id` | Detail + user info | ✅ | ✅ |
| Cập nhật nhân viên | `PATCH /store-staff/:id` | Update status/phone/address/province/ward | ✅ | ✅ |
| Xóa nhân viên | `DELETE /store-staff/:id` | Soft delete: status → DELETED | ✅ | ✅ |
| Xem hồ sơ nhân viên của mình | `GET /store-staff/me` | Nhân viên xem hồ sơ của chính mình tại store đang chọn | ✅ | ✅ |

### 3.2 Lịch làm việc nhân viên (StaffSchedule)

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Xem lịch làm việc | `GET /staff/:id/schedules` | Nếu `date < today` → query `StaffScheduleHistory` (effective on that date) | ✅ | ✅ |
| Bulk upsert lịch | `PUT /staff/:id/schedules` | **Transaction:** snapshot schedules hiện tại vào `StaffScheduleHistory` (effectiveFrom–effectiveTo) → xóa current → create new. `UNIQUE(staff_id, day_of_week)` | ✅ | ✅ |
| Xóa 1 lịch | `DELETE /staff/:id/schedules/:scheduleId` | Hard delete 1 bản ghi schedule | ✅ | ✅ |

### 3.3 Nghỉ phép (StaffDayOff)

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Xem đơn nghỉ phép | `GET /staff/:id/day-off` | List + filter date, status | ✅ | ✅ |
| Tạo đơn nghỉ phép | `POST /staff/:id/day-off` | Create DayOff PENDING → Notification cho owner. Validate: date ≥ today. `UNIQUE(staff_id, date)`. Cả PENDING lẫn APPROVED đều block slot | ✅ | ✅ |
| Duyệt/Từ chối đơn nghỉ | `PATCH /staff/:id/day-off/:id/review` | PENDING → APPROVED/REJECTED → Notification + Email cho staff | ✅ | ✅ |
| Xóa đơn nghỉ | `DELETE /staff/:id/day-off/:id` | Chỉ xóa khi PENDING | ✅ | ✅ |

### 3.4 Gọi làm thêm (StaffCallIn)

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Xem danh sách call-in | `GET /staff-call-in/:storeId` | List call-in theo store, filter date/status | ✅ | ✅ |
| Tạo yêu cầu call-in | `POST /staff-call-in` | Manager gọi nhân viên làm ngày ngoài lịch tuần. `UNIQUE(staff_id, date)` | ✅ | ✅ |
| Chấp nhận call-in | `POST /staff-call-in/:id/accept` | PENDING → ACCEPTED. Chỉ ACCEPTED mới mở slot | ✅ | ✅ |
| Từ chối call-in | `POST /staff-call-in/:id/reject` | PENDING → REJECTED | ✅ | ✅ |

---

## 4. Catalog Dịch vụ

### 4.1 Danh mục (ServiceCategory)

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Danh sách danh mục (public) | `GET /categories` | Scope `storeId=null` (hệ thống). Sort by popularity hoặc creation | ✅ | ✅ |
| Chi tiết danh mục | `GET /categories/:idOrSlug` | Include children (level 2) | ✅ | ✅ |
| Tạo danh mục (admin) | `POST /categories` | Admin tạo level-1, auto slug. `UNIQUE(name, store_id)` | ✅ | ✅ |
| Cập nhật danh mục (admin) | `PATCH /categories/:id` | Regenerate slug nếu đổi tên | ✅ | ✅ |
| Xóa danh mục (admin) | `DELETE /categories/:id` | Chỉ xóa nếu không có level-2 categories | ✅ | ✅ |
| Danh mục của cửa hàng | `GET /stores/:storeId/categories` | Level-2, scoped theo store, include parent | ✅ | ✅ |
| Tạo danh mục store | `POST /stores/:storeId/categories` | `parent_id = systemCategoryId`, `store_id = storeId` | ✅ | ✅ |
| Cập nhật danh mục store | `PATCH /stores/:storeId/categories/:id` | Validate ownership | ✅ | ✅ |
| Xóa danh mục store | `DELETE /stores/:storeId/categories/:id` | Validate ownership | ✅ | ✅ |

### 4.2 Dịch vụ (Service)

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Danh sách dịch vụ (public/explore) | `GET /services/explore` | Filter: minPrice/maxPrice/minRating/maxDuration/categoryId. Sort: price/rating/popular/distance (Haversine). Apply active promotion per store | ✅ | ✅ |
| Chi tiết dịch vụ (public) | `GET /services/:idOrSlug` | Include variants (ACTIVE), reviews (visible), store info | ✅ | ✅ |
| Dịch vụ theo store | `GET /stores/:storeId/services` | Filter: q, categoryId, status. Sort: newest/name/price/rating/popular. Apply promotion | ✅ | ✅ |
| Tạo dịch vụ | `POST /stores/:storeId/services` | Validate unique name per store → generate slug `UNIQUE(store_id, slug)`. Create service + variants (với sortOrder) | ✅ | ✅ |
| Cập nhật dịch vụ | `PATCH /stores/:storeId/services/:id` | Validate ownership | ✅ | ✅ |
| Cập nhật variants (bulk) | `PATCH /stores/:storeId/services/:id/variants` | Upsert ServiceVariant (id/name/price/duration/sortOrder) | ✅ | ✅ |
| Upload ảnh dịch vụ | `POST /stores/:storeId/services/:id/images` | Cloudinary → append vào JSON array `image_urls` | ✅ | ✅ |
| Xóa ảnh dịch vụ | `DELETE /stores/:storeId/services/:id/images/:publicId` | Cloudinary delete → remove khỏi `image_urls` | ✅ | ✅ |
| Xóa dịch vụ | `DELETE /stores/:storeId/services/:id` | Soft delete: status → DELETED | ✅ | ✅ |

---

## 5. Đặt lịch — Tính Slot Trống

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Lấy danh sách slot trống | `POST /slots` | **6 parallel queries:** StaffSchedule + StaffDayOff + StaffCallIn + BookingItem (±24h window) + Staff records + Customer bookings. Build staffInfoMap per staff. Vòng lặp slot (bước `slotIntervalMins`): per slot assign staff tuần tự (workload balancing). Lọc slot trùng lịch khách. Return: `{availableSlots: [{startTime, staff: [...]}]}` | ✅ | ✅ |
| Lấy nhân viên khả dụng cho 1 slot | `POST /stores/:storeId/available-staff` | Query schedule + dayOff + overlap cho slot cụ thể | ✅ | ✅ |

---

## 6. Đặt lịch — Booking

### 6.1 Customer

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Tạo booking | `POST /bookings` | **Transaction Serializable:** validate store ACTIVE, customer ≠ owner/staff, ≥1 service. Per service: verify variant ACTIVE → pick/verify staff → check overlap ±24h. Customer conflict check. Apply Promotion (originalPrice vs price per item). Apply Coupon (6 validate rules). Create Booking + BookingItem[] (snapshot name/price/duration + start_time tuần tự) + CouponUsage + increment `usedCount`. Notification + SystemLog | ✅ | ✅ |
| Lịch hẹn của tôi (khách) | `GET /bookings/my` | Paginated, filter status, search, date range | ✅ | ✅ |
| Chi tiết lịch hẹn (khách) | `GET /bookings/:id` | Includes: items, payments, reviews, store info | ✅ | ✅ |
| Hủy lịch hẹn | `PATCH /bookings/:id/cancel` | Check `scheduledAt - cancelBeforeHours > now`. Statuses được hủy: PENDING/CONFIRMED/DEPOSIT_PENDING/DEPOSIT_PAID/PAID. Update Payment liên quan → REFUNDED | ✅ | ✅ |

### 6.2 Store Owner / Staff

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Danh sách booking (store) | `GET /store-bookings` | Filter: status, staffId, serviceId, date range, search customer. Paginated | ✅ | ✅ |
| Calendar booking (store) | `GET /store-bookings/calendar` | Group by date per month, filter status/staffId | ✅ | ✅ |
| Chi tiết booking (store) | `GET /store-bookings/:id` | Full detail: items, payments, staff info, customer snapshot | ✅ | ✅ |
| Xác nhận booking | `PATCH /store-bookings/:id/confirm` | PENDING → CONFIRMED hoặc DEPOSIT_PENDING. Nếu `depositPercent > 0` + paymentConfig active → tính `depositAmount = ceil(finalPrice * percent / 100)` + `depositDeadline` (bảng logic 7d/24h/6h/2h) | ✅ | ✅ |
| Từ chối booking | `PATCH /store-bookings/:id/reject` | PENDING → REJECTED + reason → Notification | ✅ | ✅ |
| Hoàn thành booking | `PATCH /store-bookings/:id/complete` | Chỉ khi status = PAID → COMPLETED → Notification | ✅ | ✅ |
| Ghi nhận thanh toán (CASH) | `POST /store-bookings/:id/record-payment` | method=CASH → tạo Payment với status=PAID ngay (không qua webhook). Update Booking status tương ứng | ✅ | ✅ |
| Nhân viên khả dụng để đổi | `GET /store-bookings/:id/items/:itemId/available-staff` | Query schedule + dayOff + overlap cho slot của item | ✅ | ✅ |
| Đổi nhân viên cho item | `PATCH /store-bookings/:id/items/:itemId/staff` | Verify không overlap → update `staff_id` + `staff_name` snapshot → Notification `BOOKING_STAFF_CHANGED` | ✅ | ✅ |
| Xóa booking | `DELETE /store-bookings/:id` | Hard delete (chỉ store member, trạng thái final) | ✅ | ⬜ |

### 6.3 Booking Reminder (Cron)

| Chức năng | Logic quan trọng | BE | FE |
|---|---|:---:|:---:|
| Nhắc lịch trước 1 ngày | Cron job: tìm booking scheduled ngày mai (status CONFIRMED/PAID) → gửi Notification `BOOKING_REMINDER_1DAY` + Email | ✅ | ⬜ |
| Nhắc lịch trước 1 giờ | Cron job: tìm booking scheduled 1h tới → gửi Notification `BOOKING_REMINDER_1HOUR` | ✅ | ⬜ |
| Hết hạn cọc (auto cancel) | Cron job: tìm DEPOSIT_PENDING quá `deposit_deadline` → auto CANCELLED | ✅ | ⬜ |

---

## 7. Thanh toán

### 7.1 SePay (Online Banking / VietQR)

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Tạo payment SePay | `POST /payments/sepay/create` | Determine amount: DEPOSIT_PENDING+DEPOSIT→depositAmount, DEPOSIT_PENDING+FULL→totalPrice, CONFIRMED/DEPOSIT_PAID→phần còn lại. Cancel PENDING payments cùng type cũ → Generate `sepayCode` (unique 8-10 digits random) → Build VietQR URL → Return {qrUrl, bankInfo, expiredAt} | ✅ | ✅ |
| Webhook nhận kết quả (SePay) | `POST /payments/sepay/webhook/:storeId` | Verify HMAC signature bằng `webhook_secret`. Extract `sepayCode` từ `content`. Find PENDING payment → verify `transferAmount ≥ required` → mark PAID → Update Booking status → Notification (staff + customer) → SystemLog | ✅ | ✅ |
| Lịch sử thanh toán của tôi | `GET /payments/my` | Paginated, filter status, date range | ✅ | ✅ |
| Thanh toán của 1 booking | `GET /bookings/:id/payment` | Tất cả Payment records của booking (retry pattern: nhiều records, chỉ 1 PAID) | ✅ | ✅ |

---

## 8. Coupon (Mã giảm giá)

### 8.1 Store Owner — Quản lý Coupon

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Tạo coupon | `POST /stores/:storeId/coupons` | Validate: `expiredAt > startAt`, PERCENTAGE value 1–100. Code uppercase. `@RequirePermissions(COUPON.CREATE)` | ✅ | ✅ |
| Danh sách coupon (store) | `GET /stores/:storeId/coupons` | Filter: search code, type, isActive, date range. Paginated | ✅ | ✅ |
| Chi tiết coupon | `GET /stores/:storeId/coupons/:id` | `@RequirePermissions(COUPON.VIEW)` | ✅ | ✅ |
| Cập nhật coupon | `PATCH /stores/:storeId/coupons/:id` | Chỉ update được `isActive` và `expiredAt`. `assertActor()` kiểm tra storeId match. `@RequirePermissions(COUPON.UPDATE)` | ✅ | ✅ |
| Xóa coupon | `DELETE /stores/:storeId/coupons/:id` | **Soft delete** nếu `usedCount > 0` (bảo toàn CouponUsage history). Hard delete nếu chưa ai dùng. `@RequirePermissions(COUPON.DELETE)` | ✅ | ✅ |

### 8.2 Customer — Sử dụng Coupon

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Danh sách coupon khả dụng | `GET /stores/:storeId/coupons/available` | Query coupon active + trong hạn + (storeId match hoặc platform-wide). Filter JS: `usedCount < usageLimit`. **Batch query** `CouponUsage.groupBy` để đếm lượt user dùng — tránh N+1. Trả về kèm `canUse` | ✅ | ✅ |
| Validate/Preview coupon | `POST /coupons/validate` | Kiểm tra 6 điều kiện: isActive, date range, storeId match, usageLimit, perUserLimit. Trả về preview giảm giá (không áp dụng thật) | ✅ | ✅ |
| Áp dụng khi đặt lịch | (trong `POST /bookings`) | Gọi `applyToBooking()` trong transaction Serializable. Tính: PERCENTAGE = `min(value% × totalPrice, maxDiscount)`, FIXED = `min(value, totalPrice)`. Increment `usedCount` trong transaction → rollback nếu booking fail | ✅ | ✅ |

### 8.3 Admin — Coupon Toàn Hệ Thống

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Tạo coupon platform-wide | `POST /admin/coupons` | `storeId = null` → coupon toàn hệ thống (áp dụng cho mọi store) | ✅ | ✅ |
| Danh sách coupon (admin) | `GET /admin/coupons` | Filter tất cả coupon kèm tên store (`includeStoreName = true`) | ✅ | ✅ |
| Cập nhật coupon (admin) | `PATCH /admin/coupons/:id` | Admin có thể sửa mọi coupon (`actorStoreId = undefined` = bypass assertActor) | ✅ | ✅ |
| Xóa coupon (admin) | `DELETE /admin/coupons/:id` | Soft/hard delete tương tự store owner | ✅ | ✅ |

---

## 9. Promotion (Khuyến mãi tự động)

> **Phân biệt với Coupon:** Promotion tự động áp dụng — giảm giá từng item theo scope. Coupon do khách nhập mã → áp cho tổng đơn.

### 9.1 Store Owner — Quản lý Promotion

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Tạo promotion | `POST /stores/:storeId/promotions` | Validate: `endAt > startAt`, PERCENTAGE 1–100, scope CATEGORY phải có `categoryIds`, scope SERVICE phải có `serviceIds`. **`assertNoOverlappingActive()`**: kiểm tra không có promotion active khác trùng khoảng thời gian. Tạo kèm `PromotionCategory[]` hoặc `PromotionService[]` tùy scope | ✅ | ✅ |
| Danh sách promotion | `GET /stores/:storeId/promotions` | Filter: isActive, q, type, scope. Paginated. Include targetCategories + targetServices | ✅ | ✅ |
| Chi tiết promotion | `GET /stores/:storeId/promotions/:id` | Include targetCategories + targetServices | ✅ | ✅ |
| Cập nhật promotion | `PATCH /stores/:storeId/promotions/:id` | Nếu `isActive = true` (đang bật) → `assertNoOverlappingActive()` lại (exclude chính nó). Chỉ update: name, description, isActive, endAt | ✅ | ✅ |
| Xóa promotion | `DELETE /stores/:storeId/promotions/:id` | Hard delete. SystemLog PROMOTION_DELETED | ✅ | ✅ |

### 9.2 Public / Tích hợp trong Booking

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Promotion đang active (public) | `GET /stores/:storeId/promotions/active` | `findFirst WHERE isActive=true AND startAt≤now AND (endAt≥now OR endAt=null) ORDER BY value DESC` | ✅ | ✅ |
| Tự động áp khi tạo booking | (trong `POST /bookings`) | `findActiveForStore()` → per BookingItem: `isServiceInScope(promotion, serviceId, categoryId)` → nếu trong scope: `calcDiscount()` → set `originalPrice + price` cho item. `promotion_name` snapshot vào Booking. Scope logic: STORE=tất cả, CATEGORY=check PromotionCategory, SERVICE=check PromotionService | ✅ | ✅ |
| Hiển thị promotion khi xem store | (trong `GET /stores/:slug`) | `findActiveForStore()` → apply vào từng ServiceVariant.price khi trả về | ✅ | ✅ |
| Hiển thị promotion khi xem services | (trong `GET /services/explore`) | Apply promotion per store cho từng variant | ✅ | ✅ |

---

## 10. Đánh giá

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Tạo review | `POST /booking-items/:id/review` | Điều kiện: Booking phải COMPLETED. `UNIQUE(booking_item_id)` — 1 item max 1 review. **Transaction:** create Review + `recalculateRatings(storeId, serviceId, staffId)` | ✅ | ✅ |
| Xem review theo store | `GET /stores/:storeId/reviews` | Filter visible, rating, serviceId. Return + rating breakdown (1–5 sao count). `INDEX(store_id, is_visible, created_at)` | ✅ | ✅ |
| Xem review theo dịch vụ | `GET /services/:id/reviews` | Filter visible. `INDEX(service_id, is_visible)` | ✅ | ✅ |
| Xem review theo nhân viên | `GET /staff/:id/reviews` | Filter visible. `INDEX(staff_id, is_visible)` | ✅ | ✅ |
| Chi tiết review của booking item | `GET /booking-items/:id/review` | 1-1 với BookingItem | ✅ | ✅ |
| Cập nhật review | `PATCH /reviews/:id` | Customer cập nhật comment/rating → `recalculateRatings()` | ✅ | ✅ |
| Xóa review | `DELETE /reviews/:id` | Hard delete → `recalculateRatings()` | ✅ | ✅ |
| Admin ẩn review | `PATCH /admin/reviews/:id/hide` | Toggle `is_visible = false` → `recalculateRatings()` | ✅ | ✅ |
| Admin hiện review | `PATCH /admin/reviews/:id/show` | Toggle `is_visible = true` → `recalculateRatings()` | ✅ | ✅ |

> **`recalculateRatings()`:** `AVG(rating) WHERE is_visible=true` → update `store.avg_rating + total_reviews`, `service.avg_rating`, `staff.rating + total_reviews`

---

## 11. Chat & Tin nhắn

### 11.1 Conversation

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Tạo / mở conversation | `POST /conversations` | Upsert `UNIQUE(customer_id, store_id)`. Validate: customer ≠ owner ≠ staff của store. Default mode = HUMAN | ✅ | ✅ |
| Inbox của khách | `GET /conversations/my` | Order by `last_message_at DESC`. Include unread count | ✅ | ✅ |
| Inbox của store | `GET /conversations/store` | Verify requester là owner hoặc staff. Unread count per conversation. `INDEX(store_id, last_message_at)` | ✅ | ✅ |
| Tin nhắn trong conversation | `GET /conversations/:id/messages` | Paginated, order `created_at ASC`. `INDEX(conversation_id, created_at)` | ✅ | ✅ |
| Gửi tin nhắn | Socket.io event / `POST /messages` | Create Message → update `Conversation.last_message_at + last_message_body`. Emit Socket.io. Forward Telegram nếu có `telegram_topic_id` | ✅ | ✅ |
| Upload file chat | `POST /upload/chat` | Cloudinary → return URL, lưu vào `Message.attachments` JSON | ✅ | ✅ |
| Đánh dấu đã đọc | `PATCH /conversations/:id/mark-read` | Mark read `sender_type != currentRole`. Staff đọc: mark CUSTOMER messages. Khách đọc: mark STAFF messages | ✅ | ✅ |

### 11.2 AI Chat (Gemini)

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Chat AI platform | `POST /ai/chat` | Gửi message lên Gemini AI → trả về response | ✅ | ✅ |

---

## 12. Thông báo

### 12.1 In-app Notifications

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Danh sách thông báo | `GET /notifications` | Filter isRead, type. Order `created_at DESC`. `INDEX(user_id, created_at)` | ✅ | ✅ |
| Badge count (chưa đọc) | (trong `GET /notifications`) | COUNT WHERE `is_read = false`. `INDEX(user_id, is_read)` | ✅ | ✅ |
| Đánh dấu đã đọc | `PATCH /notifications/:id` | Update `is_read = true` | ✅ | ✅ |
| Đánh dấu tất cả đã đọc | `PATCH /notifications/read-all` | UPDATE WHERE `user_id = X AND is_read = false` | ✅ | ✅ |

**22+ NotificationType được gửi tự động:**

| Sự kiện | Gửi tới | Email | Push | BE | FE |
|---|---|:---:|:---:|:---:|:---:|
| Booking tạo mới | Owner + Customer | ✅ | ✅ | ✅ | ✅ |
| Booking xác nhận | Customer | ✅ | ✅ | ✅ | ✅ |
| Booking từ chối | Customer | ❌ | ✅ | ✅ | ✅ |
| Booking hoàn thành | Customer | ✅ | ✅ | ✅ | ✅ |
| Booking hủy | Owner + Customer | ❌ | ✅ | ✅ | ✅ |
| Yêu cầu đặt cọc | Customer | ✅ | ✅ | ✅ | ✅ |
| Cọc đã thanh toán | Owner + Customer | ❌ | ✅ | ✅ | ✅ |
| Cọc hết hạn (auto cancel) | Customer | ✅ | ✅ | ✅ | ✅ |
| Thanh toán thành công | Customer | ❌ | ✅ | ✅ | ✅ |
| Đổi nhân viên | Customer | ❌ | ✅ | ✅ | ✅ |
| Nhắc lịch 1 ngày trước | Customer | ✅ | ✅ | ✅ | ✅ |
| Nhắc lịch 1 giờ trước | Customer | ❌ | ✅ | ✅ | ✅ |
| Store được duyệt | Owner | ✅ | ✅ | ✅ | ✅ |
| Store bị từ chối | Owner | ✅ | ✅ | ✅ | ✅ |
| Store bị khóa | Owner | ✅ | ✅ | ✅ | ✅ |
| Mời nhân viên | User được mời | ✅ | ✅ | ✅ | ✅ |
| Đơn nghỉ phép tạo mới | Owner | ✅ | ✅ | ✅ | ✅ |
| Đơn nghỉ phép được duyệt | Staff | ✅ | ✅ | ✅ | ✅ |
| Đơn nghỉ phép bị từ chối | Staff | ✅ | ✅ | ✅ | ✅ |
| Yêu cầu call-in | Staff | ✅ | ✅ | ✅ | ✅ |
| Call-in được chấp nhận | Manager | ❌ | ✅ | ✅ | ✅ |
| Call-in bị từ chối | Manager | ❌ | ✅ | ✅ | ✅ |

### 12.2 Web Push Notifications

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Đăng ký push subscription | `POST /push-subscriptions` | Lưu endpoint + p256dh + auth per browser. 1 user → nhiều subscriptions (nhiều thiết bị) | ✅ | ✅ |
| Hủy đăng ký | `DELETE /push-subscriptions/:endpoint` | Xóa subscription cụ thể | ✅ | ✅ |
| Gửi push (tự động) | (side effect) | Gửi tới TẤT CẢ subscriptions của user khi có sự kiện | ✅ | ✅ |

---

## 13. Analytics

### 13.1 Store Analytics

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Tổng quan cửa hàng | `GET /store-analytics/overview` | Total bookings, revenue, avg rating, active services, staff count | ✅ | ✅ |
| Trend doanh thu | `GET /store-analytics/revenue` | Group by day/week/month, sum `final_price` WHERE status=COMPLETED | ✅ | ✅ |
| Trend booking | `GET /store-analytics/bookings` | Group by date, count theo status | ✅ | ✅ |
| Top dịch vụ | `GET /store-analytics/top-services` | Count booking_items per service, order by count DESC | ✅ | ✅ |

### 13.2 Admin Analytics

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Tổng quan hệ thống | `GET /admin/analytics/overview` | Total: stores, users, bookings, revenue | ✅ | ✅ |
| Trend tăng trưởng store | `GET /admin/analytics/stores` | New stores per day/month | ✅ | ✅ |
| Trend tăng trưởng user | `GET /admin/analytics/users` | New users per day/month | ✅ | ✅ |
| Trend doanh thu hệ thống | `GET /admin/analytics/revenue` | Aggregate revenue toàn platform | ✅ | ✅ |
| Top cửa hàng | `GET /admin/analytics/top-stores` | Rank by revenue hoặc booking count | ✅ | ✅ |

---

## 14. Admin Panel

### 14.1 Quản lý Store (Admin)

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Thống kê nhanh | `GET /admin/stores/stats` | `{stores: {total, pending, active, banned}, users: {total, banned}, appointments: {total, pending}}` | ✅ | ✅ |
| Danh sách store | `GET /admin/stores` | Filter: status, q, province. Paginated. Include owner info, KYC info | ✅ | ✅ |
| Chi tiết store | `GET /admin/stores/:id` | Full info: KYC (CCCD, giấy phép), payment config, stats | ✅ | ✅ |
| Duyệt store | `PATCH /admin/stores/:id/approve` | PENDING/INACTIVE → ACTIVE. Validate: admin ≠ owner. Notification + SystemLog | ✅ | ✅ |
| Từ chối store | `PATCH /admin/stores/:id/reject` | → INACTIVE + `rejection_reason`. Notification | ✅ | ✅ |
| Khóa store | `PATCH /admin/stores/:id/lock` | ACTIVE → BANNED. Reason required. SystemLog | ✅ | ✅ |
| Mở khóa store | `PATCH /admin/stores/:id/unlock` | BANNED → ACTIVE. SystemLog | ✅ | ✅ |

### 14.2 Quản lý User (Admin)

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Danh sách user | `GET /users` | Filter: status, q (name/email), page/limit | ✅ | ✅ |
| Chi tiết user | `GET /users/:id` | Includes: roles (kèm store info), stores owned | ✅ | ✅ |
| Tạo user (admin) | `POST /users` | Hash password, assign roles (deduplicate per (roleId, storeId)), max 3 store roles | ✅ | ✅ |
| Cập nhật user | `PATCH /users/:id` | Update: name/email/phone/status/roles. Ban: set `banned_at + ban_reason` | ✅ | ✅ |
| Xóa user | `DELETE /users/:id` | Hard delete | ✅ | ⬜ |

### 14.3 Quản lý Review (Admin)

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Danh sách review | `GET /reviews` | Filter: storeId, serviceId, staffId, isVisible, rating. Paginated | ✅ | ✅ |
| Ẩn review | `PATCH /admin/reviews/:id/hide` | `is_visible = false` → recalculate ratings | ✅ | ✅ |
| Hiện review | `PATCH /admin/reviews/:id/show` | `is_visible = true` → recalculate ratings | ✅ | ✅ |

### 14.4 System Logs (Admin)

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Danh sách logs | `GET /admin/logs` | Filter: type, status, actorId, storeId, date range. 30+ LogType. Polymorphic `target_id + target_type`. `store_id` không FK (giữ nguyên khi store bị xóa) | ✅ | ✅ |
| Logs của store | `GET /store-logs` | Lọc theo storeId hiện tại, filter type | ✅ | ✅ |

---

## 15. Hệ thống & Infrastructure

### 15.1 Upload & Media

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Upload avatar | `POST /upload/avatar` | Cloudinary folder `avatars`, update `user.avatar_url` | ✅ | ✅ |
| Upload ảnh dịch vụ | `POST /upload/images` | Cloudinary folder `services`, append vào `image_urls` JSON | ✅ | ✅ |
| Upload ảnh danh mục | `POST /upload/category-image` | Cloudinary folder `categories`, update `banner_url` | ✅ | ✅ |
| Upload file chat | `POST /upload/chat` | Cloudinary, trả về URL để nhúng vào Message.attachments | ✅ | ✅ |

### 15.2 Địa chỉ hành chính

| Chức năng | Endpoint | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Danh sách tỉnh/thành phố | `GET /locations/provinces` | 61 tỉnh — seed từ danh mục quốc gia, INT id cố định | ✅ | ✅ |
| Danh sách phường/xã | `GET /locations/wards/:provinceId` | Phân cấp theo province | ✅ | ✅ |

### 15.3 WebSocket (Real-time)

| Chức năng | Event | Logic quan trọng | BE | FE |
|---|---|---|:---:|:---:|
| Kết nối WebSocket | `connection` | Authenticate bằng access token trong cookie hoặc query. Lưu socket per userId | ✅ | ✅ |
| Join room store (dashboard) | `join_store` | Staff/owner join room `store:{storeId}` để nhận notifications | ✅ | ✅ |
| Push notification real-time | `notification` | Emit tới socket của userId khi có sự kiện (booking, payment, ...) | ✅ | ✅ |
| Chat message real-time | `message` | Emit tới customer socket + store room khi có tin nhắn mới | ✅ | ✅ |

---

## Tóm tắt Transaction & Race Condition

| Transaction | Isolation | Mục đích |
|---|---|---|
| Tạo Booking | **Serializable** | Prevent double-booking race condition (staff overlap) |
| Tạo Store | Default | Atomic: Store + WorkingHours + Role + UserRole + Staff |
| Chấp nhận lời mời | Default | Atomic: Staff + UserRole → invite ACCEPTED |
| Tạo Review | Default | Atomic: Review + recalculateRatings |
| Bulk upsert Schedule | Default | Atomic: snapshot History + delete old + create new |
| applyToBooking (Coupon) | (trong Serializable booking tx) | Increment usedCount + CouponUsage, rollback nếu booking fail |

---

## Tóm tắt tích hợp bên ngoài

| Integration | Mục đích | Logic xác thực |
|---|---|---|
| **SePay** | Thanh toán chuyển khoản, QR VietQR | HMAC-SHA256 `webhook_secret` verify header Authorization |
| **Cloudinary** | Lưu trữ ảnh (logo, banner, CCCD, giấy phép, ảnh dịch vụ, chat) | API key + secret trong env |
| **Telegram Bot** | Forward chat khách → Telegram Topic; reply Telegram → sync về app | Bot token, webhook verify |
| **Gemini AI** | Chat AI platform (`POST /ai/chat`) | API key trong env |
| **SMTP (Email)** | OTP, booking events, staff invite, reminder | SMTP credentials trong env |
| **Redis** | OTP cache, refresh token blacklist, permission matrix cache | Connection string |
| **WebSocket (Socket.io)** | Real-time: chat, notifications | JWT từ cookie |
| **Web Push (VAPID)** | Push notification trình duyệt | VAPID key pair |
