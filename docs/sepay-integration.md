# Tích hợp SePay — Hướng dẫn cấu hình

## Kiến trúc tổng quan

Mỗi shop tự đăng ký tài khoản SePay **miễn phí** và liên kết tài khoản ngân hàng của mình.  
Khi khách chuyển khoản, SePay của shop phát hiện giao dịch và **gọi về platform** để xác nhận booking.  
Platform chỉ nhận webhook — không chạm vào tiền, không cần tài khoản SePay riêng.

```
Khách chuyển khoản
       │
       ▼
Tài khoản ngân hàng của Shop  ◄── Tiền về thẳng đây
       │
       │  SePay của shop phát hiện giao dịch
       ▼
POST /payments/sepay/webhook  ◄── SePay gọi về platform
       │
       ▼
Platform xác nhận Booking (DEPOSIT_PAID / CONFIRMED)
       │
       ▼
Gửi thông báo cho khách + shop
```

---

## Phần 1: Cài đặt phía Platform (Developer — làm 1 lần)

Việc duy nhất platform cần làm là **tạo một chuỗi bí mật** dùng chung cho tất cả shop.

### Bước 1: Tạo SEPAY_WEBHOOK_SECRET

Tự đặt một chuỗi ngẫu nhiên, đủ dài, khó đoán. Ví dụ sinh bằng lệnh:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Kết quả ví dụ: a3f8c2e1d4b7...
```

### Bước 2: Thêm vào `.env`

```env
SEPAY_WEBHOOK_SECRET=a3f8c2e1d4b7...  # Chuỗi bạn vừa tạo
```

### Bước 3: Chuẩn bị URL webhook công khai

SePay cần gọi được vào server của platform. URL webhook là:

```
https://your-domain.com/payments/sepay/webhook
```

> Khi dev local, dùng ngrok:
> ```bash
> ngrok http 8080
> # Lấy URL dạng https://xxxx.ngrok-free.app
> # → Webhook URL: https://xxxx.ngrok-free.app/payments/sepay/webhook
> ```

### Bước 4: Chia sẻ thông tin cho shop owner

Mỗi khi có shop mới muốn bật thanh toán online, cung cấp cho họ 2 thứ:

| Thông tin | Giá trị |
|---|---|
| Webhook URL | `https://your-domain.com/payments/sepay/webhook` |
| Webhook Token | Giá trị `SEPAY_WEBHOOK_SECRET` trong `.env` |

> **Bảo mật:** `SEPAY_WEBHOOK_SECRET` là bí mật chung. Chỉ chia sẻ với shop owner đã được duyệt.  
> Không thay đổi giá trị này sau khi các shop đã cấu hình xong — sẽ làm hỏng webhook của tất cả.

---

## Phần 2: Liên kết tài khoản ngân hàng (Shop Owner — làm cho mỗi shop)

Shop owner cần thực hiện **2 việc độc lập** nhau:

- **Việc 1**: Điền thông tin tài khoản ngân hàng vào app (để tạo QR cho khách quét)
- **Việc 2**: Cài đặt SePay để tự động xác nhận thanh toán (bắt buộc nếu muốn tự động)

---

### Việc 1 — Cấu hình tài khoản ngân hàng trong app

#### Tìm BIN ngân hàng

BIN là mã định danh ngân hàng, cần để tạo mã QR VietQR.

| Ngân hàng | BIN |
|---|---|
| MB Bank | 970422 |
| Vietcombank | 970436 |
| Techcombank | 970407 |
| VPBank | 970432 |
| ACB | 970416 |
| BIDV | 970418 |
| Vietinbank | 970415 |
| TPBank | 970423 |
| Sacombank | 970403 |
| HDBank | 970437 |
| VIB | 970441 |
| SHB | 970443 |

Tra cứu đầy đủ: [https://api.vietqr.io/v2/banks](https://api.vietqr.io/v2/banks)

#### Gọi API cấu hình

```http
PUT /stores/{storeId}/payment-config
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "bankBin": "970422",
  "bankAccountNo": "0001234567890",
  "bankAccountName": "NGUYEN VAN A"
}
```

| Field | Yêu cầu |
|---|---|
| `bankBin` | Tra bảng trên |
| `bankAccountNo` | Số tài khoản ngân hàng (không phải số thẻ) |
| `bankAccountName` | **In hoa, không dấu**, đúng với tên trên tài khoản |

Sau bước này, khi khách tạo thanh toán, hệ thống sẽ tự động sinh QR VietQR với thông tin ngân hàng của shop.

---

### Việc 2 — Đăng ký SePay và cấu hình webhook (để xác nhận tự động)

Nếu không làm bước này, khách vẫn chuyển khoản được nhưng booking sẽ **không tự động cập nhật** — shop phải xác nhận thủ công mỗi lần.

#### Bước 2.1: Đăng ký tài khoản SePay

Truy cập [https://sepay.vn](https://sepay.vn) → Đăng ký → Đăng nhập vào dashboard.

#### Bước 2.2: Thêm tài khoản ngân hàng vào SePay

Trong dashboard SePay:

1. Vào **Tài khoản ngân hàng → Thêm tài khoản**
2. Chọn ngân hàng, nhập số tài khoản
3. Xác thực quyền sở hữu theo hướng dẫn của SePay (thường yêu cầu chuyển khoản 1.000đ xác nhận)

#### Bước 2.3: Cấu hình webhook trong SePay

1. Vào **Cài đặt → Webhook / Tích hợp**
2. Thêm webhook mới:

| Trường | Giá trị |
|---|---|
| **Webhook URL** | URL do platform cung cấp (ví dụ: `https://glowora.vn/payments/sepay/webhook`) |
| **Webhook Token** | Chuỗi bí mật do platform cung cấp (`SEPAY_WEBHOOK_SECRET`) |

3. Lưu lại và bật webhook

> **Lưu ý:** Shop **không tự tạo** Webhook Token — phải dùng đúng giá trị do platform developer cung cấp.  
> Đây là cơ chế xác thực: khi SePay gọi về platform, nó gửi token này trong header,  
> platform kiểm tra khớp mới xử lý.

#### Bước 2.4: Kiểm tra webhook hoạt động

Thực hiện một giao dịch test nhỏ (chuyển khoản từ ví khác sang tài khoản shop).  
Nếu cấu hình đúng, SePay sẽ gọi về webhook và log sẽ xuất hiện ở phía server.

---

## Phần 3: Luồng thanh toán từ phía khách hàng

### 1. Tạo lệnh thanh toán

```http
POST /payments/sepay/create
Authorization: Bearer {customer_token}
Content-Type: application/json

{
  "bookingId": "uuid-booking-id",
  "paymentType": "DEPOSIT"
}
```

`paymentType` có thể là `DEPOSIT` (chỉ đặt cọc) hoặc `FULL` (thanh toán toàn bộ).  
Chỉ có hiệu lực khi booking đang ở trạng thái `DEPOSIT_PENDING`.

**Response:**

```json
{
  "paymentId": "uuid...",
  "sepayCode": "GWRABC12345",
  "amount": 150000,
  "content": "GWRABC12345",
  "bankInfo": {
    "bankBin": "970422",
    "accountNo": "0001234567890",
    "accountName": "NGUYEN VAN A"
  },
  "qrUrl": "https://img.vietqr.io/image/970422-0001234567890-compact2.jpg?amount=150000&addInfo=GWRABC12345&accountName=NGUYEN+VAN+A",
  "expiredAt": "2026-06-03T10:15:00.000Z"
}
```

### 2. Hiển thị QR cho khách quét

- Dùng `qrUrl` để hiển thị ảnh QR trực tiếp (thư viện VietQR tạo QR từ URL, không cần server render)
- Nội dung chuyển khoản (`content`) đã được điền sẵn vào QR — khách chỉ cần quét và xác nhận
- QR hết hạn sau **15 phút** (`expiredAt`)

### 3. Sau khi khách chuyển khoản

SePay phát hiện giao dịch → gọi webhook về platform → platform tự động:
- Xác nhận booking (`DEPOSIT_PAID` hoặc `CONFIRMED`)
- Gửi thông báo app cho khách và shop

### 4. Frontend kiểm tra trạng thái (polling)

```http
GET /bookings/{bookingId}/payment
Authorization: Bearer {customer_token}
```

Poll mỗi 3–5 giây trong vòng 15 phút. Khi `status = "PAID"` thì dừng.

---

## Phần 4: Các trường hợp đặc biệt

### Khách quên ghi nội dung / ghi sai `sepayCode`

Hệ thống không thể tự match. Shop phải xác nhận thủ công sau khi đối chiếu sao kê.

### Khách chuyển thiếu tiền

Payment sẽ bị mark `FAILED`. Khách cần tạo lệnh thanh toán mới (`POST /payments/sepay/create`).

### QR hết hạn (sau 15 phút)

Gọi lại `POST /payments/sepay/create` để tạo QR mới. Lệnh cũ tự động bị hủy.

### Shop đổi tài khoản ngân hàng

1. Cập nhật trong app: `PUT /stores/:id/payment-config`
2. Vào SePay: xóa tài khoản cũ, thêm tài khoản mới
3. Giữ nguyên webhook URL và token — không cần cấu hình lại

---

## Phần 5: API Endpoints tổng hợp

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| `POST` | `/payments/sepay/create` | Tạo lệnh thanh toán | JWT (customer) |
| `POST` | `/payments/sepay/webhook` | SePay gọi về khi tiền về | Public + Webhook Token |
| `GET` | `/payments/my` | Lịch sử thanh toán | JWT |
| `GET` | `/bookings/:id/payment` | Trạng thái thanh toán của booking | JWT |
| `GET` | `/stores/:id/payment-config` | Xem cấu hình ngân hàng | JWT (owner) |
| `PUT` | `/stores/:id/payment-config` | Cập nhật thông tin tài khoản ngân hàng | JWT (owner) |
| `DELETE` | `/stores/:id/payment-config` | Xóa cấu hình thanh toán | JWT (owner) |
