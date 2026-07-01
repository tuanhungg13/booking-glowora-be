# Luồng chat widget với trợ lý AI (Glowora)

Tài liệu mô tả chi tiết cách chức năng "chat widget AI" hoạt động: kiến trúc, sự khác biệt giữa user đăng nhập/không đăng nhập, và luồng xử lý một tin nhắn từ đầu đến cuối kèm dữ liệu thật đã kiểm chứng.

## 1. Kiến trúc tổng quan

| Thành phần | File | Vai trò |
|---|---|---|
| Cổng kết nối realtime | `src/gateways/chat.gateway.ts` | Nhận/trả tin nhắn qua Socket.IO, event `ai_chat` |
| API dự phòng (REST) | `src/ai/ai.controller.ts` | `POST /ai/chat` — cùng logic, không qua socket |
| Logic AI + truy vấn DB | `src/ai/gemini.service.ts` | Gọi Gemini, xây prompt, query Prisma |
| Model dữ liệu | `prisma/schema.prisma` | `Store`, `Service`, `Province`, `ServiceCategory` |

Widget frontend dùng socket (`ai_chat`) làm kênh chính. `POST /ai/chat` là lối vào REST thứ hai cho cùng tính năng, không cần đăng nhập (`@Public()`), dùng chung toàn bộ hàm xử lý trong `GeminiService`.

## 2. Kết nối socket — login vs không login

`handleConnection` (`chat.gateway.ts:39-62`) chạy đúng 1 lần khi widget mở kết nối:

```ts
async handleConnection(client: Socket) {
  const token =
    (client.handshake.auth?.token as string) ||
    (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');

  if (!token) {
    // Không có token → khách ẩn danh, vẫn cho kết nối (chỉ dùng được ai_chat)
    this.logger.log(`Client connected (anonymous): ${client.id}`);
    return;
  }

  try {
    const payload = this.jwt.verify(token, { secret: this.config.get<string>('JWT_ACCESS_SECRET') });
    client.data.userId = payload.sub;
    await client.join(`user:${payload.sub}`);
  } catch {
    // Token sai/hết hạn → cũng cho kết nối như ẩn danh
  }
}
```

- **Có token hợp lệ**: verify JWT, gắn `client.data.userId`, join room `user:{id}` (dùng cho tính năng khác — nhận notify cá nhân, không liên quan AI chat).
- **Không có token / token sai**: server **vẫn cho kết nối bình thường**, chỉ đơn giản không gắn `userId`. Không reject connection.

**Điểm mấu chốt**: với riêng tính năng AI chat (`ai_chat`, `ai_reset`), code **không đọc `client.data.userId` ở đâu cả**. Login hay không login, hàm xử lý chạy y hệt nhau, không cá nhân hoá theo user.

Danh tính "phiên" của cả 2 trường hợp là **`client.id`** — socket id do Socket.IO tự sinh ngẫu nhiên mỗi lần kết nối:

```ts
private readonly aiSessions = new Map<string, ChatMessage[]>(); // Map<socketId, lịch sử chat>
```

→ Lịch sử chat AI **không lưu DB**, chỉ tồn tại trong RAM của server, khóa bằng `client.id`, và bị xóa ngay khi disconnect:

```ts
handleDisconnect(client: Socket) {
  this.aiSessions.delete(client.id);
}
```

Hệ quả: F5 trang hoặc mất kết nối → mất sạch lịch sử. Việc này áp dụng như nhau cho cả user đã login lẫn guest — tính năng AI chat này không có khái niệm "lưu lịch sử theo tài khoản".

## 3. Cơ chế gợi ý — 3 loại tag ẩn

Gemini không tự truy vấn DB. Nó chỉ được cấp một vài dòng thống kê tổng quan (xem mục 4, bước 3), sau đó **tự sinh ra từ khóa** thông qua 3 loại tag ẩn trong câu trả lời (không hiển thị cho user), rồi **backend** mới là bên chạy query Prisma thật dựa trên các từ khóa đó.

Định nghĩa trong system prompt (`gemini.service.ts`, hàm `buildPlatformPrompt`, rule 6-8):

| Tag | Mục đích | Ví dụ |
|---|---|---|
| `[SUGGEST_KW:kw1,kw2]` | Tra **giá/thời lượng** của dịch vụ cụ thể | `[SUGGEST_KW:massage vai cổ]` |
| `[SUGGEST_STORE:kw1,kw2]` | Tìm **danh sách spa** theo tên dịch vụ/spa (KHÔNG chứa địa điểm). Từ khóa đặc biệt `__top_rated__` = "đánh giá cao nhất" | `[SUGGEST_STORE:chăm sóc da]` |
| `[SUGGEST_LOCATION:kw]` | Địa điểm riêng, AND với `SUGGEST_STORE`. Từ khóa đặc biệt `__near_me__` = sort theo GPS | `[SUGGEST_LOCATION:Hà Nội]` |

3 tag này **tách biệt hoàn toàn** — mỗi tag đi vào một nhóm điều kiện DB riêng, AND với nhau khi query (xem mục 4, bước 5). Đây là thiết kế sau khi sửa một bug thực tế: trước đây `SUGGEST_STORE` gộp chung cả dịch vụ lẫn địa điểm vào 1 danh sách keyword, có nhánh "fallback" âm thầm bỏ điều kiện dịch vụ khi query rỗng → từng gây ra tình trạng hỏi "chăm sóc da ở Hà Nội" nhưng trả về store "cắt tóc". Nhánh fallback đó đã bị xóa hoàn toàn.

## 4. Pipeline xử lý 1 tin nhắn — ví dụ thật: "tôi muốn vài spa chăm sóc da ở Hà Nội"

### Bước 1 — Frontend gửi tin nhắn

```js
socket.emit('ai_chat', { message: "tôi muốn vài spa chăm sóc da ở Hà Nội", location: {...} });
```

### Bước 2 — Gateway nhận (`chat.gateway.ts:151-157`)

```ts
async handleAiChat(client, data) {
  const message = data.message?.trim();
  if (!message) return { error: 'Nội dung tin nhắn không được để trống' };
```

### Bước 3 — Lấy lịch sử phiên + build "platform context" từ DB thật

```ts
const history = this.aiSessions.get(client.id) ?? []; // [] nếu là tin đầu tiên
const context = await this.gemini.buildPlatformContext();
```

`buildPlatformContext()` chạy 2 query song song. **Dữ liệu thật đo được khi test**:

```
categories: "Lông mày & Mi mắt, Tóc (Nữ), Làm đẹp tổng hợp, Spa & Massage, Trang điểm,
  Chăm sóc da mặt, Dịch vụ khác, Xông hơi & Tắm trắng, Yoga & Thiền, Nail & Móng tay,
  Fitness & PT cá nhân, Chăm sóc cơ thể, Chăm sóc trẻ em, Phun xăm thẩm mỹ,
  Chăm sóc sức khỏe, Cắt tóc & Barber, Triệt lông, Thẩm mỹ viện"
storeCount: 60
cityOverview: "Tp Hồ Chí Minh: 15 cửa hàng, Thành phố Hà Nội: 15 cửa hàng, Tp Đà Nẵng: 8 cửa hàng,
  Tp Cần Thơ: 6 cửa hàng, Tỉnh Khánh Hòa: 4 cửa hàng, Thành phố Huế: 4 cửa hàng,
  Tỉnh Đồng Nai: 3 cửa hàng, Tp Hải Phòng: 2 cửa hàng"
```

Đây là **toàn bộ** "kiến thức" AI có về dữ liệu thật — chỉ là số liệu tổng hợp theo tỉnh, **không** phải danh sách chi tiết dịch vụ theo từng tỉnh.

### Bước 4 — Gọi Gemini lần 1 (`gemini.chatGlobal`)

System prompt ghép: persona Glowora + 3 dòng thống kê ở bước 3 + vị trí GPS (nếu có) + 8 quy tắc bắt buộc + nội dung `platform-guide.md`.

**Output thật của Gemini khi test với câu ví dụ**:

```
reply (raw, có tag): "Chào bạn, Glowora hiện có 15 cửa hàng đang hoạt động tại Hà Nội.
Bạn có thể tìm thấy nhiều spa cung cấp dịch vụ chăm sóc da chất lượng tại đây.

Để xem danh sách chi tiết, hình ảnh và đánh giá từ khách hàng, bạn vui lòng truy cập
trang danh sách cửa hàng của chúng tôi tại mục [Spa](/spas) và chọn bộ lọc địa điểm
là "Hà Nội"...[SUGGEST_STORE:chăm sóc da][SUGGEST_LOCATION:Hà Nội]"
```

Backend bóc tag bằng regex:

```ts
suggestedKeywords         = []                    // không có [SUGGEST_KW:...]
suggestedStoreKeywords    = ["chăm sóc da"]        // từ [SUGGEST_STORE:...]
suggestedLocationKeywords = ["Hà Nội"]             // từ [SUGGEST_LOCATION:...]
reply                     = "Chào bạn, Glowora hiện có 15 cửa hàng... (đã cắt tag)"
```

> **Lưu ý quan trọng**: câu "15 cửa hàng... cung cấp dịch vụ chăm sóc da chất lượng" ở lượt 1 là **suy diễn của AI**, không dựa trên query thật (vì lúc này AI chưa biết kết quả tra cứu). Con số 15 có thật (tổng store active ở Hà Nội), nhưng việc gán nó cho "chăm sóc da" là chưa được xác minh — đây chính là lý do cần Bước 6.

### Bước 5 — Backend query Prisma thật, song song

```ts
const [suggestions, storeSuggestions] = await Promise.all([
  this.gemini.fetchServicesByKeywords(suggestedKeywords),                          // [] vì suggestedKeywords rỗng
  this.gemini.fetchStoresByKeywords(suggestedStoreKeywords, suggestedLocationKeywords, data.location),
]);
```

`fetchStoresByKeywords` build 2 nhóm điều kiện **tách biệt**, AND với nhau:

```ts
// Nhóm dịch vụ (từ suggestedStoreKeywords = ["chăm sóc da"])
{ OR: [
  { name: { contains: "chăm sóc da" } },
  { description: { contains: "chăm sóc da" } },
  { services: { some: { name: { contains: "chăm sóc da" }, status: ACTIVE } } },
  { services: { some: { description: { contains: "chăm sóc da" }, status: ACTIVE } } },
] }

// Nhóm địa điểm (từ suggestedLocationKeywords = ["Hà Nội"])
{ OR: [
  { address: { contains: "Hà Nội" } },
  { province: { name: { contains: "Hà Nội" } } },
] }
```

**Dữ liệu thật kiểm chứng trực tiếp trên DB** (query chẩn đoán độc lập):

```
Tổng số store ACTIVE toàn nền tảng: 60
Province khớp "Hà Nội": [{ id: 1, name: 'Thành phố Hà Nội' }]
Số store ACTIVE có province chứa "Hà Nội": 15
Số store ACTIVE có address chứa "Hà Nội": 0   ← field address KHÔNG có tên thành phố
Số store ACTIVE khớp điều kiện dịch vụ "chăm sóc da": 7
```

7 store khớp "chăm sóc da" (qua field `description` của service, ví dụ dịch vụ "Facial cấp ẩm phục hồi..." có mô tả chứa cụm "chăm sóc da") — nhưng khi tra tỉnh của cả 7 store này:

```
06ef9196... Mộc An Wellness Spa 004    → Tp Hồ Chí Minh
3ccee6fb... La Vie Day Spa 007         → Tp Hồ Chí Minh
5768ac7d... Herbal Wellness Spa 008    → Tp Hồ Chí Minh
6ba80bfb... Serene Spa 005             → Tp Hồ Chí Minh
7a8ac3ec... Bloom Spa 009              → Tp Hồ Chí Minh
c1d56f84... Lumina Day Spa 003         → Tp Hồ Chí Minh
eb645b38... An Nhiên Luxury Spa 002    → Tp Hồ Chí Minh
```

**Cả 7 đều ở Tp Hồ Chí Minh, không có store nào ở Hà Nội.** → `storeSuggestions = []` (giao 2 tập hợp là rỗng thật, không phải bug).

### Bước 6 — Rỗng + có đủ 2 tag (dịch vụ + địa điểm) → gọi lại Gemini lần 2

```ts
const hasLocation = suggestedLocationKeywords.length > 0;   // true
const hasService  = suggestedStoreKeywords.length > 0;       // true

if (hasLocation && hasService && storeSuggestions.length === 0) {
  // Query lại KHÔNG giới hạn địa điểm — xem dịch vụ có ở tỉnh nào khác không
  const elsewhereStores = await this.gemini.fetchStoresByKeywords(suggestedStoreKeywords, []);
  const finalReply = await this.gemini.composeNoStoreFoundReply(
    message, suggestedStoreKeywords, "Hà Nội", elsewhereStores, context,
  );
  finalStoreSuggestions = elsewhereStores;
}
```

`elsewhereStores` = 3 store đầu tiên trong 7 store ở Tp Hồ Chí Minh (giới hạn `slice(0, 3)` trong `fetchStoresByKeywords`).

`composeNoStoreFoundReply` gửi cho Gemini **dữ kiện đã được xác minh thật** (không phải suy đoán):

```
Prompt gửi cho Gemini lần 2:
"Dữ liệu thực tế tra cứu được (đây là SỰ THẬT, phải bám sát, không được thêm số liệu
hay địa điểm nào khác): Không có cửa hàng nào ở Hà Nội khớp yêu cầu "chăm sóc da",
nhưng dịch vụ này đang có tại các tỉnh/thành: Tp Hồ Chí Minh.
Danh mục dịch vụ đang có trên nền tảng: Lông mày & Mi mắt, Tóc (Nữ), ..."
```

**Output thật của Gemini lần 2**:

```
"Chào bạn, rất tiếc hiện tại Glowora chưa có các spa chăm sóc da tại Hà Nội.
Dịch vụ này hiện đang được cung cấp tại Tp. Hồ Chí Minh. Trong thời gian chờ đợi
mở rộng, mời bạn tham khảo các danh mục dịch vụ khác trên nền tảng của chúng tôi
như: Spa & Massage, Chăm sóc cơ thể hoặc Thẩm mỹ viện nhé!"
```

→ Chính xác tuyệt đối so với dữ liệu thật, không còn mâu thuẫn giữa lời AI nói và danh sách gợi ý trả về.

### Bước 7 — Cập nhật lịch sử & emit kết quả

```ts
const updated = [...history, {role:'user', content: message}, {role:'model', content: finalReply}];
this.aiSessions.set(client.id, updated.slice(-20)); // giữ tối đa 10 lượt gần nhất

client.emit('ai_reply', { reply: finalReply, suggestions, storeSuggestions: finalStoreSuggestions });
```

`client.emit(...)` chỉ gửi xuống **đúng socket connection** đang giữ (không broadcast toàn bộ) — widget nhận event `ai_reply`, hiển thị text + card dịch vụ (nếu có) + card store gợi ý (3 store ở Tp.HCM trong ví dụ này).

### Bước 8 — Log debug (chạy thật, ghi ra console)

```
[ai_chat] message="tôi muốn vài spa chăm sóc da ở Hà Nội" | reply="Chào bạn, Glowora hiện có 15..."
[ai_chat] tags → suggestedKeywords=[] | suggestedStoreKeywords=["chăm sóc da"] | suggestedLocationKeywords=["Hà Nội"]
[ai_chat] suggestions (services)=[]
[ai_chat] storeSuggestions=[]
[ai_chat] no-result reply="Chào bạn, rất tiếc hiện tại..." | elsewhereStores=["Tp Hồ Chí Minh","Tp Hồ Chí Minh","Tp Hồ Chí Minh"]
```

## 5. Sơ đồ luồng rút gọn

```
User gõ tin nhắn
   → socket emit 'ai_chat'
   → gateway lấy history theo client.id (Map trong RAM, mất khi disconnect)
   → buildPlatformContext() — query DB: danh mục + số store/tỉnh (chỉ số liệu tổng quan)
   → Gemini lần 1: sinh reply + tag [SUGGEST_KW]/[SUGGEST_STORE]/[SUGGEST_LOCATION]
   → backend query Prisma THẬT theo tag (song song: services + stores,
     AND 2 nhóm điều kiện dịch vụ/địa điểm tách biệt — không có fallback nới lỏng ngầm)
   → NẾU có cả tag dịch vụ + địa điểm mà kết quả rỗng:
        → query lại KHÔNG giới hạn địa điểm (tìm "dịch vụ này có ở tỉnh nào khác")
        → Gemini lần 2: viết lại reply dựa trên dữ kiện thật, không bịa thêm
   → cập nhật history (tối đa 10 lượt), emit 'ai_reply' về đúng socket connection
```

## 6. Login vs không login — tóm tắt khác biệt

| | Đã đăng nhập | Không đăng nhập |
|---|---|---|
| Kết nối socket | Verify JWT, gắn `client.data.userId`, join room `user:{id}` | Không verify, không gắn `userId` |
| Xử lý `ai_chat` | **Y hệt** nhau — không đọc `userId` | **Y hệt** nhau |
| Danh tính phiên chat AI | `client.id` (socket id) | `client.id` (socket id) |
| Lưu lịch sử chat AI | RAM, mất khi disconnect | RAM, mất khi disconnect |
| Cá nhân hoá theo tài khoản | Không có | Không có |

Kết luận: tính năng AI chat widget hiện tại **không phân biệt** login/không login trong xử lý nghiệp vụ — sự khác biệt duy nhất nằm ở việc socket có được gắn `userId`/join thêm room `user:{id}` hay không, nhưng room đó chỉ phục vụ tính năng notify cá nhân khác, không liên quan đến AI chat.

## 7. Giới hạn còn tồn tại (đặc điểm thiết kế, không phải bug)

- Lịch sử chat AI không bền vững qua các lần connect lại (theo `client.id`), áp dụng như nhau cho cả login lẫn guest.
- So khớp dịch vụ/địa điểm là substring match (`LIKE '%...%'`), không phải tìm kiếm ngữ nghĩa — phụ thuộc vào việc dịch vụ trong DB có được đặt tên/mô tả chứa đúng cụm từ mà Gemini chọn hay không.
- Lượt gọi Gemini thứ 2 (`composeNoStoreFoundReply`) chỉ tốn thêm chi phí/độ trễ khi thực sự rơi vào trường hợp rỗng (có cả tag dịch vụ + địa điểm nhưng không khớp store nào) — trường hợp bình thường (có kết quả) vẫn chỉ 1 lượt gọi Gemini như cũ.
