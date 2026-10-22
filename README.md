<p align="center">
  <img src="assets/branding/vietdesk-logo-refined-horizontal.svg" alt="VietDesk Office" width="460" />
</p>

# VietDesk Office

**Bộ ứng dụng văn phòng cho người Việt** — bao gồm **Writer** (soạn thảo văn bản),
**Sheets** (bảng tính) và **Slides** (trình chiếu), gói gọn trong một vỏ desktop
duy nhất, nhẹ và nhanh.

VietDesk được làm cho người Việt: soạn thảo sạch dấu tiếng Việt từ đầu, chuẩn
hóa Unicode một nút bấm, và đọc/ghi định dạng văn phòng quen thuộc mà không cần
cài đặt gói phần mềm phổ thông nào kèm theo.

> Trạng thái: **bản dựng đầu tiên dùng được**. Ba ứng dụng đã chạy end-to-end —
> tạo, soạn, lưu, mở lại đều ổn. Các phần còn lại đang được hoàn thiện dần theo
> lộ trình bên dưới.

## Ba ứng dụng

### ✍️ Writer — soạn thảo văn bản

Trình soạn thảo đầy đủ cho văn bản hành chính và học tập:

- Định dạng cơ bản: đậm, nghiêng, gạch chân, gạch ngang; tiêu đề H1–H3; danh
  sách gạch đầu dòng & đánh số; canh lề trái/giữa/phải/đều.
- Định dạng nâng cao: kiểu chữ, cỡ chữ, màu chữ, tô sáng, giãn dòng, xóa định
  dạng.
- Bảng: chèn theo lưới, thêm/xóa hàng & cột, gộp/tách ô, hàng tiêu đề, Tab
  chuyển ô.
- Liên kết an toàn và ngắt trang ở cấp đoạn văn.
- Tìm & thay thế, hoàn tác/làm lại.

### 📊 Sheets — bảng tính

- Công thức cơ bản: `+ - * /`, tham chiếu ô và vùng, `SUM`, `MIN`, `MAX`,
  `AVERAGE`.

### 📽 Slides — trình chiếu

- Thêm, sửa, sắp xếp slide với khung 16:9.

## Điểm nhấn

- **Tự lưu & khôi phục bản nháp** — tự lưu sau 1,5 giây ngừng gõ; tắt máy đột
  ngột mà bản nháp vẫn nằm đó, mở lại tiếp tục viết.
- **Chuẩn hóa tiếng Việt** — chuẩn Unicode NFC, bỏ thanh điệu/bỏ dấu đúng chuẩn,
  chạy ngay trong ứng dụng.
- **Định dạng gốc `.vdx`** — tài liệu lưu nguyên vẹn cấu trúc, có đầy đủ lịch
  sử phiên bản dữ liệu.
- **Tệp gần đây & trang chủ** — mọi thứ bạn mở gần đây đều về được trong một
  nút bấm.
- **Tab kiểu web** — mở bao nhiêu tài liệu cũng được, mỗi tab một ứng dụng.
- **Giao diện sáng/tối** — áp theo hệ điều hành hoặc tự chọn.

## Lộ trình

| Phần | Trạng thái |
|---|---|
| Ba ứng dụng Writer/Sheets/Slides | ✅ |
| Trang chủ + tệp gần đây | ✅ |
| Lưu / mở tài liệu `.vdx`, tự lưu + khôi phục bản nháp | ✅ |
| Chuẩn hóa tiếng Việt (NFC, bỏ dấu) | ✅ |
| Tính năng Writer (định dạng, bảng, liên kết, ngắt trang) | ✅ |
| Engine công thức bảng tính | ✅ |
| Phân trang A4 thật (in ấn chính xác) | 🚧 |
| Đọc/ghi đầy đủ tài liệu Word/Excel/PowerPoint | 🚧 |
| Bảng mã TCVN3 / VNI | 🚧 |
| Ký số, hợp tác thời gian thực, bảo vệ dữ liệu | 🚧 |

Chi tiết kỹ thuật và bản thiết kế đầy đủ nằm ở [ARCHITECTURE.md](ARCHITECTURE.md).

## Phím tắt Writer

| Phím | Tác dụng |
|---|---|
| `Ctrl+S` / `Ctrl+Shift+S` | Lưu / Lưu thành tệp mới |
| `Ctrl+B`, `Ctrl+I`, `Ctrl+U` | Đậm, nghiêng, gạch chân |
| `Ctrl+Shift+X` | Gạch ngang |
| `Ctrl+Alt+1/2/3` | Tiêu đề cấp 1/2/3 |
| `Ctrl+Alt+0` | Đoạn văn thường |
| `Ctrl+Shift+8` / `Ctrl+Shift+7` | Danh sách gạch đầu dòng / đánh số |
| `Ctrl+Shift+L/E/R/J` | Canh trái / giữa / phải / đều |
| `Ctrl+Z`, `Ctrl+Y` | Hoàn tác, làm lại |
| `Ctrl+F`, `Ctrl+H` | Tìm, tìm & thay thế |
| `Tab` / `Shift+Tab` | Chuyển ô trước/sau trong bảng |
| `Esc` | Đóng thanh tìm kiếm |

## Đóng góp

Mở Issue trước khi gửi Pull Request để trao đổi hướng làm.

## Giấy phép

[MIT](LICENSE)
