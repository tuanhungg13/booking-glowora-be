# API Báo cáo & Thống kê

---

# PHẦN 1 — Admin Analytics

---

## API 1 — Tổng quan hệ thống
`GET /admin/analytics/overview?from=2026-06-01&to=2026-06-30`

---

**Query 1:** Lấy từ bảng `stores`, đếm theo `status`

| id | name | status | created_at |
|----|------|--------|------------|
| 1 | Salon A | ACTIVE | 2026-01-10 |
| 2 | Nail Đẹp | ACTIVE | 2026-02-05 |
| 3 | Tóc Xinh | PENDING | 2026-06-01 |
| 4 | Beauty Plus | BANNED | 2026-03-15 |

→ Kết quả: `{ total: 4, active: 2, pending: 1, banned: 1 }`

---

**Query 2:** Lấy từ bảng `stores`, lọc `created_at` trong kỳ → đếm cửa hàng mới

| id | name | created_at |
|----|------|------------|
| 3 | Tóc Xinh | **2026-06-01** ✅ |
| 4 | Beauty Plus | 2026-03-15 ❌ |

→ Kết quả: `{ newInPeriod: 1 }`

---

**Query 3:** Lấy từ bảng `bookings`, lọc `scheduled_at` trong kỳ, đếm theo `status`

| id | store_id | scheduled_at | status |
|----|----------|--------------|--------|
| 1 | 1 | **2026-06-05** ✅ | COMPLETED |
| 2 | 2 | **2026-06-10** ✅ | CANCELLED |
| 3 | 1 | **2026-06-12** ✅ | COMPLETED |
| 4 | 3 | 2026-05-01 ❌ | COMPLETED |

→ Kết quả: `{ total: 3, completed: 2, cancelled: 1 }`

---

**Query 4:** Lấy từ bảng `payments`, lọc `status = 'PAID'` và `paid_at` trong kỳ → cộng tổng `amount`

| id | booking_id | amount | status | paid_at |
|----|------------|--------|--------|---------|
| 1 | 1 | 200,000 | **PAID** ✅ | **2026-06-05** ✅ |
| 2 | 2 | 150,000 | **PAID** ✅ | **2026-06-10** ✅ |
| 3 | 5 | 300,000 | PENDING ❌ | — |

→ Kết quả: `{ revenue: 350,000 }`

---

**Query 5:** Lấy từ bảng `reviews`, lọc `is_visible = true` và `created_at` trong kỳ → tính trung bình `rating`

| id | store_id | rating | is_visible | created_at |
|----|----------|--------|------------|------------|
| 1 | 1 | 5 | true ✅ | **2026-06-06** ✅ |
| 2 | 1 | 4 | true ✅ | **2026-06-11** ✅ |
| 3 | 2 | 3 | false ❌ | 2026-06-08 |

→ Kết quả: `{ reviewCount: 2, avgRating: 4.5 }`

---

## API 2 — Biểu đồ cửa hàng đăng ký mới
`GET /admin/analytics/stores?from=2026-06-01&to=2026-06-30&groupBy=day`

Lấy từ bảng `stores`, lọc `created_at` trong kỳ, nhóm theo ngày, đếm số lượng

| id | name | created_at |
|----|------|------------|
| 5 | Salon Mới | 2026-06-01 |
| 6 | Tóc Đẹp | 2026-06-01 |
| 7 | Nail Art | 2026-06-02 |

→ Kết quả:
```json
[
  { "period": "2026-06-01", "total": 2 },
  { "period": "2026-06-02", "total": 1 }
]
```

---

## API 3 — Biểu đồ người dùng đăng ký mới
`GET /admin/analytics/users?from=2026-06-01&to=2026-06-30&groupBy=day`

Lấy từ bảng `users`, lọc `created_at` trong kỳ, nhóm theo ngày, đếm số lượng

| id | email | created_at |
|----|-------|------------|
| 10 | a@gmail.com | 2026-06-01 |
| 11 | b@gmail.com | 2026-06-01 |
| 12 | c@gmail.com | 2026-06-03 |

→ Kết quả:
```json
[
  { "period": "2026-06-01", "total": 2 },
  { "period": "2026-06-03", "total": 1 }
]
```

---

## API 4 — Biểu đồ doanh thu toàn hệ thống
`GET /admin/analytics/revenue?from=2026-06-01&to=2026-06-30&groupBy=day`

Lấy từ bảng `payments`, lọc `status = 'PAID'` và `paid_at` trong kỳ, nhóm theo ngày, cộng tổng `amount`

| id | booking_id | amount | status | paid_at |
|----|------------|--------|--------|---------|
| 1 | 10 | 200,000 | PAID | 2026-06-01 |
| 2 | 11 | 300,000 | PAID | 2026-06-01 |
| 3 | 12 | 150,000 | PAID | 2026-06-02 |
| 4 | 13 | 400,000 | PENDING | — |

→ Kết quả:
```json
[
  { "period": "2026-06-01", "revenue": 500000, "bookingCount": 2 },
  { "period": "2026-06-02", "revenue": 150000, "bookingCount": 1 }
]
```

---

## API 5 — Top cửa hàng doanh thu cao nhất
`GET /admin/analytics/top-stores?from=2026-06-01&to=2026-06-30&limit=10`

Lấy từ bảng `payments` (lọc `status = 'PAID'`, `paid_at` trong kỳ), JOIN sang `bookings` để biết store nào, JOIN sang `stores` để lấy tên. Nhóm theo store, cộng tổng `amount`, sắp xếp giảm dần

| payments.amount | bookings.store_id | stores.name |
|-----------------|-------------------|-------------|
| 200,000 | 1 | Salon A |
| 300,000 | 1 | Salon A |
| 150,000 | 2 | Nail Đẹp |

→ Nhóm theo store:
- Salon A: 500,000 (2 booking)
- Nail Đẹp: 150,000 (1 booking)

→ Kết quả:
```json
[
  { "rank": 1, "name": "Salon A",   "revenue": 500000, "bookingCount": 2, "avgRating": 4.8 },
  { "rank": 2, "name": "Nail Đẹp", "revenue": 150000, "bookingCount": 1, "avgRating": 4.5 }
]
```

---

---

# PHẦN 2 — Store Analytics

> Tất cả API đều lọc thêm `store_id` — chỉ lấy dữ liệu của cửa hàng đang đăng nhập.

---

## API 6 — Tổng quan cửa hàng
`GET /store-analytics/overview?from=2026-06-01&to=2026-06-30`

---

**Query 1:** Lấy từ bảng `payments`, lọc `status = 'PAID'`, `paid_at` trong kỳ, JOIN `bookings` để lọc theo `store_id` → cộng tổng `amount`

| payments.amount | payments.status | bookings.store_id | payments.paid_at |
|-----------------|-----------------|-------------------|------------------|
| 200,000 | PAID | **2** ✅ | 2026-06-05 ✅ |
| 150,000 | PAID | **2** ✅ | 2026-06-10 ✅ |
| 300,000 | PAID | 5 ❌ | 2026-06-08 |

→ Kết quả: `{ revenue: 350,000 }`

---

**Query 2:** Lấy từ bảng `bookings`, lọc `store_id = 2` và `scheduled_at` trong kỳ, đếm theo `status`

| id | store_id | scheduled_at | status |
|----|----------|--------------|--------|
| 1 | **2** ✅ | **2026-06-05** ✅ | COMPLETED |
| 2 | **2** ✅ | **2026-06-10** ✅ | COMPLETED |
| 3 | **2** ✅ | **2026-06-15** ✅ | CANCELLED |
| 4 | 5 ❌ | 2026-06-12 | COMPLETED |

→ Kết quả: `{ bookingCount: 3, completedCount: 2, cancelledCount: 1 }`

---

**Query 3:** Lấy từ bảng `reviews`, lọc `store_id = 2`, `is_visible = true`, `created_at` trong kỳ → tính trung bình `rating`

| id | store_id | rating | is_visible | created_at |
|----|----------|--------|------------|------------|
| 1 | **2** ✅ | 5 | true ✅ | 2026-06-06 ✅ |
| 2 | **2** ✅ | 4 | true ✅ | 2026-06-11 ✅ |
| 3 | 5 ❌ | 5 | true | 2026-06-08 |

→ Kết quả: `{ reviewCount: 2, avgRating: 4.5 }`

---

**Query 4:** Lấy từ bảng `bookings`, lọc `store_id = 2` → đếm khách hàng mới (lần đầu đặt tại store này trong kỳ)

| id | store_id | customer_id | scheduled_at |
|----|----------|-------------|--------------|
| 1 | 2 | user_A | **2026-05-10** (trước kỳ → khách cũ) |
| 2 | 2 | user_B | **2026-05-20** (trước kỳ → khách cũ) |
| 3 | 2 | user_A | 2026-06-05 (trong kỳ, nhưng user_A đã đến trước → không tính) |
| 4 | 2 | user_C | 2026-06-10 (trong kỳ, user_C chưa từng đến → **khách mới** ✅) |
| 5 | 2 | user_D | 2026-06-15 (trong kỳ, user_D chưa từng đến → **khách mới** ✅) |

→ Kết quả: `{ newCustomers: 2 }`

---

## API 7 — Biểu đồ doanh thu cửa hàng
`GET /store-analytics/revenue?from=2026-06-01&to=2026-06-30&groupBy=day`

Lấy từ bảng `payments`, lọc `status = 'PAID'` và `paid_at` trong kỳ, JOIN `bookings` để lọc theo `store_id`, nhóm theo ngày, cộng tổng `amount`

| payments.amount | payments.paid_at | bookings.store_id |
|-----------------|------------------|-------------------|
| 200,000 | 2026-06-01 | **2** ✅ |
| 100,000 | 2026-06-01 | **2** ✅ |
| 150,000 | 2026-06-02 | **2** ✅ |
| 300,000 | 2026-06-01 | 5 ❌ |

→ Kết quả:
```json
[
  { "period": "2026-06-01", "revenue": 300000, "bookingCount": 2 },
  { "period": "2026-06-02", "revenue": 150000, "bookingCount": 1 }
]
```

---

## API 8 — Biểu đồ lịch hẹn theo trạng thái
`GET /store-analytics/bookings?from=2026-06-01&to=2026-06-30&groupBy=day`

Lấy từ bảng `bookings`, lọc `store_id = 2` và `scheduled_at` trong kỳ, nhóm theo ngày, đếm từng `status`

| id | store_id | scheduled_at | status |
|----|----------|--------------|--------|
| 1 | 2 | 2026-06-05 | COMPLETED |
| 2 | 2 | 2026-06-05 | COMPLETED |
| 3 | 2 | 2026-06-05 | CANCELLED |
| 4 | 2 | 2026-06-06 | COMPLETED |
| 5 | 2 | 2026-06-06 | PENDING |

→ Kết quả:
```json
[
  { "period": "2026-06-05", "total": 3, "completed": 2, "cancelled": 1, "pending": 0 },
  { "period": "2026-06-06", "total": 2, "completed": 1, "cancelled": 0, "pending": 1 }
]
```

---

## API 9 — Top dịch vụ bán chạy
`GET /store-analytics/top-services?from=2026-06-01&to=2026-06-30&limit=5`

Lấy từ bảng `booking_items`, lọc qua `bookings` với `store_id = 2`, `status = 'COMPLETED'`, `scheduled_at` trong kỳ. JOIN sang `services` để lấy tên, LEFT JOIN sang `reviews` để lấy rating. Nhóm theo dịch vụ, đếm số lần đặt, cộng tổng `price`, sắp xếp giảm dần

| booking_items.id | booking_items.service_id | booking_items.price | bookings.status |
|------------------|--------------------------|---------------------|-----------------|
| 1 | 1 (Cắt tóc nam) | 50,000 | COMPLETED ✅ |
| 2 | 1 (Cắt tóc nam) | 50,000 | COMPLETED ✅ |
| 3 | 1 (Cắt tóc nam) | 50,000 | COMPLETED ✅ |
| 4 | 2 (Gội đầu) | 80,000 | COMPLETED ✅ |
| 5 | 2 (Gội đầu) | 80,000 | CANCELLED ❌ |

→ Nhóm theo dịch vụ (chỉ tính COMPLETED):
- Cắt tóc nam: 3 lần, doanh thu 150,000
- Gội đầu: 1 lần, doanh thu 80,000

→ Kết quả:
```json
[
  { "rank": 1, "name": "Cắt tóc nam", "bookingCount": 3, "revenue": 150000, "avgRating": 4.8 },
  { "rank": 2, "name": "Gội đầu",     "bookingCount": 1, "revenue": 80000,  "avgRating": null }
]
```

> `avgRating: null` = dịch vụ này chưa có review nào.
