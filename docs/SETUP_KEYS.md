# Hướng dẫn lấy API Keys — Glowora Backend

> Sau khi lấy xong, điền vào file `.env` tại thư mục gốc dự án.

---

## 1. Google Gemini API Key (`GEMINI_API_KEY`)

**Dùng cho:** AI chatbot tư vấn khách hàng trong module Messaging.

### Các bước:

1. Truy cập **https://aistudio.google.com/app/apikey**
2. Đăng nhập bằng tài khoản Google
3. Nhấn **"Create API key"**
4. Chọn **"Create API key in new project"** (hoặc chọn project có sẵn)
5. Copy key hiện ra (dạng `AIzaSy...`)

### Điền vào `.env`:
```
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

> **Lưu ý:** Model đang dùng là `gemini-1.5-flash` — free tier cho phép 15 requests/phút,
> đủ dùng cho môi trường dev và demo đồ án.

---

## 2. Telegram Bot (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_URL`)

**Dùng cho:** Staff nhận thông báo escalation từ AI và reply lại cho khách qua Telegram.

### Bước 1 — Tạo bot, lấy `TELEGRAM_BOT_TOKEN`:

1. Mở Telegram, tìm kiếm **@BotFather**
2. Gửi lệnh `/newbot`
3. Đặt tên hiển thị cho bot (VD: `Glowora Staff Bot`)
4. Đặt username bot (phải kết thúc bằng `bot`, VD: `glowora_staff_bot`)
5. BotFather sẽ trả về token dạng: `7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Điền vào `.env`:
```
TELEGRAM_BOT_TOKEN=7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### Bước 2 — Lấy `TELEGRAM_WEBHOOK_URL` (dùng ngrok khi dev):

Webhook là URL công khai để Telegram gọi vào server khi staff nhắn tin. Khi dev local cần dùng **ngrok** để expose port 8080.

#### Cài ngrok (nếu chưa có):
```bash
# Windows — tải tại https://ngrok.com/download, giải nén rồi chạy:
ngrok authtoken <your-ngrok-token>   # đăng ký miễn phí tại ngrok.com
```

#### Chạy ngrok:
```bash
ngrok http 8080
```

Ngrok sẽ hiện ra URL dạng:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:8080
```

#### Điền vào `.env`:
```
TELEGRAM_WEBHOOK_URL=https://abc123.ngrok-free.app/telegram/webhook
```

> **Lưu ý:**
> - URL ngrok thay đổi mỗi lần restart (trừ khi dùng domain cố định — trả phí).
>   Mỗi lần restart ngrok phải cập nhật lại `TELEGRAM_WEBHOOK_URL` và restart server.
> - Khi deploy lên server thật, thay bằng domain cố định: `https://api.glowora.vn/telegram/webhook`
> - Nếu không điền `TELEGRAM_WEBHOOK_URL`, Telegram integration chỉ bị tắt (app vẫn chạy bình thường).

---

### Bước 3 — Liên kết staff với Telegram (sau khi server đã chạy):

1. Staff đăng nhập vào hệ thống
2. Gọi API: `PATCH /store-staff/:staffId/telegram-link` → nhận về `token`
3. Staff mở Telegram, nhắn bot: `/start <token>`
4. Hệ thống lưu `telegramChatId` vào bảng `staff`
5. Từ đây, khi có escalation, bot sẽ tự động nhắn vào Telegram của staff

---

## 3. VNPAY Sandbox (`VNPAY_TMN_CODE` + `VNPAY_HASH_SECRET` + `VNPAY_IPN_URL`)

**Dùng cho:** Thanh toán online sau khi dịch vụ hoàn thành.

### Bước 1 — Đăng ký tài khoản Sandbox:

1. Truy cập **https://sandbox.vnpayment.vn/devreg/**
2. Điền thông tin đăng ký (email, họ tên, số điện thoại)
3. Xác nhận email
4. Đăng nhập vào **https://sandbox.vnpayment.vn/merchantv2/**

### Bước 2 — Lấy `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET`:

1. Sau khi đăng nhập, vào menu **"Thông tin tài khoản"** hoặc **"Cấu hình"**
2. Tìm mục **"Website"** hoặc **"Merchant"**
3. Lấy **TMN Code** (Terminal Merchant Number) — VD: `GLOWORA1`
4. Lấy **Secret Key** (Hash Secret) — VD: `ABCDEFGHIJKLMNOPQRSTUVWXYZ123456`

### Điền vào `.env`:
```
VNPAY_TMN_CODE=GLOWORA1
VNPAY_HASH_SECRET=ABCDEFGHIJKLMNOPQRSTUVWXYZ123456
```

---

### Bước 3 — Lấy `VNPAY_IPN_URL` (dùng ngrok khi dev):

IPN (Instant Payment Notification) là webhook VNPAY gọi server-to-server để xác nhận thanh toán. Cần URL công khai, dùng ngrok tương tự Telegram:

```bash
ngrok http 8080
```

#### Điền vào `.env`:
```
VNPAY_IPN_URL=https://abc123.ngrok-free.app/payments/vnpay/ipn
```

#### Đăng ký IPN URL trên VNPAY Sandbox:
1. Vào **Merchant Portal** → **Cấu hình** → **URL IPN**
2. Nhập URL ngrok vừa lấy
3. Lưu lại

> **Lưu ý:**
> - `VNPAY_RETURN_URL` giữ nguyên `http://localhost:8080/payments/vnpay/return` khi dev
>   (đây là URL server nhận redirect từ VNPAY, rồi server redirect tiếp về frontend).
> - Nếu không có IPN URL hợp lệ, thanh toán vẫn được xử lý qua `return URL` khi khách redirect về
>   (fallback mechanism đã có trong code).

### Tài khoản test VNPAY Sandbox:

Dùng các thông tin sau để test thanh toán (không tốn tiền thật):

| Thông tin | Giá trị |
|-----------|---------|
| Ngân hàng | NCB |
| Số thẻ | `9704198526191432198` |
| Tên chủ thẻ | `NGUYEN VAN A` |
| Ngày phát hành | `07/15` |
| OTP | `123456` |

---

## Tóm tắt `.env` sau khi điền đầy đủ

```env
NODE_ENV=development
APP_NAME=glowora-backend
APP_PORT=8080

# DATABASE
DATABASE_URL=mysql://root:gloworadev@localhost:3306/glowora_business

# REDIS
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=gloworadev
REDIS_DB=0

# AUTH
JWT_ACCESS_SECRET=gloworajwt123aaaa
JWT_REFRESH_SECRET=glowora123jwtrf
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# VNPAY (Sandbox)
VNPAY_TMN_CODE=<lấy từ sandbox.vnpayment.vn>
VNPAY_HASH_SECRET=<lấy từ sandbox.vnpayment.vn>
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:8080/payments/vnpay/return
VNPAY_IPN_URL=https://<ngrok-url>.ngrok-free.app/payments/vnpay/ipn

# FRONTEND
FRONTEND_URL=http://localhost:3000

# AI (Google Gemini)
GEMINI_API_KEY=<lấy từ aistudio.google.com/app/apikey>

# TELEGRAM BOT
TELEGRAM_BOT_TOKEN=<lấy từ @BotFather>
TELEGRAM_WEBHOOK_URL=https://<ngrok-url>.ngrok-free.app/telegram/webhook
```

---

## Thứ tự ưu tiên khi setup

| Ưu tiên | Key | Cần thiết cho |
|---------|-----|--------------|
| 🔴 Bắt buộc | `DATABASE_URL`, `JWT_ACCESS_SECRET` | App khởi động được |
| 🟠 Quan trọng | `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` | Tính năng thanh toán |
| 🟡 Nên có | `GEMINI_API_KEY` | AI chatbot (không có thì auto-escalate) |
| 🟢 Tùy chọn | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL` | Staff relay qua Telegram |
