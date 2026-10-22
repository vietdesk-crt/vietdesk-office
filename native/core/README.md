# VietDesk Core (C++)

Lõi nghiệp vụ dùng chung cho Writer / Sheets / Slides. Không biết gì về UI,
không phụ thuộc Tauri, không phụ thuộc Rust — chỉ phơi ra **C ABI** trong
`include/vietdesk/core.h`.

## Cấu trúc

| Thư mục | Trạng thái | Nội dung |
|---|---|---|
| `src/common/` | ✅ | UTF-8 decode/encode, tiện ích nền |
| `src/vietnamese/` | ✅ | Chuẩn hóa NFC, bỏ thanh điệu, bỏ dấu |
| `src/formula/` | ✅ | Engine công thức (số học, ô/vùng, SUM/MIN/MAX/AVERAGE) |
| `src/ffi/` | ✅ | C ABI, cấp phát/giải phóng `vd_buf`, bảng kết quả |
| `modules/layout/` | 🚧 | Phân trang A4, ngắt dòng, ngắt trang ảo |
| `modules/ooxml/` | 🚧 | Đọc/ghi `.docx`, `.xlsx`, `.pptx` |
| `modules/formula/` | ✅ | Hợp đồng engine công thức, đọc số tiền VND (một phần) |
| `modules/charset/` | 🚧 | Bảng mã TCVN3 / VNI / VIQR |
| `tests/` | ✅ | Kiểm thử không cần framework |

Mỗi module 🚧 có `README.md` riêng ghi rõ hợp đồng dữ liệu cần làm trước khi code.

## Build

Chạy từ thư mục gốc của repo:

```bash
cmake -S native/core -B native/core/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/core/build -j
ctest --test-dir native/core/build --output-on-failure
```

Hoặc build nhanh không cần CMake (hoặc dùng `npm run test:core`):

```bash
g++ -std=c++17 -Inative/core/include -Inative/core/src \
    native/core/tests/test_formula.cpp native/core/src/common/utf8.cpp \
    native/core/src/formula/formula.cpp \
    native/core/src/vietnamese/vietnamese.cpp native/core/src/ffi/abi.cpp \
    -o /tmp/vietdesk-formula-test && /tmp/vietdesk-formula-test
```

## Quy tắc ABI (bắt buộc)

1. Mọi hàm công khai là `extern "C"`.
2. Không trả `std::string`, `std::vector`, hay ném exception qua biên.
3. Chuỗi ra nằm trong `vd_buf`, giải phóng bằng `vd_buf_free()`.
4. Mã lỗi: `0` = OK, còn lại là lỗi (xem `core.h`).
5. Mọi entry point bọc `try/catch (...)` để không bao giờ ném qua C ABI.

Vi phạm một trong các quy tắc trên sẽ gây crash ngẫu nhiên khi khác
compiler/runtime giữa C++ và Rust — rất khó debug.

## Vì sao chưa có TCVN3/VNI?

Bảng mã TCVN3 (ABC) và VNI-Windows là bảng tra **cố định**, không thể suy ra
từ Unicode. Gõ tay 134 ký tự từ trí nhớ gần như chắc chắn sai. Kế hoạch:
nạp bảng từ nguồn chuẩn (ICU converter data / VNCONV) tại thời điểm build,
thay vì hard-code. Hiện `vd_charset_convert()` trả `VD_ERR_UNSUPPORTED`
thay vì trả dữ liệu sai.
