# Phase 5 — Thanh toán & Đánh giá (Chi tiết)

> **Prerequisite:** Phase 4 (Booking & Lịch hẹn) phải hoàn chỉnh — cụ thể: `Appointment.status = COMPLETED` tồn tại, model `Payment` và `Review` đã có trong schema (dù chưa implement logic).  
> **Stack:** NestJS 11 · Prisma · MySQL · VNPAY Sandbox · Next.js 16  
> **Đọc cùng:** `PHASE4_BOOKING_LICHAEN.md`

---

## Phát hiện quan trọng trước khi bắt đầu

| Vấn đề | Mô tả | Hành động |
|--------|-------|-----------|
| Model `Payment` và `Review` đã có skeleton | Nhưng thiếu nhiều field VNPAY-specific | Migrate thêm field |
| `Appointment` thiếu field `price` | Service.price có thể thay đổi sau khi đặt lịch | Thêm `price` vào Appointment khi tạo (Phase 4 cần patch) |
| `Review.@unique(appointmentId)` | Mỗi appointment chỉ được review 1 lần — cần enforce ở DB level | Thêm `@@unique([appointmentId])` |
| Payment retry cần txnRef khác nhau | VNPAY reject nếu gửi lại `vnp_TxnRef` đã dùng | Dùng `{appointmentId}-{timestamp}` |
| IPN và Return URL cùng xử lý | Nếu dùng cùng 1 hàm, phải idempotent | Check status trước khi update |
| avgRating phải tính lại sau mỗi review | 3 entities cần update: Store, Service, Staff | Dùng Prisma transaction + `aggregate._avg` |
| VNPAY Sandbox cần HTTPS | Local dev cần ngrok hoặc cấu hình VNPAY cho HTTP sandbox | Ghi rõ setup guide |

---

## Mục tiêu Phase

1. Khách thanh toán qua VNPAY sau khi dịch vụ hoàn thành
2. Xử lý cả hai kênh: Return URL (browser redirect) và IPN (server-to-server)
3. Idempotent: VNPAY có thể gửi IPN nhiều lần → chỉ xử lý 1 lần
4. Khách đánh giá (sao + bình luận) sau khi appointment COMPLETED
5. avgRating của Store / Service / Staff tự động cập nhật sau mỗi review
6. Public hiển thị reviews trên trang chi tiết spa

---

## I. Kiến trúc tổng quan

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                 │
│  /appointments/[id]/payment   → Trang thanh toán                    │
│  /payment/result              → Kết quả thanh toán (return URL)     │
│  /appointments/[id]/review    → Form đánh giá                       │
│  /spas/[id]                   → Hiển thị reviews + avgRating        │
└────────────────────┬─────────────────────────────────────────────────┘
                     │ HTTP
┌────────────────────▼─────────────────────────────────────────────────┐
│                    NestJS — Phase 5 Modules                           │
│                                                                        │
│  PaymentsController              ReviewsController                    │
│  POST /payments/vnpay/create     POST /appointments/:id/review       │
│  GET  /payments/vnpay/return     GET  /stores/:storeId/reviews       │
│  POST /payments/vnpay/ipn  ◄──── GET  /services/:serviceId/reviews  │
│  GET  /payments/my               GET  /appointments/:id/review       │
│  GET  /appointments/:id/payment  PATCH /admin/reviews/:id/hide       │
│                                                                        │
│  PaymentsService                 ReviewsService                       │
│    createVnpayUrl()               create()                           │
│    handleReturn()                 findByStore()                      │
│    handleIpn()      ◄──────────   findByService()                   │
│    findMyPayments()               recalculateRatings() ─────────────►│
│                                                          (transaction)│
└────────────────────┬─────────────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
      MySQL 8               VNPAY Sandbox
   payments                 (sandbox.vnpayment.vn)
   reviews
   store.avgRating
   service.avgRating
   staff.rating
```

---

## II. Database Schema — Thay đổi cần làm

### 2.1 Sửa model `Appointment` (bổ sung từ Phase 4)

```prisma
model Appointment {
  // ... giữ nguyên tất cả field Phase 4 ...

  // THÊM — snapshot giá lúc đặt lịch
  price  Decimal @db.Decimal(12, 2)
  // Sao chép từ service.price khi tạo appointment
  // Lý do: service.price có thể bị owner thay đổi sau khi khách đã đặt
  // → Phải patch AppointmentsService.create() trong Phase 4

  // Relations — thêm nếu chưa có
  payments Payment[]
  review   Review?
}
```

### 2.2 Sửa model `Payment`

```prisma
enum PaymentStatus {
  PENDING    // đã khởi tạo, chờ khách thanh toán
  PAID       // thanh toán thành công
  FAILED     // thất bại (hủy, lỗi, timeout)
  REFUNDED   // đã hoàn tiền (Phase 6)
}

enum PaymentMethod {
  VNPAY
  STRIPE    // optional Phase 5
  CASH      // Phase 6: thanh toán tiền mặt tại quầy
}

model Payment {
  id            String        @id @default(uuid()) @db.Char(36)
  appointmentId String        @map("appointment_id") @db.Char(36)
  customerId    String        @map("customer_id") @db.Char(36)
  amount        Decimal       @db.Decimal(12, 2)
  status        PaymentStatus @default(PENDING)
  method        PaymentMethod @default(VNPAY)

  // VNPAY-specific fields
  vnpTxnRef       String?  @unique @map("vnp_txn_ref") @db.VarChar(100)
  // "{appointmentId}-{timestamp}" — unique mỗi lần tạo request
  // @unique: tránh duplicate trong DB

  vnpTransactionNo String? @map("vnp_transaction_no") @db.VarChar(100)
  // Mã giao dịch bên VNPAY (vnp_TransactionNo từ response)

  vnpBankCode     String? @map("vnp_bank_code") @db.VarChar(20)
  // Ngân hàng khách dùng (VCB, TCB, VietinBank, ...)

  vnpCardType     String? @map("vnp_card_type") @db.VarChar(20)
  // "ATM" hoặc "CREDIT"

  vnpPayDate      String? @map("vnp_pay_date") @db.VarChar(20)
  // "20251220093045" — format YYYYMMDDHHmmss từ VNPAY

  vnpResponseCode String? @map("vnp_response_code") @db.VarChar(10)
  // "00" = success; các code khác = lỗi/hủy

  paidAt       DateTime? @map("paid_at")
  failedReason String?   @map("failed_reason")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")

  appointment Appointment @relation(fields: [appointmentId], references: [id])
  customer    User        @relation(fields: [customerId], references: [id])

  @@index([appointmentId])
  @@index([customerId, status])
  @@map("payments")
}
```

> **Tại sao `Payment` không `@unique(appointmentId)`?**  
> Khách có thể thất bại lần 1, thử lại lần 2 → 2 Payment records cho cùng 1 appointment.  
> Chỉ 1 record được PAID. Khi query "payment của appointment này" → lấy record PAID mới nhất.

### 2.3 Sửa model `Review`

```prisma
model Review {
  id            String  @id @default(uuid()) @db.Char(36)
  appointmentId String  @map("appointment_id") @db.Char(36)
  customerId    String  @map("customer_id") @db.Char(36)
  storeId       String  @map("store_id") @db.Char(36)
  serviceId     String  @map("service_id") @db.Char(36)
  staffId       String? @map("staff_id") @db.Char(36)

  rating    Int      // 1–5 (integer — không dùng float)
  comment   String?  @db.Text
  imageUrls Json?    @map("image_urls")
  // Phase 5: optional list ảnh review ["url1","url2"] — upload qua Multer

  isVisible Boolean  @default(true) @map("is_visible")
  // Super Admin ẩn review vi phạm → ảnh hưởng avgRating

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")

  appointment Appointment @relation(fields: [appointmentId], references: [id])
  customer    User        @relation("CustomerReviews", fields: [customerId], references: [id])
  store       Store       @relation(fields: [storeId], references: [id])
  service     Service     @relation(fields: [serviceId], references: [id])
  staff       Staff?      @relation(fields: [staffId], references: [id])

  @@unique([appointmentId])   // ← DB constraint: 1 review/appointment
  @@index([storeId, isVisible, createdAt])
  @@index([serviceId, isVisible])
  @@index([staffId, isVisible])
  @@map("reviews")
}
```

### 2.4 Sửa `Staff` — thêm `totalReviews` (nếu chưa có)

```prisma
model Staff {
  // ... existing fields ...
  rating       Decimal @default(0.00) @db.Decimal(3, 2)
  totalReviews Int     @default(0)    @map("total_reviews")
  // Cả hai field cần verify tồn tại trong schema
}
```

---

## III. VNPAY Integration — Chi tiết kỹ thuật

### 3.1 Đăng ký và cấu hình

```
Sandbox: https://sandbox.vnpayment.vn/devreg/
→ Đăng ký nhận: TmnCode + HashSecret

Environment variables:
  VNPAY_TMN_CODE=     # Terminal Merchant Code
  VNPAY_HASH_SECRET=  # Secret key cho HMAC-SHA512
  VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
  VNPAY_RETURN_URL=http://localhost:3000/payment/result
  VNPAY_IPN_URL=https://<ngrok-url>/payments/vnpay/ipn
  # IPN phải là HTTPS URL public — dùng ngrok khi dev local

Local dev setup:
  1. npm install -g ngrok
  2. ngrok http 3001  (port NestJS)
  3. Copy ngrok URL → set VNPAY_IPN_URL
  4. Cập nhật IPN URL trong VNPAY merchant portal
```

### 3.2 Tham số VNPAY (bắt buộc)

| Tham số | Mô tả | Ví dụ |
|---------|-------|-------|
| `vnp_Version` | Phiên bản API | "2.1.0" |
| `vnp_Command` | Loại giao dịch | "pay" |
| `vnp_TmnCode` | Mã terminal | Từ env |
| `vnp_Amount` | Số tiền × 100 (VND, không thập phân) | 500000 × 100 = 50000000 |
| `vnp_CurrCode` | Đơn vị tiền tệ | "VND" |
| `vnp_TxnRef` | Mã tham chiếu của merchant | "uuid-1734567890" |
| `vnp_OrderInfo` | Mô tả đơn hàng (URL-encoded) | "Thanh+toan+dich+vu+Cham+soc+da" |
| `vnp_OrderType` | Loại hàng hoá | "other" |
| `vnp_Locale` | Ngôn ngữ | "vn" |
| `vnp_ReturnUrl` | URL redirect sau thanh toán | Từ env |
| `vnp_IpAddr` | IP của khách | Lấy từ request |
| `vnp_CreateDate` | Thời điểm tạo | "20251220093000" |
| `vnp_SecureHash` | Chữ ký HMAC-SHA512 | Tự tính |

### 3.3 Thuật toán tạo Payment URL

```typescript
import * as crypto from 'crypto';
import { format } from 'date-fns';

function buildVnpayUrl(params: {
  appointmentId: string;
  amount: number;        // VND (không nhân 100 ở đây)
  orderInfo: string;
  clientIp: string;
  txnRef: string;
}): string {
  const vnpParams: Record<string, string> = {
    vnp_Version:    '2.1.0',
    vnp_Command:    'pay',
    vnp_TmnCode:    process.env.VNPAY_TMN_CODE,
    vnp_Amount:     String(params.amount * 100),  // nhân 100
    vnp_CurrCode:   'VND',
    vnp_TxnRef:     params.txnRef,
    vnp_OrderInfo:  params.orderInfo,
    vnp_OrderType:  'other',
    vnp_Locale:     'vn',
    vnp_ReturnUrl:  process.env.VNPAY_RETURN_URL,
    vnp_IpAddr:     params.clientIp,
    vnp_CreateDate: format(new Date(), 'yyyyMMddHHmmss'),
  };

  // Sort keys alphabetically (VNPAY yêu cầu)
  const sortedKeys = Object.keys(vnpParams).sort();
  const signData = sortedKeys
    .map(k => `${k}=${encodeURIComponent(vnpParams[k]).replace(/%20/g, '+')}`)
    .join('&');

  const secureHash = crypto
    .createHmac('sha512', process.env.VNPAY_HASH_SECRET)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  const queryString = sortedKeys
    .map(k => `${k}=${encodeURIComponent(vnpParams[k]).replace(/%20/g, '+')}`)
    .join('&');

  return `${process.env.VNPAY_URL}?${queryString}&vnp_SecureHash=${secureHash}`;
}
```

> **Lưu ý encoding:** VNPAY dùng URL encoding với `+` thay cho space (không phải `%20`).  
> Phải encode từng giá trị trước khi build signData và query string.

### 3.4 Verify chữ ký (dùng cho cả Return URL và IPN)

```typescript
function verifyVnpaySignature(
  rawParams: Record<string, string>,
  hashSecret: string,
): boolean {
  const { vnp_SecureHash, vnp_SecureHashType, ...dataParams } = rawParams;

  // Sort và build signData (không bao gồm SecureHash)
  const signData = Object.keys(dataParams)
    .sort()
    .map(k => `${k}=${encodeURIComponent(dataParams[k]).replace(/%20/g, '+')}`)
    .join('&');

  const calculatedHash = crypto
    .createHmac('sha512', hashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  return calculatedHash.toLowerCase() === vnp_SecureHash.toLowerCase();
}
```

### 3.5 Response codes VNPAY quan trọng

| `vnp_ResponseCode` | `vnp_TransactionStatus` | Ý nghĩa |
|-------------------|------------------------|---------|
| `00` | `00` | Giao dịch thành công |
| `07` | — | Trừ tiền thành công nhưng giao dịch bị nghi ngờ (fraud) |
| `09` | — | Chưa đăng ký Internet Banking |
| `10` | — | Xác thực thông tin thẻ thất bại quá 3 lần |
| `11` | — | Đã hết hạn chờ thanh toán (mặc định 15 phút) |
| `12` | — | Thẻ/tài khoản bị khóa |
| `24` | — | Khách hủy giao dịch |
| `51` | — | Tài khoản không đủ số dư |
| `65` | — | Vượt hạn mức giao dịch trong ngày |
| `75` | — | Ngân hàng đang bảo trì |

> **Chỉ coi là SUCCESS khi:** `vnp_ResponseCode === "00"` VÀ `vnp_TransactionStatus === "00"`

---

## IV. Business Logic Chi tiết

### 4.1 POST /payments/vnpay/create — Tạo URL thanh toán

```
Input:
  - appointmentId: string (từ body)
  - currentUser: từ JWT

─────────────────────────────────────────
Validation:
  1. Load appointment WHERE id=? AND customerId=currentUser.id
     → 404 nếu không tồn tại hoặc không phải của user này
  
  2. appointment.status phải là COMPLETED
     → 400 "Chỉ thanh toán sau khi dịch vụ hoàn thành"
  
  3. Kiểm tra đã có Payment PAID chưa:
       paidPayment = prisma.payment.findFirst({
         where: { appointmentId, status: 'PAID' }
       })
       → Nếu đã PAID: 400 "Lịch hẹn này đã được thanh toán"
  
  4. Load store: status phải ACTIVE
─────────────────────────────────────────
Tạo Payment record:
  txnRef = `${appointmentId}-${Date.now()}`
  // Mỗi lần tạo request → txnRef mới → tránh VNPAY reject duplicate

  payment = prisma.payment.create({
    data: {
      appointmentId,
      customerId: currentUser.id,
      amount: appointment.price,  // dùng snapshot price, không phải service.price hiện tại
      status: 'PENDING',
      method: 'VNPAY',
      vnpTxnRef: txnRef,
    }
  })
─────────────────────────────────────────
Build VNPAY URL:
  paymentUrl = buildVnpayUrl({
    appointmentId,
    amount: appointment.price,
    orderInfo: `Thanh toan dich vu ${appointment.service.name} tai ${appointment.store.name}`,
    clientIp: getClientIp(request),  // X-Forwarded-For hoặc req.ip
    txnRef,
  })
─────────────────────────────────────────
Response:
  { paymentUrl, paymentId: payment.id }
  // Frontend redirect ngay đến paymentUrl
```

### 4.2 GET /payments/vnpay/return — Xử lý redirect từ VNPAY

```
VNPAY redirect browser về:
  GET /payments/vnpay/return?vnp_Amount=...&vnp_ResponseCode=...&vnp_SecureHash=...&...

Lưu ý quan trọng:
  - Đây là browser redirect, không phải server-to-server
  - Có thể bị fail nếu khách đóng browser
  - KHÔNG phải nguồn tin cậy duy nhất → IPN mới là chính
  - Nhưng vẫn phải handle để show UI kết quả cho khách

─────────────────────────────────────────
Logic:
  1. Đọc tất cả query params → vnpParams

  2. Verify chữ ký:
       isValid = verifyVnpaySignature(vnpParams, hashSecret)
       Nếu false → redirect /payment/result?error=invalid_signature

  3. Tìm Payment theo vnp_TxnRef:
       payment = prisma.payment.findFirst({
         where: { vnpTxnRef: vnpParams.vnp_TxnRef }
       })
       Nếu null → redirect /payment/result?error=not_found

  4. IDEMPOTENCY: Nếu payment đã PAID hoặc FAILED → bỏ qua, chỉ redirect
       if (payment.status !== 'PENDING') {
         return redirect(`/payment/result?status=${payment.status}&appointmentId=${payment.appointmentId}`)
       }

  5. Kiểm tra amount khớp:
       vnpAmount = parseInt(vnpParams.vnp_Amount) / 100
       if (vnpAmount !== parseFloat(payment.amount.toString())) {
         log('SECURITY WARNING: Amount mismatch', { expected: payment.amount, received: vnpAmount })
         return redirect('/payment/result?error=amount_mismatch')
       }

  6. Xử lý theo response code:
       if (vnpParams.vnp_ResponseCode === '00' && vnpParams.vnp_TransactionStatus === '00') {
         // SUCCESS
         await updatePaymentSuccess(payment.id, vnpParams)
         return redirect(`/payment/result?success=true&appointmentId=${payment.appointmentId}`)
       } else {
         // FAILURE
         await updatePaymentFailed(payment.id, vnpParams)
         const message = mapVnpayErrorCode(vnpParams.vnp_ResponseCode)
         return redirect(`/payment/result?success=false&message=${encodeURIComponent(message)}&appointmentId=${payment.appointmentId}`)
       }

─────────────────────────────────────────
Helper: updatePaymentSuccess(paymentId, vnpParams)
  prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'PAID',
      vnpTransactionNo: vnpParams.vnp_TransactionNo,
      vnpBankCode: vnpParams.vnp_BankCode,
      vnpCardType: vnpParams.vnp_CardType,
      vnpPayDate: vnpParams.vnp_PayDate,
      vnpResponseCode: vnpParams.vnp_ResponseCode,
      paidAt: new Date(),
    }
  })

Helper: updatePaymentFailed(paymentId, vnpParams)
  prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'FAILED',
      vnpResponseCode: vnpParams.vnp_ResponseCode,
      failedReason: mapVnpayErrorCode(vnpParams.vnp_ResponseCode),
    }
  })
```

### 4.3 POST /payments/vnpay/ipn — Webhook server-to-server

```
VNPAY POST đến URL này với body là application/x-www-form-urlencoded hoặc query params.

IPN là nguồn dữ liệu đáng tin cậy nhất. Logic giống Return URL nhưng:
  - KHÔNG redirect → trả về JSON cho VNPAY
  - Phải trả về { RspCode: "00", Message: "Confirm Success" } nếu OK
  - VNPAY sẽ retry IPN nếu nhận response khác "00"

─────────────────────────────────────────
Logic:

  Route: @Post('/vnpay/ipn')  @Public()  (KHÔNG cần JWT)
  // VNPAY gọi trực tiếp, không có JWT

  1. Đọc params từ req.query hoặc req.body

  2. Verify chữ ký:
       if (!verifyVnpaySignature(params, hashSecret)) {
         return { RspCode: '97', Message: 'Invalid Checksum' }
       }

  3. Tìm Payment theo vnp_TxnRef:
       payment = prisma.payment.findFirst({ where: { vnpTxnRef } })
       if (!payment) {
         return { RspCode: '01', Message: 'Order not found' }
       }

  4. Kiểm tra amount:
       if (vnpAmount !== payment.amount) {
         return { RspCode: '04', Message: 'Invalid Amount' }
       }

  5. IDEMPOTENCY — quan trọng nhất:
       if (payment.status === 'PAID') {
         return { RspCode: '02', Message: 'Order already confirmed' }
       }
       if (payment.status === 'FAILED') {
         return { RspCode: '02', Message: 'Order already confirmed' }
       }

  6. Xử lý:
       if (responseCode === '00' && transactionStatus === '00') {
         await updatePaymentSuccess(payment.id, params)
         // Gửi notification cho customer (async)
         this.notificationsService.notifyPaymentSuccess(payment)
       } else {
         await updatePaymentFailed(payment.id, params)
       }

  7. Luôn trả 200 + JSON cho VNPAY:
       return { RspCode: '00', Message: 'Confirm Success' }

─────────────────────────────────────────
IPN Response codes (VNPAY docs):
  "00" → Thành công (VNPAY nhận và không retry)
  "97" → Chữ ký sai
  "01" → Không tìm thấy đơn hàng
  "04" → Số tiền không khớp
  "02" → Đơn hàng đã được xử lý rồi (idempotent)
```

### 4.4 So sánh Return URL vs IPN

| Tiêu chí | Return URL | IPN |
|---------|------------|-----|
| Ai gọi | Browser của khách | VNPAY server |
| Mục đích | Hiển thị kết quả cho khách | Cập nhật trạng thái đáng tin cậy |
| Có thể bỏ lỡ? | Có (đóng browser) | Rất hiếm (VNPAY retry 5 lần) |
| Response | Redirect | JSON `{RspCode, Message}` |
| Bảo mật | Verify hash | Verify hash |
| Nguồn chính | ❌ | ✅ |

**Chiến lược Phase 5:**
- IPN là nguồn dữ liệu chính → cập nhật DB
- Return URL chỉ dùng để redirect đến `/payment/result` với đúng trạng thái
- UI ở `/payment/result` đọc trạng thái từ API (`GET /appointments/:id/payment`) chứ không tin query params mù quáng

### 4.5 Lấy Client IP đúng cách

```typescript
function getClientIp(request: Request): string {
  // Nếu behind nginx/proxy:
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return (forwarded as string).split(',')[0].trim();
  }
  return request.ip || '127.0.0.1';
}
```

> VNPAY yêu cầu `vnp_IpAddr`. Nếu gửi IP sai có thể bị reject ở một số ngân hàng.

### 4.6 Tạo Review — Business Rules

```
POST /appointments/:id/review

─────────────────────────────────────────
Pre-checks:
  1. [Guard] JwtAuthGuard → currentUser
  2. Load appointment WHERE id=? AND customerId=currentUser.id
     → 404 nếu không tìm thấy hoặc không phải của user này

  3. appointment.status phải là COMPLETED
     → 400 "Chỉ đánh giá sau khi dịch vụ hoàn thành"

  4. Kiểm tra Review chưa tồn tại:
       existingReview = prisma.review.findUnique({ where: { appointmentId: apt.id } })
       → 409 "Bạn đã đánh giá lịch hẹn này rồi"
       // @@unique([appointmentId]) ở DB cũng sẽ throw, nhưng check ở application layer tốt hơn

  5. dto.rating phải trong [1, 5]
─────────────────────────────────────────
Transaction — Tạo Review + Cập nhật ratings:

  prisma.$transaction(async (tx) => {

    // A. Tạo review
    const review = await tx.review.create({
      data: {
        appointmentId: apt.id,
        customerId: currentUser.id,
        storeId: apt.storeId,
        serviceId: apt.serviceId,
        staffId: apt.staffId,
        rating: dto.rating,
        comment: dto.comment,
        isVisible: true,
      }
    })

    // B. Cập nhật Store.avgRating + totalReviews
    const storeStats = await tx.review.aggregate({
      where: { storeId: apt.storeId, isVisible: true },
      _avg: { rating: true },
      _count: { id: true },
    })
    await tx.store.update({
      where: { id: apt.storeId },
      data: {
        avgRating: storeStats._avg.rating ?? 0,
        totalReviews: storeStats._count.id,
      }
    })

    // C. Cập nhật Service.avgRating
    const serviceStats = await tx.review.aggregate({
      where: { serviceId: apt.serviceId, isVisible: true },
      _avg: { rating: true },
    })
    await tx.service.update({
      where: { id: apt.serviceId },
      data: { avgRating: serviceStats._avg.rating ?? 0 }
    })

    // D. Cập nhật Staff.rating + totalReviews (nếu có staffId)
    if (apt.staffId) {
      const staffStats = await tx.review.aggregate({
        where: { staffId: apt.staffId, isVisible: true },
        _avg: { rating: true },
        _count: { id: true },
      })
      await tx.staff.update({
        where: { id: apt.staffId },
        data: {
          rating: staffStats._avg.rating ?? 0,
          totalReviews: staffStats._count.id,
        }
      })
    }

    return review
  })
─────────────────────────────────────────
Post-transaction:
  Gửi notification cho Owner:
    "Có đánh giá mới cho cơ sở của bạn — {rating} sao"

Response 201: { id, rating, comment, createdAt, customer: { fullName, avatarUrl } }
```

### 4.7 Cập nhật avgRating khi Admin ẩn/hiện review

```typescript
// PATCH /admin/reviews/:id/hide  và  PATCH /admin/reviews/:id/show
// Sau khi toggle isVisible → phải recalculate ratings

async toggleVisibility(reviewId: string, isVisible: boolean) {
  await prisma.$transaction(async (tx) => {
    const review = await tx.review.update({
      where: { id: reviewId },
      data: { isVisible }
    });

    // Recalculate tất cả 3 entities
    await this.recalculateRatings(tx, review.storeId, review.serviceId, review.staffId);
  });
}

// Tách hàm helper để dùng lại
async recalculateRatings(tx, storeId, serviceId, staffId?) {
  // Store
  const storeStats = await tx.review.aggregate({
    where: { storeId, isVisible: true },
    _avg: { rating: true },
    _count: { id: true },
  });
  await tx.store.update({
    where: { id: storeId },
    data: { avgRating: storeStats._avg.rating ?? 0, totalReviews: storeStats._count.id }
  });

  // Service
  const svcStats = await tx.review.aggregate({
    where: { serviceId, isVisible: true },
    _avg: { rating: true },
  });
  await tx.service.update({ where: { id: serviceId }, data: { avgRating: svcStats._avg.rating ?? 0 } });

  // Staff
  if (staffId) {
    const staffStats = await tx.review.aggregate({
      where: { staffId, isVisible: true },
      _avg: { rating: true },
      _count: { id: true },
    });
    await tx.staff.update({ where: { id: staffId }, data: { rating: staffStats._avg.rating ?? 0, totalReviews: staffStats._count.id } });
  }
}
```

### 4.8 Xem danh sách Reviews (public)

```typescript
// GET /stores/:storeId/reviews?page=1&limit=10&rating=5

async findByStore(storeId: string, filter: ReviewFilterDto) {
  const where: Prisma.ReviewWhereInput = {
    storeId,
    isVisible: true,
    ...(filter.rating && { rating: filter.rating }),
  };

  const [data, total] = await prisma.$transaction([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
      include: {
        customer: { select: { fullName: true, avatarUrl: true } },
        service: { select: { name: true } },
        staff: { include: { user: { select: { fullName: true } } } },
      },
    }),
    prisma.review.count({ where }),
  ]);

  // Rating breakdown: { 5: 23, 4: 12, 3: 5, 2: 1, 1: 0 }
  const breakdown = await prisma.review.groupBy({
    by: ['rating'],
    where: { storeId, isVisible: true },
    _count: { rating: true },
  });

  return { data, total, page: filter.page, limit: filter.limit, breakdown };
}
```

---

## V. API Endpoints

### Payment

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `POST` | `/payments/vnpay/create` | JWT + customer | Tạo VNPAY payment URL |
| `GET` | `/payments/vnpay/return` | @Public | VNPAY redirect về (browser) |
| `POST` | `/payments/vnpay/ipn` | @Public | VNPAY server-to-server webhook |
| `GET` | `/payments/my` | JWT | Lịch sử thanh toán của customer |
| `GET` | `/appointments/:id/payment` | JWT | Trạng thái thanh toán của 1 appointment |

### Review

| Method | Endpoint | Guard | Mô tả |
|--------|----------|-------|-------|
| `POST` | `/appointments/:id/review` | JWT + customer chính chủ | Tạo đánh giá |
| `GET` | `/appointments/:id/review` | Public | Xem review của 1 appointment |
| `GET` | `/stores/:storeId/reviews` | Public | Reviews của shop (pagination + filter) |
| `GET` | `/services/:serviceId/reviews` | Public | Reviews của dịch vụ |
| `PATCH` | `/admin/reviews/:id/hide` | JWT + SUPER_ADMIN | Ẩn review vi phạm |
| `PATCH` | `/admin/reviews/:id/show` | JWT + SUPER_ADMIN | Hiện lại review |

---

## VI. DTOs

### `CreatePaymentDto`

```typescript
export class CreatePaymentDto {
  @IsUUID()
  appointmentId: string;
}
```

### `VnpayReturnQueryDto`

```typescript
// Dùng cho @Query() decorator
export class VnpayReturnQueryDto {
  @IsString() vnp_TmnCode: string;
  @IsString() vnp_Amount: string;
  @IsString() vnp_BankCode: string;
  @IsString() vnp_BankTranNo: string;
  @IsString() vnp_CardType: string;
  @IsString() vnp_PayDate: string;
  @IsString() vnp_OrderInfo: string;
  @IsString() vnp_TransactionNo: string;
  @IsString() vnp_ResponseCode: string;
  @IsString() vnp_TransactionStatus: string;
  @IsString() vnp_TxnRef: string;
  @IsString() vnp_SecureHashType: string;
  @IsString() vnp_SecureHash: string;
}
```

### `CreateReviewDto`

```typescript
export class CreateReviewDto {
  @IsInt() @Min(1) @Max(5)
  rating: number;

  @IsOptional() @IsString() @MaxLength(1000)
  comment?: string;

  @IsOptional() @IsArray() @IsUrl({}, { each: true }) @ArrayMaxSize(5)
  imageUrls?: string[];
}
```

### `ReviewFilterDto`

```typescript
export class ReviewFilterDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) @Type(() => Number)
  rating?: number;   // lọc theo số sao cụ thể

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;     // default: 1

  @IsOptional() @IsInt() @Min(1) @Max(50) @Type(() => Number)
  limit?: number;    // default: 10
}
```

---

## VII. Cấu trúc thư mục

```
src/features/
├── booking/
│   └── payments/
│       ├── payments.module.ts
│       ├── payments.controller.ts
│       │   ├── @Post('vnpay/create')     ← tạo URL
│       │   ├── @Get('vnpay/return')      ← browser redirect
│       │   ├── @Post('vnpay/ipn')        ← server webhook
│       │   ├── @Get('my')                ← lịch sử
│       │   └── @Get('appointments/:id/payment')
│       ├── payments.service.ts
│       │   ├── createVnpayUrl()
│       │   ├── handleReturn()
│       │   ├── handleIpn()
│       │   ├── updatePaymentSuccess()
│       │   ├── updatePaymentFailed()
│       │   └── findPaymentByAppointment()
│       ├── vnpay.util.ts                 ← buildVnpayUrl(), verifyVnpaySignature()
│       └── dto/
│           ├── create-payment.dto.ts
│           └── vnpay-return-query.dto.ts
│
└── reviews/
    ├── reviews.module.ts
    ├── reviews.controller.ts
    │   ├── @Post('appointments/:id/review')
    │   ├── @Get('appointments/:id/review')
    │   ├── @Get('stores/:storeId/reviews')
    │   ├── @Get('services/:serviceId/reviews')
    │   └── @Patch('admin/reviews/:id/hide|show')
    ├── reviews.service.ts
    │   ├── create()
    │   ├── findByStore()
    │   ├── findByService()
    │   ├── findByAppointment()
    │   ├── toggleVisibility()
    │   └── recalculateRatings()          ← private helper
    └── dto/
        ├── create-review.dto.ts
        └── review-filter.dto.ts
```

---

## VIII. Permissions cần thêm

```typescript
PAYMENT: {
  CREATE: 'CREATE_PAYMENT',
  VIEW:   'VIEW_PAYMENT',
},
REVIEW: {
  CREATE: 'CREATE_REVIEW',
  VIEW:   'VIEW_REVIEW',
  MANAGE: 'MANAGE_REVIEW',   // hide/show — chỉ SUPER_ADMIN
},
```

| Permission | CUSTOMER | STAFF | SHOP_OWNER | SUPER_ADMIN |
|-----------|----------|-------|------------|-------------|
| `CREATE_PAYMENT` | ✅ (own) | ❌ | ❌ | ✅ |
| `VIEW_PAYMENT` | ✅ (own) | ❌ | ✅ (shop) | ✅ |
| `CREATE_REVIEW` | ✅ (COMPLETED apt) | ❌ | ❌ | ✅ |
| `VIEW_REVIEW` | ✅ | ✅ | ✅ | ✅ |
| `MANAGE_REVIEW` | ❌ | ❌ | ❌ | ✅ |

---

## IX. Frontend — Chi tiết

### `/appointments/[id]/payment` — Trang thanh toán

```
Layout:
  ┌──────────────────────────────────────┐
  │  Thanh toán lịch hẹn                │
  │  ─────────────────────────────────  │
  │  Dịch vụ:  Chăm sóc da cơ bản     │
  │  Cơ sở:    Glowora Hà Nội          │
  │  Thời gian: Thứ 7, 20/12 lúc 09:00 │
  │  Nhân viên: Nguyễn Thị Lan          │
  │  ─────────────────────────────────  │
  │  Tổng cộng:           500.000 ₫    │
  │                                      │
  │  [  Thanh toán qua VNPAY  ]          │
  │                                      │
  │  🔒 Thanh toán bảo mật qua VNPAY   │
  └──────────────────────────────────────┘

Conditions:
  - Chỉ hiển thị nếu appointment.status === 'COMPLETED'
  - Nếu đã PAID → hiển thị "Đã thanh toán" badge + thông tin thanh toán
  - Nếu chưa PAID → hiển thị nút

Click "Thanh toán qua VNPAY":
  1. POST /payments/vnpay/create { appointmentId }
  2. Loading spinner
  3. Nhận { paymentUrl } → window.location.href = paymentUrl
  4. Browser chuyển sang trang VNPAY
```

### `/payment/result` — Kết quả thanh toán

```
Query params: success=true|false, appointmentId=uuid, message=string

Component tự call: GET /appointments/:appointmentId/payment
để verify kết quả thực tế từ DB (không tin params mù quáng)

Nếu success:
  ┌──────────────────────────────────────┐
  │          ✅ Thanh toán thành công   │
  │                                      │
  │  Số tiền:    500.000 ₫              │
  │  Ngân hàng:  Vietcombank            │
  │  Mã giao dịch: 14823741             │
  │  Thời gian:  20/12/2025 09:35       │
  │                                      │
  │  [  Đánh giá dịch vụ  ]             │
  │  [  Xem lịch hẹn      ]             │
  └──────────────────────────────────────┘

Nếu failure:
  ┌──────────────────────────────────────┐
  │          ❌ Thanh toán thất bại     │
  │                                      │
  │  Lý do: Bạn đã hủy giao dịch       │
  │                                      │
  │  [  Thử lại             ]           │
  │  [  Về trang lịch hẹn  ]            │
  └──────────────────────────────────────┘

Loading state: Skeleton trong khi verify từ API
Error mapping: mapVnpayErrorCode() → message tiếng Việt
```

### `/appointments/[id]/review` — Form đánh giá

```
Guard: appointment.status === 'COMPLETED' && !appointment.review
  → Nếu không thỏa: redirect /appointments

Layout:
  ┌──────────────────────────────────────┐
  │  Đánh giá dịch vụ                   │
  │                                      │
  │  Dịch vụ: Chăm sóc da cơ bản       │
  │  Nhân viên: Nguyễn Thị Lan          │
  │                                      │
  │  Đánh giá của bạn:                  │
  │  ★ ★ ★ ★ ☆   (click để chọn)      │
  │                                      │
  │  Nhận xét:                          │
  │  ┌────────────────────────────────┐ │
  │  │ Dịch vụ rất tốt, nhân viên    │ │
  │  │ nhiệt tình...                  │ │
  │  └────────────────────────────────┘ │
  │  (tối đa 1000 ký tự)               │
  │                                      │
  │  [  Gửi đánh giá  ]                 │
  └──────────────────────────────────────┘

Submit → POST /appointments/:id/review
Success → toast "Cảm ơn bạn đã đánh giá!" → redirect /appointments
```

### `/spas/[id]` — Cập nhật hiển thị Reviews

```
Header section (cập nhật):
  Glowora Hà Nội     ★ 4.8  (127 đánh giá)
  Địa chỉ: 123 Nguyễn Du, Hà Nội

Rating breakdown widget:
  ★★★★★  ████████████░  65%  (83)
  ★★★★☆  ████░░░░░░░░░  25%  (32)
  ★★★☆☆  ██░░░░░░░░░░░   8%  (10)
  ★★☆☆☆  ░░░░░░░░░░░░░   2%   (2)
  ★☆☆☆☆  ░░░░░░░░░░░░░   0%   (0)

Filter: [Tất cả] [5 sao] [4 sao] [3 sao] [2 sao] [1 sao]

Review cards:
  ┌──────────────────────────────────────┐
  │ [Avatar] Nguyễn Thị B.  ★★★★★     │
  │          20/12/2025                  │
  │  Dịch vụ: Chăm sóc da cơ bản       │
  │                                      │
  │  "Dịch vụ rất tốt, nhân viên        │
  │   nhiệt tình và chuyên nghiệp. Sẽ  │
  │   quay lại lần sau!"                │
  └──────────────────────────────────────┘

Pagination: 10 reviews/page
Load more button hoặc infinite scroll
```

### Cập nhật `/appointments` — thêm button "Đánh giá"

```
Card appointment với status=COMPLETED:
  - Nếu chưa có review: hiển thị nút [★ Đánh giá] → /appointments/:id/review
  - Nếu đã review: hiển thị "Đã đánh giá ★ {rating} sao"

Card appointment với status=COMPLETED (chưa thanh toán):
  - Hiển thị nút [💳 Thanh toán] → /appointments/:id/payment
  - Và nút [★ Đánh giá] (không bắt buộc thanh toán trước)
```

---

## X. Thứ tự Implement

### Bước 1 — Schema (bắt buộc trước)

- [ ] Sửa `Appointment`: thêm field `price Decimal` — **cần patch `AppointmentsService.create()` từ Phase 4** để save `service.price` vào `appointment.price`
- [ ] Sửa `Payment`: thêm tất cả field VNPAY-specific (`vnpTxnRef`, `vnpTransactionNo`, `vnpBankCode`, `vnpCardType`, `vnpPayDate`, `vnpResponseCode`, `paidAt`, `failedReason`)
- [ ] Thêm enum `PaymentStatus`, `PaymentMethod` nếu chưa có
- [ ] Sửa `Review`: thêm `@@unique([appointmentId])`, `imageUrls Json?`, verify `isVisible`
- [ ] Sửa `Staff`: verify có `rating` và `totalReviews`
- [ ] `prisma migrate dev --name phase5_payment_review`
- [ ] `prisma generate`

### Bước 2 — VNPAY Utils

- [ ] Tạo `payments/vnpay.util.ts`:
  - `buildVnpayUrl(params): string`
  - `verifyVnpaySignature(params, hashSecret): boolean`
  - `mapVnpayErrorCode(code: string): string` — map code → message tiếng Việt
  - `getClientIp(request): string`
- [ ] Thêm env vars: `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL`, `VNPAY_RETURN_URL`, `VNPAY_IPN_URL`
- [ ] Setup ngrok cho local dev

### Bước 3 — Patch AppointmentsService (Phase 4 fix)

- [ ] Sửa `AppointmentsService.create()`: thêm `price: service.price` vào appointment data
- [ ] Verify migration đã thêm `price` column

### Bước 4 — PaymentsService

- [ ] `createVnpayUrl(appointmentId, userId, clientIp)`:
  - Validate appointment status
  - Check existing PAID payment
  - Tạo Payment record PENDING
  - Build & return VNPAY URL
- [ ] `handleReturn(vnpParams)`:
  - Verify signature
  - Idempotency check
  - Verify amount
  - `updatePaymentSuccess()` hoặc `updatePaymentFailed()`
  - Return redirect URL
- [ ] `handleIpn(vnpParams)`:
  - Verify signature
  - Idempotency check
  - Verify amount
  - Update Payment
  - Notify customer
  - Return `{ RspCode, Message }`
- [ ] `findPaymentByAppointment(appointmentId, userId)`
- [ ] `findMyPayments(userId, filter)`

### Bước 5 — PaymentsController

- [ ] `POST /payments/vnpay/create` — JWT required
- [ ] `GET /payments/vnpay/return` — @Public, trả về redirect
- [ ] `POST /payments/vnpay/ipn` — @Public, trả về JSON
- [ ] `GET /payments/my` — JWT required
- [ ] `GET /appointments/:id/payment` — JWT required
- [ ] Swagger annotations

### Bước 6 — ReviewsService

- [ ] `create(appointmentId, userId, dto)`:
  - Validate appointment status + ownership
  - Check duplicate review
  - Transaction: create review + recalculate 3 ratings
  - Notify owner
- [ ] `findByStore(storeId, filter)` — include rating breakdown
- [ ] `findByService(serviceId, filter)`
- [ ] `findByAppointment(appointmentId)`
- [ ] `toggleVisibility(reviewId, isVisible)` — recalculate ratings
- [ ] `recalculateRatings(tx, storeId, serviceId, staffId?)` — private helper

### Bước 7 — ReviewsController

- [ ] Tất cả routes + Swagger annotations
- [ ] Admin routes: `PATCH /admin/reviews/:id/hide`, `show`

### Bước 8 — Permissions & Seed

- [ ] Thêm `PAYMENT.*`, `REVIEW.*`, `MANAGE_REVIEW` vào `permissions.ts`
- [ ] Cập nhật seed

### Bước 9 — Frontend

- [ ] `lib/payments.api.ts`: createVnpayPayment, getPaymentByAppointment, getMyPayments
- [ ] `lib/reviews.api.ts`: createReview, getStoreReviews, getServiceReviews
- [ ] `app/(customer)/appointments/[id]/payment/page.tsx`
- [ ] `app/payment/result/page.tsx` — verify từ API + hiển thị kết quả
- [ ] `app/(customer)/appointments/[id]/review/page.tsx` — star rating form
- [ ] Cập nhật `/appointments` — thêm "Thanh toán" + "Đánh giá" buttons
- [ ] Cập nhật `/spas/[id]` — avgRating header + reviews section với breakdown + filter
- [ ] `components/StarRating.tsx` — reusable component (interactive + display mode)
- [ ] `components/ReviewCard.tsx` — reusable card hiển thị 1 review

---

## XI. Test Cases End-to-End

```bash
# 1. Tạo payment URL sau khi dịch vụ hoàn thành
POST /payments/vnpay/create { appointmentId }  [Bearer customerToken]
→ 201, { paymentUrl: "https://sandbox.vnpayment.vn/...", paymentId }

# 2. Tạo payment cho appointment chưa COMPLETED
POST /payments/vnpay/create { appointmentId: "apt-pending-status" }
→ 400 "Chỉ thanh toán sau khi dịch vụ hoàn thành"

# 3. Tạo payment cho appointment đã PAID
POST /payments/vnpay/create { appointmentId: "apt-already-paid" }
→ 400 "Lịch hẹn này đã được thanh toán"

# 4. VNPAY gọi IPN (success)
POST /payments/vnpay/ipn?vnp_ResponseCode=00&vnp_TransactionStatus=00&...
→ 200 { RspCode: "00", Message: "Confirm Success" }
→ Payment.status = PAID trong DB

# 5. VNPAY gọi IPN lần 2 (idempotent)
POST /payments/vnpay/ipn (cùng params)
→ 200 { RspCode: "02", Message: "Order already confirmed" }
→ DB không thay đổi

# 6. IPN với chữ ký sai
POST /payments/vnpay/ipn (tampered params)
→ 200 { RspCode: "97", Message: "Invalid Checksum" }

# 7. IPN với amount sai
POST /payments/vnpay/ipn (vnp_Amount bị sửa)
→ 200 { RspCode: "04", Message: "Invalid Amount" }

# 8. Return URL sau thanh toán thành công
GET /payments/vnpay/return?vnp_ResponseCode=00&...
→ 302 redirect /payment/result?success=true&appointmentId=uuid

# 9. Return URL sau khách hủy
GET /payments/vnpay/return?vnp_ResponseCode=24&...
→ 302 redirect /payment/result?success=false&message=...

# 10. Đánh giá sau dịch vụ hoàn thành
POST /appointments/:id/review { rating: 5, comment: "Rất hài lòng" }
→ 201 { id, rating: 5, comment, createdAt }
→ Store.avgRating, Service.avgRating, Staff.rating đã cập nhật

# 11. Đánh giá lần 2 (duplicate)
POST /appointments/:id/review { rating: 3 }
→ 409 "Bạn đã đánh giá lịch hẹn này rồi"

# 12. Đánh giá appointment chưa COMPLETED
POST /appointments/:id/review { rating: 4 }  (status=PENDING)
→ 400 "Chỉ đánh giá sau khi dịch vụ hoàn thành"

# 13. Xem reviews của store
GET /stores/:storeId/reviews?page=1&limit=10
→ 200 { data: [...], total, breakdown: { 5: 23, 4: 12, ... } }

# 14. Admin ẩn review
PATCH /admin/reviews/:id/hide  [Bearer adminToken]
→ 200 { isVisible: false }
→ Store.avgRating đã được recalculate (không tính review bị ẩn)

# 15. Verify avgRating sau khi ẩn review
GET /stores/:storeId  → avgRating đã giảm
GET /services/:serviceId → avgRating đã giảm
```

---

## XII. Rủi ro & Lưu ý

| Vấn đề | Giải pháp |
|--------|----------|
| **IPN URL phải là public HTTPS** | Dùng ngrok khi dev local; HTTPS cert khi deploy |
| **VNPAY Sandbox chậm hơn production** | Bình thường; không phải bug |
| **vnp_Amount = amount × 100** dễ quên | Test kỹ: 500.000₫ → `vnp_Amount=50000000` |
| **Encoding đặc biệt trong vnp_OrderInfo** | URL encode, dùng `+` thay `%20`, không dùng ký tự đặc biệt |
| **IPN retry từ VNPAY** | Handle idempotent bằng check `payment.status !== 'PENDING'` |
| **Amount mismatch attack** | Luôn verify `vnp_Amount` với `payment.amount` trong DB |
| **Return URL params bị tamper** | Luôn verify từ DB qua `GET /appointments/:id/payment`, không tin query params |
| **avgRating precision** | Dùng `Decimal(3,2)` trong DB; JavaScript `toFixed(1)` khi hiển thị |
| **Review sau thanh toán hay không?** | Phase 5: không bắt buộc — COMPLETED là đủ để review |
| **Stripe (optional)** | Bỏ qua Phase 5 nếu không có thời gian — VNPAY đủ cho đồ án |
| **Refund** | Phase 5 không implement — ghi chú rõ cho Phase 6 |
| **Image upload cho review** | Phase 5 có thể bỏ `imageUrls` nếu không đủ thời gian |
| **Rate limiting IPN endpoint** | Nginx rate limit; VNPAY IP whitelist (optional) |
| **`appointment.price` cần patch từ Phase 4** | Quan trọng — không có `price` snapshot thì không biết charge bao nhiêu |

---

## XIII. Môi trường và Cấu hình

### `.env` bổ sung

```env
# VNPAY
VNPAY_TMN_CODE=your_tmn_code_from_sandbox
VNPAY_HASH_SECRET=your_hash_secret_from_sandbox
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:3000/payment/result
VNPAY_IPN_URL=https://abc123.ngrok.io/payments/vnpay/ipn
```

### Setup ngrok cho local dev

```bash
# Terminal 1: Chạy NestJS
npm run start:dev  # port 3001

# Terminal 2: Chạy ngrok
ngrok http 3001
# Copy URL: https://abc123.ngrok.io

# Cập nhật .env:
VNPAY_IPN_URL=https://abc123.ngrok.io/payments/vnpay/ipn

# Vào VNPAY sandbox merchant portal:
# → Cập nhật IPN URL → Save
```

### Checklist trước khi test VNPAY

- [ ] `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET` đã được set đúng từ sandbox
- [ ] ngrok đang chạy và IPN URL đã cập nhật trong merchant portal
- [ ] `VNPAY_RETURN_URL` trỏ đúng về frontend (`http://localhost:3000/payment/result`)
- [ ] `VNPAY_IPN_URL` là HTTPS URL public
- [ ] `Appointment.price` đã được lưu khi tạo (Phase 4 patch)
- [ ] Có ít nhất 1 appointment với status=COMPLETED để test
