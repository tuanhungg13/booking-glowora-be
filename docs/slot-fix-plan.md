# Kế hoạch fix API lấy Slot hợp lệ

## Trả lời câu hỏi: Có nên cấu hình `bookingBufferMins` theo từng store không?

**Trả lời: Có — nên cấu hình theo store.**

**Lý do:** Store đã có pattern configurable cho các tham số tương tự:
- `slotIntervalMins` — khoảng cách giữa các slot (mặc định 30 phút)
- `cancelBeforeHours` — huỷ trước bao nhiêu giờ (mặc định 2h)
- `maxAdvanceDays` — đặt trước tối đa bao nhiêu ngày (mặc định 30 ngày)

`bookingBufferMins` (buffer từ hiện tại đến slot sớm nhất có thể đặt) là cùng loại tham số,
phụ thuộc vào từng loại hình kinh doanh:
- Tiệm nail nhỏ: 15 phút là đủ
- Spa cao cấp: cần 60–120 phút để chuẩn bị

Cost: thêm 1 cột vào bảng `stores` + 1 migration nhỏ. Không ảnh hưởng logic khác.

---

## Danh sách vấn đề cần fix

### Fix 1 — N+1 Query trong Phase pre-load StaffInfo [QUAN TRỌNG NHẤT]

**File:** `src/features/booking/slots/slots.service.ts` dòng 125–165

**Nguyên nhân:**
Vòng lặp `for (const staffId of allStaffIds)` thực hiện 4 `await` riêng lẻ cho từng staff:
```typescript
for (const staffId of allStaffIds) {
  const schedule    = await prisma.staffSchedule.findFirst(...)  // 1 query/staff
  const dayOff      = await prisma.staffDayOff.findFirst(...)    // 1 query/staff
  const busyItems   = await prisma.bookingItem.findMany(...)     // 1 query/staff
  const staffRecord = await prisma.staff.findUnique(...)         // 1 query/staff
}
```
Với N staff → 4N query tuần tự. Ví dụ 10 staff = 40 round-trips DB.

**Cách fix:**
Thay bằng 4 query batch dùng `IN` + `Promise.all`:
```typescript
const [schedules, dayOffs, busyItems, staffRecords] = await Promise.all([
  prisma.staffSchedule.findMany({
    where: { staffId: { in: allStaffIds }, dayOfWeek, isActive: true },
  }),
  prisma.staffDayOff.findMany({
    where: { staffId: { in: allStaffIds }, date: dateUTCMidnight },
  }),
  prisma.bookingItem.findMany({
    where: {
      staffId: { in: allStaffIds },
      booking: { status: { in: [PENDING, CONFIRMED] } },
      startTime: { gte: dayStart, lte: dayEnd },
    },
    select: { staffId: true, startTime: true, duration: true },
  }),
  prisma.staff.findMany({
    where: { id: { in: allStaffIds } },
    include: { user: { select: { fullName: true, avatarUrl: true } } },
  }),
]);
```
Sau đó group kết quả theo `staffId` bằng Map để build `staffInfoMap` và `staffNameMap`.

**Kết quả:** 4N query → 4 query (chạy song song).

---

### Fix 2 — Sequential query trong validate variants (Phase 2)

**File:** `src/features/booking/slots/slots.service.ts` dòng 74–88

**Nguyên nhân:**
Các variant của từng service được query tuần tự trong vòng lặp `for`, trong khi chúng độc lập nhau.

**Cách fix:**
Dùng `Promise.all` để query song song:
```typescript
const variants = await Promise.all(
  services.map((svc) =>
    prisma.serviceVariant.findFirst({
      where: {
        id: svc.variantId,
        serviceId: svc.serviceId,
        status: ServiceStatus.ACTIVE,
        service: { shopId: storeId, status: ServiceStatus.ACTIVE },
      },
    }),
  ),
);

// Sau đó validate từng kết quả
for (let i = 0; i < variants.length; i++) {
  if (!variants[i]) throw new NotFoundException(`Variant không tìm thấy cho dịch vụ thứ ${i + 1}`);
  serviceDetails.push({ ..., duration: variants[i].duration });
}
```

---

### Fix 3 — Sequential query trong build qualified staff (Phase 3)

**File:** `src/features/booking/slots/slots.service.ts` dòng 94–113

**Nguyên nhân:**
Vòng lặp `for` gọi Prisma tuần tự để lấy danh sách staff cho từng service. Với nhiều service,
mỗi service tốn 1–2 query riêng.

**Cách fix:**
Chia 2 nhóm (service có staffId cụ thể vs tự chọn) rồi `Promise.all` từng nhóm:
```typescript
const serviceQualifiedStaff: string[][] = await Promise.all(
  serviceDetails.map(async (svc, i) => {
    if (svc.staffId) {
      const [staffRecord, canDo] = await Promise.all([
        prisma.staff.findFirst({ where: { id: svc.staffId, storeId, status: 'ACTIVE' } }),
        prisma.staffService.findFirst({ where: { staffId: svc.staffId, serviceId: svc.serviceId } }),
      ]);
      if (!staffRecord) throw new NotFoundException(`Nhân viên không tìm thấy (dịch vụ ${i + 1})`);
      if (!canDo) throw new BadRequestException(`Nhân viên không thực hiện được dịch vụ ${i + 1}`);
      return [svc.staffId];
    }
    const mappings = await prisma.staffService.findMany({
      where: { serviceId: svc.serviceId, staff: { storeId, status: 'ACTIVE' } },
      select: { staffId: true },
    });
    return mappings.map((m) => m.staffId);
  }),
);
```

---

### Fix 4 — Infinite loop khi `slotIntervalMins = 0` hoặc `duration = 0`

**File:** `src/features/booking/slots/slots.service.ts` dòng 181

**Nguyên nhân:**
Vòng lặp outer dùng `slotMins += store.slotIntervalMins`. Nếu `slotIntervalMins = 0`
thì `slotMins` không bao giờ tăng → vòng lặp vô hạn, server treo.
Tương tự nếu `totalDuration = 0` (variant có duration = 0).

**Cách fix:**
Thêm guard ngay đầu method, trước khi vào thuật toán:
```typescript
if (store.slotIntervalMins <= 0) {
  throw new BadRequestException('Cấu hình store không hợp lệ: slotIntervalMins phải > 0');
}
if (totalDuration <= 0) {
  throw new BadRequestException('Tổng thời gian dịch vụ không hợp lệ');
}
```

Ngoài ra bổ sung validation ở tầng DTO/schema khi tạo/cập nhật store:
- `slotIntervalMins`: `@Min(5)` (tối thiểu 5 phút)
- `variant.duration`: `@Min(1)` trong DTO tạo variant

---

### Fix 5 — `BOOKING_BUFFER_MINS` hardcode → cấu hình theo store

**Files cần thay đổi:**
- `prisma/schema.prisma` — thêm field vào model `Store`
- `src/features/booking/slots/slots.service.ts` — dùng `store.bookingBufferMins`

**Nguyên nhân:**
```typescript
const BOOKING_BUFFER_MINS = 30; // hardcode, không thay đổi được theo store
```

**Bước 1 — Thêm vào schema:**
```prisma
model Store {
  // ... các field hiện có ...
  slotIntervalMins   Int @default(30) @map("slot_interval_mins")
  cancelBeforeHours  Int @default(2)  @map("cancel_before_hours")
  maxAdvanceDays     Int @default(30) @map("max_advance_days")
  bookingBufferMins  Int @default(30) @map("booking_buffer_mins")  // ← thêm mới
}
```

**Bước 2 — Chạy migration:**
```bash
pnpm prisma migrate dev --name add_booking_buffer_mins
```

**Bước 3 — Dùng trong service:**
```typescript
// Xoá dòng const BOOKING_BUFFER_MINS = 30 ở đầu file
// Thay trong vòng lặp:
if (isToday && slotMins <= nowLocalMins + store.bookingBufferMins) continue;
```

**Bước 4 — Cập nhật DTO tạo/cập nhật store** để cho phép owner cấu hình field mới (validate `@Min(0) @Max(240)`).

---

### Fix 6 — Staff assignment theo "first-in-list" — thiếu cân bằng workload

**File:** `src/features/booking/slots/slots.service.ts` dòng 196–222

**Nguyên nhân:**
`serviceQualifiedStaff[i]` được lấy từ `staffService.findMany` không có `orderBy`,
thứ tự phụ thuộc vào insert order của DB. Staff đầu tiên trong list luôn được pick trước
→ một số nhân viên bị quá tải, số khác ít được chọn.

**Cách fix (đề xuất):** Sort qualified staff theo số `busyWindows` tăng dần trước khi assign:
```typescript
// Sau khi build staffInfoMap xong, sort từng service's qualified list
const sortedQualified = qualified
  .filter((id) => staffInfoMap.get(id) !== null)
  .sort((a, b) => {
    const aLoad = staffInfoMap.get(a)?.busyWindows.length ?? 999;
    const bLoad = staffInfoMap.get(b)?.busyWindows.length ?? 999;
    return aLoad - bLoad; // ít việc nhất lên trước
  });
```

**Lưu ý:** Fix này có tính chất "nice-to-have", không ảnh hưởng tính đúng đắn.
Ưu tiên sau các fix 1–5.

---

## Thứ tự thực hiện

| Thứ tự | Fix | Lý do ưu tiên |
|--------|-----|---------------|
| 1 | Fix 4 — Guard vòng lặp vô hạn | Bug nghiêm trọng, fix nhanh |
| 2 | Fix 5 — `bookingBufferMins` configurable | Cần migration trước khi code khác phụ thuộc |
| 3 | Fix 1 — N+1 query batch | Tác động hiệu năng lớn nhất |
| 4 | Fix 2 — Parallel variant query | Đơn giản, tác động rõ ràng |
| 5 | Fix 3 — Parallel staff query | Đơn giản, tác động rõ ràng |
| 6 | Fix 6 — Load balancing | Nice-to-have, sau khi các fix trên xong |

---

## Files sẽ thay đổi

```
prisma/schema.prisma                              ← Fix 5: thêm bookingBufferMins
prisma/migrations/<timestamp>_add_booking_buffer/ ← Fix 5: migration mới
src/features/booking/slots/slots.service.ts       ← Fix 1,2,3,4,5,6
src/features/stores/stores (DTO update store)     ← Fix 5: expose field mới cho owner
```
