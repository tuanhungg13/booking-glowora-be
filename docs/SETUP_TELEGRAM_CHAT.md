# Hướng dẫn cấu hình Telegram Chat cho Glowora

Tính năng chat cho phép khách hàng nhắn tin với shop qua giao diện web.
AI (Gemini) sẽ tự trả lời; khi không xử lý được, hệ thống tự escalate lên nhân viên qua Telegram.

Mỗi shop được liên kết với **1 Telegram Supergroup** (có Topics).
Mỗi cuộc hội thoại với khách = 1 Thread riêng trong group đó.

---

## Tổng quan luồng hoạt động

```
Khách nhắn tin (WebSocket)
        │
        ▼
  AI trả lời (BOT mode)
        │
   Không xử lý được?
   (hoặc [ESCALATE])
        │ Yes
        ▼
  Tạo topic mới trong Telegram Group của shop
  ──────────────────────────────────────────
  Group "Glowora Spa Hà Nội"
  ├── 📌 Nguyễn Văn A — 20/05   ← thread mới
  │     🤖 Lịch sử chat...
  │     💬 Reply tại đây để trả lời khách
  └── 📌 Trần Thị B — 20/05
        │
        ▼
  Nhân viên reply trong thread
        │
        ▼
  Tin hiện lên phía khách hàng (real-time)
```

---

## Phần 1 — Chuẩn bị bot và biến môi trường

### 1.1 Tạo bot Telegram

1. Mở Telegram, tìm **@BotFather**
2. Gửi `/newbot`
3. Đặt tên hiển thị: VD `Glowora Staff Bot`
4. Đặt username (phải kết thúc bằng `bot`): VD `glowora_staff_bot`
5. BotFather trả về token dạng: `7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 1.2 Điền vào `.env`

```env
TELEGRAM_BOT_TOKEN=7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_WEBHOOK_URL=https://<ngrok-url>.ngrok-free.app/telegram/webhook
```

> `TELEGRAM_WEBHOOK_URL` cần là URL công khai — xem Phần 2 để lấy ngrok URL.

---

## Phần 2 — Expose server ra ngoài (ngrok)

Telegram cần gọi webhook về server. Khi dev local, dùng **ngrok**:

```bash
# Chạy ngrok (giả sử server chạy port 8080)
ngrok http 8080
```

Ngrok hiện URL dạng:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:8080
```

Điền vào `.env`:
```env
TELEGRAM_WEBHOOK_URL=https://abc123.ngrok-free.app/telegram/webhook
```

Sau đó **restart server** để webhook được đăng ký lại với Telegram.

> **Lưu ý:** URL ngrok thay đổi mỗi lần restart. Mỗi lần ngrok restart → cập nhật `.env` → restart server.

---

## Phần 3 — Tạo Telegram Group cho shop

### 3.1 Tạo supergroup với Topics

1. Mở Telegram → tạo **Group mới** (không phải Channel)
2. Đặt tên: VD `Glowora Spa Hà Nội - Support`
3. Thêm bot vừa tạo vào group
4. Vào **Group Settings → Administrators** → cấp quyền admin cho bot, bật:
   - **Manage Topics** (bắt buộc — để bot tạo thread)
   - **Send Messages**
5. Vào **Group Settings → Topics** → **bật lên**

### 3.2 Lấy chat_id của group

**Cách 1 — qua webhook:**

Sau khi server chạy và ngrok đang hoạt động:
1. Nhắn bất kỳ tin gì vào group
2. Telegram gọi webhook → server log ra update
3. Tìm `message.chat.id` trong log (số âm, VD: `-1001234567890`)

**Cách 2 — qua API Telegram:**

```bash
# Thay <BOT_TOKEN> bằng token thật
curl https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
```

Tìm `"chat": { "id": -1001234567890 }` trong response.

> Chat_id của supergroup luôn là **số âm** và dài (thường bắt đầu bằng `-100`).

---

## Phần 4 — Liên kết group với shop (API)

Sau khi có `telegramGroupId`, gọi API với tài khoản **shop owner**:

```http
PATCH /stores/:storeId/telegram-group
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "telegramGroupId": "-1001234567890"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "store-uuid",
    "name": "Glowora Spa Hà Nội",
    "telegramGroupId": "-1001234567890"
  }
}
```

Để **hủy liên kết**:
```http
DELETE /stores/:storeId/telegram-group
Authorization: Bearer <access_token>
```

---

## Phần 5 — Nhân viên link tài khoản Telegram cá nhân (tùy chọn)

> Bước này **không bắt buộc** nếu đã dùng Group mode (Phần 3–4).
> Chỉ cần khi shop chưa setup group — khi đó hệ thống fallback DM cho nhân viên đầu tiên có `telegramChatId`.

1. Nhân viên đăng nhập hệ thống → gọi API:
   ```http
   PATCH /store-staff/:staffId/telegram-link
   Authorization: Bearer <access_token>
   ```
   Response trả về `{ "token": "abc123..." }`

2. Nhân viên mở Telegram → tìm bot của shop → nhắn:
   ```
   /start abc123...
   ```

3. Bot xác nhận: `✅ Tài khoản Telegram đã được liên kết thành công!`

---

## Phần 6 — Kiểm tra hoạt động

### Checklist

- [ ] `TELEGRAM_BOT_TOKEN` đã điền vào `.env`
- [ ] `TELEGRAM_WEBHOOK_URL` đã điền và trỏ đúng server
- [ ] Server đang chạy và ngrok đang active
- [ ] Group đã bật Topics
- [ ] Bot đã là admin trong group với quyền Manage Topics
- [ ] Đã gọi `PATCH /stores/:id/telegram-group` thành công

### Test nhanh

1. Tạo conversation: `POST /conversations` với `{ storeId, customerId }`
2. Kết nối WebSocket: `ws://localhost:8080` với header `Authorization: Bearer <token>`
3. Emit sự kiện:
   ```json
   { "event": "join_conversation", "data": { "conversationId": "..." } }
   { "event": "send_message",      "data": { "conversationId": "...", "content": "Xin chào" } }
   ```
4. AI trả lời tự động (nếu có `GEMINI_API_KEY`)
5. Nhắn thêm vài tin → AI không xử lý được → topic mới xuất hiện trong Telegram group
6. Nhân viên reply trong topic → tin hiện trên WebSocket của khách

---

## Phần 7 — Sơ đồ Redis keys

| Key | Giá trị | TTL | Dùng cho |
|-----|---------|-----|---------|
| `telegram:topic:{groupId}:{topicId}` | `conversationId` | 2 giờ | Route reply từ group topic về đúng conversation |
| `telegram:active:{chatId}` | `conversationId` | 2 giờ | Route reply từ DM cá nhân (fallback mode) |

---

## Phần 8 — Xử lý sự cố

| Triệu chứng | Nguyên nhân | Cách sửa |
|-------------|-------------|----------|
| Bot không tạo được topic | Bot thiếu quyền hoặc group chưa bật Topics | Cấp quyền Manage Topics, bật Topics trong group settings |
| Webhook không nhận được | ngrok đã restart, URL thay đổi | Cập nhật `TELEGRAM_WEBHOOK_URL` trong `.env`, restart server |
| Staff reply không về được khách | Redis key đã hết TTL 2h | Khách cần gửi lại tin → escalate lại |
| Server log `TELEGRAM_BOT_TOKEN not set` | Thiếu env variable | Điền token vào `.env`, restart server |
| Tin nhắn trong topic nhưng không route được | `message_thread_id` không match Redis key | Kiểm tra `telegramGroupId` đã lưu đúng với group thật chưa |
