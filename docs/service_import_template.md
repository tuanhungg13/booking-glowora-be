# Mô Tả File: `service_import_template.xlsx`

## Tổng Quan

File Excel dùng để **import danh sách dịch vụ** vào hệ thống quản lý (salon, spa, v.v.). File gồm **2 sheet**:

| Sheet | Mục đích |
|---|---|
| `Danh Sách Dịch Vụ` | Nơi nhập dữ liệu các dịch vụ cần import |
| `Hướng Dẫn` | Quy tắc, ràng buộc và lỗi thường gặp |

---

## Sheet 1: Danh Sách Dịch Vụ

### Cấu trúc cột

| Cột | Tên Cột | Bắt buộc | Ràng buộc |
|---|---|---|---|
| 1 | **Tên Dịch Vụ** | ✅ | Tối đa 150 ký tự |
| 2 | **Danh Mục** | ❌ | Phải là tên danh mục đã có trong hệ thống |
| 3 | **Mô Tả** | ❌ | Mô tả chi tiết dịch vụ |
| 4 | **Tên Gói** | ✅ | Tối đa 150 ký tự |
| 5 | **Thời Lượng (phút)** | ✅ | Số nguyên dương |
| 6 | **Giá Bán (VND)** | ✅ | Số thực >= 0 |
| 7 | **Giá Vốn (VND)** | ❌ | Số thực >= 0 |
| 8 | **Trạng Thái** | ❌ | `ACTIVE` hoặc `INACTIVE` (mặc định: `ACTIVE`) |

> **Lưu ý về cấu trúc:** Mỗi dòng đại diện cho **1 gói dịch vụ**. Nếu 1 dịch vụ có nhiều gói (ví dụ: Cắt Tóc Nam có "Cắt Thường" và "Cắt + Nhuộm"), mỗi gói sẽ là **1 dòng riêng** với tên dịch vụ lặp lại.

---

### Dữ liệu mẫu

File đã có sẵn **10 dòng dữ liệu mẫu** thuộc 2 danh mục:

#### Danh mục: Tóc & Nail

| Tên Dịch Vụ | Tên Gói | Thời Lượng | Giá Bán | Giá Vốn |
|---|---|---|---|---|
| Cắt Tóc Nam | Cắt Thường | 30 phút | 80.000 VND | 50.000 VND |
| Cắt Tóc Nam | Cắt + Nhuộm | 90 phút | 250.000 VND | 150.000 VND |
| Gội Đầu Dưỡng | Gội Thường | 30 phút | 60.000 VND | 35.000 VND |
| Gội Đầu Dưỡng | Gội Cao Cấp | 60 phút | 120.000 VND | 70.000 VND |
| Nhuộm Tóc | Nhuộm 1 Màu | 120 phút | 300.000 VND | 180.000 VND |
| Nhuộm Tóc | Nhuộm Highlight | 150 phút | 500.000 VND | 300.000 VND |
| Làm Móng Tay | Sơn Gel | 45 phút | 120.000 VND | 60.000 VND |
| Làm Móng Tay | Đắp Bột | 75 phút | 200.000 VND | 100.000 VND |

#### Danh mục: Spa

| Tên Dịch Vụ | Tên Gói | Thời Lượng | Giá Bán | Giá Vốn |
|---|---|---|---|---|
| Massage Thư Giãn | 60 Phút | 60 phút | 200.000 VND | 100.000 VND |
| Massage Thư Giãn | 90 Phút | 90 phút | 280.000 VND | 140.000 VND |

---

## Sheet 2: Hướng Dẫn

### Quy tắc cơ bản

- Mỗi dòng = 1 dịch vụ (1 gói cụ thể).
- Nếu tên dịch vụ trùng nhau → hệ thống **xem là 2 dịch vụ khác nhau** (không tự gộp).
- Trạng thái mặc định là `ACTIVE` nếu ô bị để trống.
- Tên gói mặc định là `Gói cơ bản` nếu ô bị để trống.

### Các cột bắt buộc

| Cột | Ghi chú |
|---|---|
| Tên Dịch Vụ | Tối đa 150 ký tự |
| Tên Gói | Tối đa 150 ký tự |
| Thời Lượng | Số nguyên dương, đơn vị phút |
| Giá Bán | Số thực >= 0, đơn vị VND |

### Lỗi thường gặp

| Lỗi | Hậu quả |
|---|---|
| Thiếu cột bắt buộc | Dòng bị **bỏ qua**, không được import |
| Danh mục không tồn tại trong hệ thống | Dịch vụ **vẫn được tạo** nhưng không gán danh mục |
| Giá âm hoặc không phải số | **Báo lỗi validation**, bỏ qua dòng đó |

---

## Tóm Tắt Nhanh

- **Mục đích:** Template import hàng loạt dịch vụ vào hệ thống.
- **Đơn vị tiền tệ:** VND.
- **Trạng thái hỗ trợ:** `ACTIVE` / `INACTIVE`.
- **Số dòng mẫu:** 10 gói dịch vụ, thuộc 5 dịch vụ, 2 danh mục.
- **Lưu ý quan trọng:** 1 dịch vụ nhiều gói → lặp tên dịch vụ trên nhiều dòng.
