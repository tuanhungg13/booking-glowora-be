# Hướng dẫn tích hợp Telegram cho Shop

## Tổng quan

Hệ thống hỗ trợ nhận thông báo và trả lời khách hàng qua Telegram theo 2 chế độ:

| Chế độ | Mô tả | Khuyến nghị |
|---|---|---|
| **Group + Topics** | Mỗi cuộc hội thoại = 1 topic trong supergroup | ✅ Dùng cho team nhiều nhân viên |
| **DM cá nhân** | Alert gửi thẳng vào DM của 1 nhân viên | Fallback khi chưa setup group |

---

## Phần 1: Liên kết Telegram Group với Shop

### Bước 1 — Tạo Telegram Supergroup có bật Forum (Topics)

1. Mở Telegram → tạo group mới (hoặc dùng group đã có)
2. Vào **Settings → Edit → Group Type → Supergroup**
3. Bật **Topics** (mục "Topics" trong cài đặt group)
   > ⚠️ Bắt buộc phải là **Supergroup** và bật **Topics/Forum mode** thì bot mới tạo được topic riêng cho từng khách.

### Bước 2 — Thêm Bot vào Group với quyền Admin

1. Trong group, nhấn vào tên group → **Add Members**
2. Tìm bot theo username (ví dụ: `@GloworaBot`) → thêm vào
3. Vào **Administrators → Add Admin** → chọn bot → cấp quyền:
   - ✅ **Manage Topics** (bắt buộc — để tạo topic cho từng khách)
   - ✅ **Send Messages**
   - ✅ **Post Messages**

### Bước 3 — Lấy Group ID

Group ID là một số âm dạng `-100xxxxxxxxxx`. Có 2 cách lấy:

**Cách A — Qua bot @RawDataBot (dễ nhất):**
1. Thêm `@RawDataBot` vào group tạm thời
2. Bot sẽ tự gửi thông tin group, trong đó có `"id": -100123456789`
3. Lấy số đó rồi remove `@RawDataBot`

**Cách B — Qua Telegram Web:**
1. Mở [web.telegram.org](https://web.telegram.org) → vào group
2. Nhìn URL: `https://web.telegram.org/k/#-100123456789`
3. Group ID = `-100123456789` (phần sau dấu `#`, giữ nguyên dấu `-`)

**Cách C — Qua Webhook log (nếu đã deploy):**
1. Gửi 1 tin nhắn bất kỳ vào group
2. Telegram sẽ gọi `POST /telegram/webhook` với body chứa `message.chat.id`
3. Log ra hoặc debug để lấy giá trị đó

### Bước 4 — Gắn Group ID vào Shop

```http
PATCH /stores/:storeId/telegram-group
Authorization: Bearer <owner_token>
Content-Type: application/json

{
  "telegramGroupId": "-100123456789"
}
```

Response:
```json
{
  "id": "uuid-store",
  "name": "Glowora Spa",
  "telegramGroupId": "-100123456789"
}
```

Để gỡ liên kết:
```http
DELETE /stores/:storeId/telegram-group
```

---

## Phần 2: Thêm Nhân viên và Link Telegram Cá nhân

> ⚠️ **Quan trọng:** Dù nhân viên đã có mặt trong group, họ vẫn phải **link tài khoản Telegram cá nhân** với hệ thống. Lý do: khi nhân viên reply trong group, server nhận được `from.id` (ID Telegram cá nhân của người reply) và cần đối chiếu với DB để biết đây là nhân viên nào → gán đúng tên/avatar vào tin nhắn, lưu vào lịch sử cuộc hội thoại.
>
> Nếu nhân viên reply mà **chưa link** → tin nhắn đó bị **bỏ qua hoàn toàn**, khách không nhận được.

### Bước 1 — Invite nhân viên vào Shop

```http
POST /stores/:storeId/staff/invite
Authorization: Bearer <owner_token>
Content-Type: application/json

{
  "email": "nhanvien@example.com",
  "roleId": "uuid-role"
}
```

Sau khi invite thành công, hệ thống sinh ra `telegramLinkToken` — gửi cho nhân viên qua email hoặc hiển thị trên UI quản lý.

### Bước 2 — Nhân viên tự link Telegram

1. Nhân viên nhận được link token (dạng chuỗi hex 32 ký tự)
2. Mở Telegram → tìm bot (ví dụ: `@GloworaBot`)
3. Gõ lệnh:
   ```
   /start <token>
   ```
   Ví dụ: `/start a1b2c3d4e5f6...`
4. Bot phản hồi:
   ```
   ✅ Tài khoản Telegram đã được liên kết thành công!
   Bạn sẽ nhận được thông báo khi khách hàng cần tư vấn.
   ```

### Bước 3 — Thêm nhân viên vào Telegram Group

Thêm thủ công trong Telegram: vào group → **Add Members** → tìm theo username/số điện thoại của nhân viên.

Sau bước này nhân viên sẽ:
- Thấy toàn bộ topic đang mở trong group
- Reply được vào topic → server nhận và gửi về cho khách real-time

---

## Phần 3: Luồng hoạt động sau khi setup

### Khi khách nhắn lần đầu (Bot mode)

```
Khách nhắn → AI trả lời tự động
           → Nếu AI đủ tự tin: tiếp tục trả lời
           → Nếu AI quyết định cần người: tự động escalate
```

### Khi AI escalate (chuyển sang nhân viên)

```
1. Hệ thống tạo topic mới trong group:
   Tên topic: "Nguyễn Văn A — 28/05/2026"

2. Bot gửi vào topic:
   🔔 Khách hàng cần tư vấn trực tiếp
   👤 Khách: Nguyễn Văn A
   📋 Lịch sử:
     👤 Xin hỏi giá cắt tóc?
     🤖 Dạ giá từ 80k-150k ạ...
   💬 Reply trong topic này để trả lời khách.

3. Toàn bộ nhân viên trong group thấy topic mới → nhân viên nào rảnh vào reply
```

### Khi khách tiếp tục nhắn (Human mode)

```
Khách nhắn → Bot forward vào topic Telegram của khách đó
           → Nhân viên thấy tin mới trong topic → reply
           → Server nhận webhook → lưu DB → gửi WebSocket về app khách
```

### Khi nhân viên reply trong Telegram

```
Nhân viên gõ vào topic → Telegram gửi webhook đến server
→ Server đọc: message.message_thread_id (topicId) + message.from.id (chatId nhân viên)
→ Redis lookup: topic:{groupId}:{topicId} → conversationId
→ Tìm nhân viên theo telegramChatId = from.id
→ Tạo tin nhắn (senderType: STAFF)
→ Gửi WebSocket "message_received" → khách nhận real-time ✓
```

---

## Phần 4: Checklist Setup đầy đủ

### Checklist cho Owner/Admin

- [ ] Tạo Telegram Supergroup, bật Topics/Forum mode
- [ ] Add bot vào group với quyền **Manage Topics** + **Send Messages**
- [ ] Lấy Group ID (số âm dạng `-100...`)
- [ ] Gọi `PATCH /stores/:id/telegram-group` để gắn Group ID

### Checklist cho từng Nhân viên

- [ ] Được invite vào store (nhận `telegramLinkToken`)
- [ ] Chat với bot, gõ `/start <token>` để link Telegram cá nhân
- [ ] Được add vào Telegram Group của store

---

## Phần 5: Câu hỏi thường gặp

**Q: Nếu chưa setup group thì sao?**
> A: Hệ thống fallback sang chế độ DM — gửi alert vào DM cá nhân của nhân viên đầu tiên có `telegramChatId`. Chỉ 1 nhân viên nhận được, không cộng tác được.

**Q: Nhân viên reply trong group nhưng khách không nhận được?**
> A: Nhân viên đó chưa link Telegram cá nhân (`/start <token>`). Server nhận được reply nhưng không tìm thấy nhân viên trong DB → bỏ qua.

**Q: Nhiều nhân viên cùng reply vào 1 topic được không?**
> A: Được. Miễn là mỗi người đã link Telegram cá nhân. Tất cả reply đều được lưu và gửi về cho khách.

**Q: Sau 2 tiếng không có tin nhắn thì sao?**
> A: Redis key hết hạn (TTL 2h). Topic Telegram vẫn còn nhưng reply mới sẽ không được route về đúng conversation. Cần khách nhắn lại để tạo session mới.

**Q: Muốn chuyển về bot tự động trả lời?**
> A: Gọi `PATCH /conversations/:id/bot-mode` — conversation trở về BOT mode, nhân viên không còn được assign nữa.
