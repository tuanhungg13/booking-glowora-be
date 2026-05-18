# CLAUDE.md

Hướng dẫn hành vi giúp giảm các lỗi phổ biến khi AI hỗ trợ lập trình.
Có thể kết hợp với các quy tắc riêng của từng dự án nếu cần.

**Lưu ý:** Các nguyên tắc này ưu tiên sự cẩn thận hơn tốc độ.
Với các tác vụ đơn giản, hãy linh hoạt sử dụng hợp lý.

---

## 1. Suy nghĩ trước khi code

**Không tự suy diễn. Không che giấu sự mơ hồ. Luôn nêu rõ các đánh đổi (tradeoff).**

Trước khi triển khai:

- Hãy nói rõ các giả định của bạn.
- Nếu chưa chắc chắn, hãy hỏi lại.
- Nếu có nhiều cách hiểu khác nhau, hãy liệt kê chúng — đừng tự âm thầm chọn một cách.
- Nếu có cách đơn giản hơn, hãy nói ra.
- Nếu yêu cầu chưa rõ ràng, hãy dừng lại và hỏi thêm.

---

## 2. Ưu tiên sự đơn giản

**Viết ít code nhất có thể để giải quyết vấn đề. Không thêm thứ không cần thiết.**

- Không thêm tính năng ngoài yêu cầu.
- Không tạo abstraction cho code chỉ dùng một lần.
- Không thêm khả năng "mở rộng", "config", "linh hoạt" nếu chưa được yêu cầu.
- Không xử lý lỗi cho những trường hợp không thể xảy ra.
- Nếu viết 200 dòng mà có thể làm trong 50 dòng → viết lại.

Luôn tự hỏi:

> "Một senior developer có thấy đoạn này bị over-engineer không?"

Nếu có → hãy đơn giản hóa.

---

## 3. Chỉnh sửa có mục tiêu

**Chỉ sửa đúng phần cần sửa. Chỉ dọn dẹp những gì do bạn gây ra.**

Khi sửa code có sẵn:

- Không tự ý "cải thiện" code xung quanh.
- Không refactor những thứ đang hoạt động bình thường.
- Hãy giữ nguyên style hiện có của project, kể cả khi bạn thích cách khác hơn.
- Nếu phát hiện dead code không liên quan → chỉ mention, không tự xóa.

Nếu thay đổi của bạn tạo ra code thừa:

- Hãy xóa import / biến / function mà CHÍNH thay đổi của bạn làm dư thừa.
- Không xóa dead code cũ nếu chưa được yêu cầu.

Nguyên tắc:

> Mỗi dòng thay đổi phải liên quan trực tiếp đến yêu cầu của người dùng.

---

## 4. Làm việc theo mục tiêu có thể kiểm chứng

**Xác định tiêu chí hoàn thành. Kiểm tra cho đến khi xác nhận đúng.**

Hãy biến yêu cầu thành mục tiêu có thể verify:

Ví dụ:

- "Thêm validation"
  → "Viết test cho input không hợp lệ rồi làm cho test pass"

- "Fix bug"
  → "Tạo test tái hiện bug rồi sửa để test pass"

- "Refactor X"
  → "Đảm bảo test pass trước và sau khi refactor"

Với các task nhiều bước, hãy nêu kế hoạch ngắn gọn:

```txt
1. [Bước thực hiện] → verify: [cách kiểm tra]
2. [Bước thực hiện] → verify: [cách kiểm tra]
3. [Bước thực hiện] → verify: [cách kiểm tra]
```

---

## Backend Rules

### 1. Kiến trúc tổng quát

Tách rõ trách nhiệm giữa các tầng:

- **Route / Controller**: nhận request, validate input, gọi service.
- **Service**: xử lý business logic.
- **Repository / Model**: thao tác database.
- **DTO / Schema**: định nghĩa input/output.
- **Middleware / Guard**: auth, permission, logging, error handling.

Không được:

- Viết business logic trực tiếp trong controller.
- Gọi database trực tiếp từ controller nếu project đã có service/repository.
- Trộn logic validate, query DB, format response vào cùng một chỗ.
- Tạo abstraction mới nếu chỉ dùng một lần.

---

### 2. Quy tắc response API

Response thành công nên thống nhất một format:

```json
{
  "success": true,
  "message": "Thành công",
  "data": {},
  "meta": {}
}
```

Response lỗi:

```json
{
  "success": false,
  "message": "Mô tả lỗi rõ ràng",
  "data" : null
}
```

Quy tắc:

- Luôn trả về HTTP status code đúng (200, 201, 400, 401, 403, 404, 422, 500...).
- Không để lộ stack trace hoặc thông tin nội bộ ra response production.
- Message lỗi phải đủ để client hiểu, nhưng không tiết lộ thông tin nhạy cảm.
- `meta` dùng cho pagination: `{ page, limit, total, totalPages }`.

---

### 3. Validation

- Validate tất cả input từ client — không tin tưởng bất kỳ dữ liệu nào từ ngoài vào.
- Validate ở tầng Controller/DTO trước khi đưa vào Service.
- Không validate lại cùng một thứ ở nhiều tầng — chọn một chỗ duy nhất.
- Trả về lỗi validation rõ ràng: field nào sai, sai như thế nào.

---

### 4. Xử lý lỗi (Error Handling)

- Dùng một `GlobalExceptionHandler` / error middleware tập trung — không try/catch rải rác khắp nơi.
- Phân biệt rõ: lỗi nghiệp vụ (business error) vs lỗi hệ thống (system error).
- Lỗi nghiệp vụ: ném exception có type rõ ràng (vd: `NotFoundException`, `ForbiddenException`).
- Lỗi hệ thống: log đầy đủ, trả về 500 generic cho client.
- Không nuốt lỗi im lặng (`catch(e) {}`).

---

### 5. Database / Query

- Không viết raw query trừ khi ORM không hỗ trợ hoặc cần tối ưu hiệu năng — và phải comment lý do.
- Luôn dùng parameterized query / ORM binding — không bao giờ nối string để tạo SQL.
- Không SELECT * — chỉ lấy các field thực sự cần.
- Đặt index cho các field thường xuyên dùng trong WHERE, JOIN, ORDER BY.
- Không thực hiện N+1 query — dùng eager loading hoặc batch query.
- Transaction cho các thao tác ghi nhiều bảng liên quan nhau.

---

### 6. Authentication & Authorization

- Không tự implement crypto hay auth từ đầu — dùng thư viện đã được kiểm chứng.
- Phân biệt rõ Authentication (ai đây?) và Authorization (được làm gì?).
- JWT: kiểm tra signature, expiry, và scope/role trước khi cho phép truy cập.
- Không lưu secret, token, password dạng plaintext — dù là log hay DB.
- Rate limit các endpoint nhạy cảm (login, register, forgot password).

---

### 7. Logging

- Log đủ để debug production mà không cần reproduce lại.
- Mỗi log entry nên có: timestamp, level, request_id, message, context liên quan.
- Không log thông tin nhạy cảm: password, token, thẻ tín dụng, PII.
- Dùng log level đúng: `DEBUG` (dev only), `INFO` (luồng chính), `WARN` (bất thường nhưng không crash), `ERROR` (cần xử lý).

---

### 8. Hiệu năng

- Không tối ưu sớm — đo trước, tối ưu sau khi có bằng chứng bottleneck.
- Cache kết quả tốn kém nếu data ít thay đổi — nhưng phải có chiến lược invalidate rõ ràng.
- Paginate mọi endpoint trả về danh sách — không bao giờ trả về toàn bộ collection.
- Async/non-blocking cho I/O (DB, HTTP, file) — không block event loop.

---

### 9. Bảo mật (Security Checklist)

- [ ] Validate và sanitize mọi input từ client.
- [ ] Parameterized query — không nối string SQL.
- [ ] Rate limiting trên các endpoint nhạy cảm.
- [ ] CORS chỉ cho phép origin cần thiết.
- [ ] Không expose thông tin hệ thống (version, stack trace) ra ngoài.
- [ ] Dependency up-to-date — không dùng package có CVE đã biết.
- [ ] Secrets chỉ lưu trong env / secret manager — không hardcode, không commit lên git.