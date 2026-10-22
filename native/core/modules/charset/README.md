# Module: charset (🚧 chờ dữ liệu bảng mã)

## Trách nhiệm
Chuyển đổi giữa Unicode (UTF-8) và các bảng mã cũ còn dùng trong hồ sơ,
văn bản hành chính Việt Nam: **TCVN3 (ABC)**, **VNI-Windows**, **VIQR**.

## Vì sao chưa code
TCVN3/VNI là bảng tra 1-1 cố định, **không thể suy ra từ quy tắc Unicode**.
Gõ tay từ trí nhớ sẽ tạo ra bảng sai — nguy hiểm hơn là không hỗ trợ, vì người
dùng sẽ mất dữ liệu mà không biết.

## Kế hoạch nạp bảng
1. Lấy bảng từ nguồn chuẩn:
   - ICU: `icu/source/data/mappings/` (có converter TCVN3 / VNI-Windows)
   - Hoặc VNCONV của Hội Tin học Việt Nam
2. Sinh file `charset_map.tsv` (codepoint Unicode ↔ byte bảng mã) bằng script
   `tools/gen_charset_table.py`, commit file sinh ra để build tất định.
3. Nạp bảng lúc khởi động, đăng ký qua API:
   ```c
   int32_t vd_charset_register(vd_charset cs, const uint32_t *map, size_t len);
   ```
4. Bổ sung test: chuyển xuôi rồi ngược phải khôi phục **đúng từng byte**.

## Lưu ý kỹ thuật
- TCVN3 không mã hóa được một số ký tự ngoài tiếng Việt → phải trả lỗi rõ ràng,
  không thay bằng `?` một cách âm thầm.
- VNI-Windows dùng byte điều khiển (0x01–0x1F) cho một số dấu → dễ xung đột với
  ký tự điều khiển; cần kiểm tra trước khi chuyển.
- Chuẩn hóa Unicode: luôn `NFC` trước khi chuyển sang bảng mã cũ.
