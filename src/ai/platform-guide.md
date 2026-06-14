# Tài liệu hướng dẫn nền tảng Glowora
> Dùng nội bộ để AI trả lời câu hỏi hướng dẫn sử dụng cho cả khách hàng lẫn chủ spa/nhân viên.

---

## 1. Tổng quan nền tảng

**Glowora** là nền tảng đặt lịch dịch vụ làm đẹp trực tuyến. Có 3 nhóm người dùng:

| Vai trò | Mô tả |
|---------|-------|
| **Khách hàng** | Tìm spa, đặt lịch, thanh toán, xem lịch sử |
| **Chủ spa / Nhân viên** | Quản lý shop qua Dashboard tại `/dashboard` |
| **Admin** | Quản trị toàn hệ thống tại `/admin` |

---

## 2. Luồng dành cho Khách hàng (Public)

### 2.1 Đăng ký / Đăng nhập
- Đăng ký tại `/auth/register` — nhập họ tên, email, mật khẩu
- Đăng nhập tại `/auth/login`
- Quên mật khẩu tại `/auth/forgot-password`
- Đăng ký làm chủ spa tại `/owner/register`

### 2.2 Tìm kiếm spa và dịch vụ
- Xem danh sách spa tại `/spas` — có bộ lọc theo vị trí, danh mục
- Xem chi tiết spa: click vào spa → trang `/spas/[slug]`
  - Xem ảnh, mô tả, đánh giá, danh sách dịch vụ
  - Chat trực tiếp với nhân viên spa
- Xem danh sách dịch vụ tại `/services` — lọc theo danh mục, khoảng giá, đánh giá
- Xem chi tiết dịch vụ: click vào dịch vụ → trang `/services/[slug]`
  - Xem các gói (variants): tên, thời gian, giá
  - Bấm **Đặt lịch** để tiến hành booking

### 2.3 Đặt lịch (Booking)
Thực hiện từ trang chi tiết dịch vụ `/services/[slug]`:
1. Chọn gói dịch vụ (variant)
2. Chọn chuyên viên (tuỳ chọn — nếu không chọn hệ thống tự phân công)
3. Chọn ngày và khung giờ còn trống
4. Áp mã giảm giá (nếu có) — nhập vào ô coupon rồi bấm **Áp dụng**
5. Xác nhận và đặt lịch
6. Hệ thống gửi thông báo về trạng thái booking

### 2.4 Các trạng thái lịch hẹn
| Trạng thái | Ý nghĩa |
|-----------|---------|
| **Chờ xác nhận (PENDING)** | Chờ spa xác nhận |
| **Đã xác nhận (CONFIRMED)** | Spa đã xác nhận, chờ đến ngày |
| **Chờ đặt cọc (DEPOSIT_PENDING)** | Spa yêu cầu đặt cọc, chờ khách thanh toán |
| **Đã đặt cọc (DEPOSIT_PAID)** | Khách đã đặt cọc xong |
| **Đã thanh toán (PAID)** | Đã thanh toán toàn bộ |
| **Hoàn thành (COMPLETED)** | Dịch vụ đã được thực hiện xong |
| **Đã huỷ (CANCELLED)** | Khách huỷ |
| **Bị từ chối (REJECTED)** | Spa từ chối lịch hẹn (có lý do) |

### 2.5 Quản lý lịch hẹn của khách hàng
- Vào `/appointments` để xem toàn bộ lịch hẹn
- Bộ lọc: theo trạng thái, khoảng ngày, tên spa/mã lịch hẹn
- Tại đây khách có thể:
  - Xem chi tiết lịch hẹn
  - **Huỷ lịch** (chỉ khi còn PENDING hoặc CONFIRMED — trong giới hạn giờ cho phép của spa)
  - **Thanh toán đặt cọc** qua SePay (quét QR chuyển khoản)
  - **Đánh giá** sau khi dịch vụ COMPLETED

### 2.6 Chat với spa
- Tại trang chi tiết spa hoặc `/chat` — nhắn tin trực tiếp với nhân viên

### 2.7 Thông báo
- Xem thông báo tại `/notifications`
- Thông báo qua Telegram nếu spa đã cấu hình

### 2.8 Hồ sơ cá nhân
- Chỉnh sửa thông tin tại `/profile`

---

## 3. Luồng dành cho Chủ Spa / Nhân viên (Dashboard)

> Truy cập dashboard tại `/dashboard` — yêu cầu đăng nhập với tài khoản chủ spa hoặc nhân viên.

### 3.1 Trang tổng quan (`/dashboard`)
- Xem số liệu: tổng booking, doanh thu, khách hàng mới
- Danh sách lịch hẹn gần đây
- Thống kê nhanh theo thời gian

---

### 3.2 Quản lý Lịch hẹn (`/dashboard/bookings`)

**Xem danh sách:** Bảng gồm mã booking, tên khách, dịch vụ, chuyên viên, ngày giờ, giá, trạng thái.

**Bộ lọc:**
- Tìm theo tên khách, SĐT, mã booking
- Lọc theo trạng thái
- Lọc theo chuyên viên
- Lọc theo khoảng ngày (DateRangePicker)

**Thao tác (nhấn icon ⋯ ở cột cuối):**
- **Xem chi tiết** — xem đầy đủ thông tin booking trong drawer bên phải
- **Xác nhận** — chuyển từ PENDING → CONFIRMED (chỉ khi đang PENDING)
- **Hoàn thành** — chuyển sang COMPLETED (khi đang CONFIRMED, DEPOSIT_PAID, hoặc PAID)
- **Từ chối** — chuyển sang REJECTED, bắt buộc nhập lý do (chỉ khi đang PENDING)
- **Ghi nhận thanh toán** — nhập số tiền, phương thức (tiền mặt/chuyển khoản) khi trạng thái CONFIRMED, DEPOSIT_PENDING, hoặc DEPOSIT_PAID

---

### 3.3 Quản lý Dịch vụ (`/dashboard/services`)

**Xem danh sách:** Bảng dịch vụ với ảnh, tên, danh mục, số gói, trạng thái.

**Bộ lọc:** Tìm theo tên, lọc theo danh mục, lọc theo trạng thái (ACTIVE/INACTIVE).

**Tạo dịch vụ mới:**
1. Bấm **"Thêm dịch vụ"**
2. Điền: Tên dịch vụ (*), Danh mục, Mô tả
3. Upload ảnh (có thể chọn nhiều ảnh)
4. Thêm **Gói dịch vụ (Variants)** — mỗi gói gồm: Tên gói, Thời gian (phút), Giá (VNĐ)
   - Có thể thêm nhiều gói (ví dụ: Gói cơ bản 60 phút, Gói nâng cao 90 phút)
5. Bấm **Lưu**

**Chỉnh sửa dịch vụ:** Bấm icon bút (✏️) → sửa thông tin, thêm/xoá ảnh, thêm/sửa/xoá variants.

**Xoá dịch vụ:** Bấm icon thùng rác — xác nhận rồi xoá.

**Import dịch vụ hàng loạt:** Bấm **"Import"** → upload file để nhập nhiều dịch vụ cùng lúc.

---

### 3.4 Quản lý Danh mục (`/dashboard/categories`)

Danh mục dịch vụ của shop (không phải danh mục hệ thống).

**Tạo danh mục:**
1. Bấm **"Thêm danh mục"**
2. Điền: Tên danh mục (2-100 ký tự), Danh mục hệ thống (chọn danh mục cha — bắt buộc), Mô tả (tuỳ chọn, tối đa 500 ký tự)
3. Bấm **Lưu**

**Chỉnh sửa:** Bấm icon ✏️ — có thể sửa tên và mô tả (không đổi được danh mục cha).

**Xoá:** Chỉ xoá được nếu chưa có dịch vụ nào thuộc danh mục đó. Nếu đã có dịch vụ sử dụng, nút Xoá sẽ bị khoá (disabled).

---

### 3.5 Quản lý Nhân viên (`/dashboard/staff`)

**Xem danh sách:** Grid hiển thị ảnh avatar, tên, chuyên môn, trạng thái.

**Tab "Lịch tổng quan":** Xem lịch làm việc của tất cả nhân viên theo dạng calendar.

**Mời nhân viên:**
1. Bấm **"Mời nhân viên"**
2. Nhập **địa chỉ email** của người muốn mời
3. Bấm **Gửi lời mời**
4. Hệ thống gửi email mời — người nhận vào link trong email để chấp nhận (trang `/staff-invites/accept`)
5. Sau khi chấp nhận, nhân viên xuất hiện trong danh sách

**Chỉnh sửa thông tin nhân viên:**
1. Bấm icon ✏️ trên thẻ nhân viên
2. Sửa: Chuyên môn (specialty), Giới thiệu (bio)
3. Bấm **Lưu**

**Bật/tắt nhân viên:** Toggle trên thẻ nhân viên — ACTIVE/INACTIVE. Nhân viên INACTIVE không được phân công lịch hẹn mới.

**Xoá nhân viên:** Bấm icon thùng rác → xác nhận → nhân viên bị xoá khỏi shop.

**Lịch làm việc từng nhân viên:** Vào `/dashboard/staff/[staffId]/schedule` để xem và thiết lập ca làm việc cho từng người.

---

### 3.6 Mã giảm giá (`/dashboard/coupons`)

**Xem danh sách:** Bảng mã coupon với mã, loại, giá trị, trạng thái, thời hạn, số lần dùng.

**Bộ lọc:** Tìm theo mã, lọc theo loại (% hoặc VNĐ cố định), trạng thái (đang hoạt động/đã tắt), khoảng ngày.

**Tạo mã giảm giá:**
1. Bấm **"Tạo mã giảm giá"**
2. Điền **Mã coupon**: chỉ chữ HOA và số, 4-20 ký tự (ví dụ: `SUMMER20`, `GIAM50K`)
3. Chọn **Loại giảm giá**:
   - **% Phần trăm** — giảm theo phần trăm (ví dụ: 20%)
   - **VNĐ Cố định** — giảm số tiền cố định (ví dụ: 50.000đ)
4. Nhập **Giá trị** (% không được vượt quá 100)
5. **Điều kiện** (tuỳ chọn):
   - Đơn tối thiểu (VNĐ) — chỉ áp dụng khi đơn hàng đạt mức này
   - Giảm tối đa (VNĐ) — chỉ cho loại phần trăm — giới hạn số tiền giảm tối đa
6. **Giới hạn** (tuỳ chọn):
   - Tổng lượt dùng — giới hạn bao nhiêu lần được dùng toàn bộ
   - Mỗi khách — mỗi khách được dùng tối đa bao nhiêu lần
7. **Thời gian**: Ngày bắt đầu (bắt buộc), Ngày kết thúc (bắt buộc — phải sau ngày bắt đầu)
8. Bấm **Tạo mã**

**Chỉnh sửa mã:** Chỉ có thể:
- Bật/tắt trạng thái (switch)
- Gia hạn ngày kết thúc

Không thể đổi mã, loại, giá trị sau khi tạo.

**Xoá mã:**
- Nếu mã **chưa được dùng** → xoá vĩnh viễn
- Nếu mã **đã có lịch sử sử dụng** → tắt mã thay vì xoá

---

### 3.7 Khuyến mãi dịch vụ (`/dashboard/promotions`)

Khuyến mãi tự động áp dụng khi khách đặt dịch vụ — không cần nhập mã.

**Khác với Coupon:** Coupon = khách nhập mã tay; Khuyến mãi = tự động áp dụng cho dịch vụ được chọn.

**Tạo chương trình khuyến mãi:**
1. Bấm **"Tạo khuyến mãi"**
2. Nhập **Tên chương trình** (ví dụ: "Sinh nhật spa - Giảm 20%")
3. Mô tả (tuỳ chọn)
4. Chọn **Loại giảm giá**: % Phần trăm hoặc VNĐ Cố định
5. Nhập **Giá trị**
6. Chọn **Phạm vi áp dụng**:
   - **Toàn shop** — áp dụng cho tất cả dịch vụ của shop
   - **Theo danh mục** — chọn 1+ danh mục cụ thể
   - **Theo dịch vụ** — chọn 1+ dịch vụ cụ thể
7. **Thời gian**: Ngày bắt đầu (bắt buộc), Ngày kết thúc (tuỳ chọn — nếu không đặt thì không giới hạn)
8. Bấm **Tạo khuyến mãi**

**Chỉnh sửa:** Có thể sửa tên, mô tả, bật/tắt, và gia hạn ngày kết thúc. Không đổi được loại/giá trị/phạm vi.

**Bật/tắt nhanh:** Toggle trực tiếp trong bảng danh sách mà không cần mở form.

**Xoá:** Xoá vĩnh viễn — không còn áp dụng cho booking mới.

---

### 3.8 Giờ làm việc (`/dashboard/working-hours`)

Thiết lập giờ mở/đóng cửa cho từng ngày trong tuần.

**Cách thao tác:**
- Mỗi ngày (Thứ 2 → Chủ nhật) có:
  - Toggle **Mở cửa / Đóng cửa**
  - Chọn **Giờ mở** và **Giờ đóng** (nếu không đóng cửa)
  - Bấm **Lưu** cho từng ngày riêng biệt
- Ngày nào thay đổi mà chưa lưu sẽ hiển thị nút Lưu màu đậm (active)

---

### 3.9 Cài đặt Shop (`/dashboard/settings`)

**Thông tin cơ bản:**
- Tên spa, Số điện thoại, Địa chỉ
- Tỉnh/Thành phố, Quận/Phường (chọn từ danh sách)
- Mô tả (rich text editor)
- Logo và Banner (upload ảnh)
- Vị trí bản đồ — kéo ghim trên map để cập nhật toạ độ chính xác

**Quy tắc đặt lịch:**
- **Khoảng cách slot** (phút) — mỗi khung giờ cách nhau bao nhiêu phút (mặc định 30 phút)
- **Huỷ trước** (giờ) — khách được huỷ trước bao nhiêu giờ
- **% Đặt cọc** — yêu cầu khách đặt cọc bao nhiêu % giá trị
- **Tự động xác nhận** — bật để tự động CONFIRM booking mà không cần duyệt tay

**Cấu hình thanh toán (SePay):**
1. Chọn **Ngân hàng** từ danh sách
2. Nhập **Số tài khoản**
3. Nhập **Tên chủ tài khoản**
4. Bấm **Lưu cấu hình**
5. Khi có cấu hình, khách đặt cọc sẽ thấy QR chuyển khoản tự động

Hỗ trợ các ngân hàng: MB Bank, Vietcombank, Vietinbank, BIDV, Agribank, VPBank, Techcombank, ACB, Sacombank, TPBank, VIB, HDBank, SHB, LPBank, MSB, OCB, Eximbank, SeABank, và nhiều ngân hàng khác.

**Tích hợp Telegram:**
- Bấm **"Tạo link kết nối Telegram"** → hệ thống sinh link
- Copy link và truy cập → kết nối group Telegram với spa
- Sau khi kết nối, thông báo booking, đánh giá... sẽ gửi vào Telegram
- Bấm **"Huỷ kết nối"** để ngắt kết nối Telegram

---

### 3.10 Thống kê chi tiết (`/dashboard/analytics`)
- Biểu đồ doanh thu, số booking theo thời gian
- Lọc theo khoảng ngày tùy chọn

---

### 3.11 Quản lý Đánh giá (`/dashboard/reviews`)
- Xem tất cả đánh giá từ khách hàng
- Xem điểm trung bình, số sao, nội dung

---

### 3.12 Chat với khách hàng (`/dashboard/chat`)
- Nhận và trả lời tin nhắn từ khách
- Thông báo real-time qua socket

---

### 3.13 Lịch làm việc của Staff (`/dashboard/my-schedule`)
- Dành cho nhân viên xem lịch hẹn được phân công của bản thân

---

### 3.14 Nhật ký hoạt động (`/dashboard/logs`)
- Xem lịch sử các thao tác trên hệ thống

---

## 4. Câu hỏi thường gặp (FAQ)

### Hỏi: Khách không nhập được mã giảm giá?
→ Kiểm tra: mã có đúng chữ HOA không, còn hiệu lực không (chưa hết hạn), đơn có đủ giá trị tối thiểu không, và mã còn lượt sử dụng không.

### Hỏi: Không tạo được dịch vụ?
→ Cần có ít nhất 1 danh mục. Tạo danh mục tại `/dashboard/categories` trước rồi mới tạo dịch vụ. Dịch vụ cần ít nhất 1 gói (variant) hợp lệ.

### Hỏi: Mời nhân viên nhưng họ không nhận được email?
→ Nhân viên cần có tài khoản Glowora với email đó. Nếu chưa có → họ cần đăng ký tại `/auth/register` trước, rồi mới có thể nhận lời mời.

### Hỏi: Khách đặt cọc nhưng spa chưa nhận được tiền?
→ Sau khi khách chuyển khoản thành công, trạng thái tự chuyển sang DEPOSIT_PAID qua webhook SePay. Nếu chưa chuyển → kiểm tra cấu hình SePay tại `/dashboard/settings`.

### Hỏi: Muốn xoá coupon đã dùng?
→ Không thể xoá vĩnh viễn coupon đã có lịch sử sử dụng. Thay vào đó, tắt coupon (isActive = false) để không ai dùng được nữa.

### Hỏi: Sự khác nhau giữa Khuyến mãi và Mã giảm giá?
→ **Mã giảm giá (Coupon):** Khách phải nhập mã tay khi đặt lịch. **Khuyến mãi (Promotion):** Tự động giảm giá cho dịch vụ được chỉ định, khách không cần làm gì thêm.

### Hỏi: Làm sao để khách thấy được thông báo Telegram?
→ Chủ spa cần: vào `/dashboard/settings` → mục Telegram → tạo link kết nối → mở link đó và cho phép bot Telegram vào group. Sau đó thông báo sẽ tự động gửi vào Telegram.

### Hỏi: Nhân viên có thể xem được tất cả chức năng không?
→ Không. Mỗi nhân viên được phân quyền riêng. Một số thao tác (như cài đặt thanh toán, xoá dịch vụ) chỉ chủ spa (OWNER) mới làm được.

### Hỏi: Khách muốn huỷ lịch hẹn?
→ Vào `/appointments` → tìm lịch hẹn → bấm Huỷ. Chỉ huỷ được khi trạng thái là PENDING hoặc CONFIRMED và còn trong thời gian cho phép huỷ (do spa cấu hình tại Settings).

### Hỏi: Làm sao để lịch hẹn tự động xác nhận?
→ Vào `/dashboard/settings` → mục Quy tắc đặt lịch → bật **Tự động xác nhận**. Sau đó mọi booking PENDING sẽ tự chuyển sang CONFIRMED ngay lập tức.
