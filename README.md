<p align="center">
  <img src="assets/branding/vietdesk-logo-refined-horizontal.svg" alt="VietDesk Office" width="460" />
</p>

# vietdesk-office

Bộ ứng dụng văn phòng cho người Việt: **Writer** (Word), **Sheets** (Excel),
**Slides** (PowerPoint) trong một vỏ desktop duy nhất.

Giao diện chạy bằng **Tauri 2 + React/TypeScript**; phần tính toán nặng
(phân trang A4, OOXML, công thức, bảng mã) nằm trong **lõi C++** dùng chung,
gọi qua C ABI.

> Trạng thái: **bản dựng đầu tiên dùng được**. Pipeline UI → Rust → C++ đã chạy
> end-to-end; tài liệu lưu/mở được ở định dạng gốc `.vdx`; engine công thức đã
> chạy trong C++; OOXML và bố cục A4 còn là placeholder có hợp đồng dữ liệu rõ ràng.

Bản thiết kế mục tiêu đầy đủ (14 luồng logic, 4 tầng) nằm ở
[ARCHITECTURE.md](ARCHITECTURE.md).

## Kiến trúc

```
vietdesk-office/
├── desktop/              # Vỏ Tauri + toàn bộ giao diện soạn thảo
│   ├── src/              # Shell UI: Home, Settings, format, style
│   │   └── editors/      # writer/, sheets/, slides/
│   └── src-tauri/        # Rust: Tauri command, đọc/ghi tệp, lưu recents
├── packages/             # Thư viện TypeScript dùng chung
│   ├── ipc-contract/     # Hợp đồng IPC — nguồn sự thật duy nhất
│   ├── ui/               # Rail, design token
│   └── vietnamese/       # Tiện ích tiếng Việt chạy trên trình duyệt
├── native/               # Mã gốc, không phụ thuộc UI
│   ├── core/             # LÕI C++17 (C ABI)
│   │   ├── include/vietdesk/core.h
│   │   ├── src/          # common, vietnamese, formula, ffi
│   │   ├── modules/      # layout, ooxml, formula, charset
│   │   └── tests/
│   └── core-bridge/      # Wrapper Rust an toàn quanh C ABI
├── assets/               # Nhận diện thương hiệu (SVG)
└── scripts/              # Kiểm thử lõi C++ bằng trình biên dịch trực tiếp
```

**Nguyên tắc:** UI không bao giờ gọi C++ trực tiếp. Luồng luôn là
`React → Tauri command → core-bridge (Rust) → C ABI → module C++`.

## Yêu cầu hệ thống

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | ≥ 20 | dùng npm workspaces |
| Rust | ≥ 1.77 | cài bằng [rustup](https://rustup.rs) |
| CMake | ≥ 3.20 | chỉ cần khi build lõi C++ độc lập |
| Trình biên dịch C++ | C++17 | g++ hoặc clang++ |
| WebKitGTK | 4.1 | Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libsoup-3.0-dev` |

Ubuntu/Debian:

```bash
sudo apt install build-essential cmake pkg-config \
    libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev
```

Windows: cài **Visual Studio Build Tools** (workload "Desktop development
with C++") và WebView2 Runtime (có sẵn trên Windows 11). Không cần CMake nếu
chỉ build qua `cargo` — crate `cc` tự gọi MSVC.

## Cài đặt

```bash
npm install
```

## Chạy

```bash
# Giao diện trong trình duyệt (dùng fallback TypeScript, không cần Rust)
npm run dev

# Ứng dụng desktop thật (UI → Rust → C++)
npm run tauri dev

# Đóng gói bản phát hành
npm run tauri build
```

## Kiểm thử

```bash
npm test            # TypeScript: công thức, engine fallback, tiện ích tiếng Việt
npm run test:core   # C++: chuẩn hóa NFC, bỏ dấu, engine công thức, C ABI
cargo test -p vietdesk-core-bridge   # Rust: cầu nối C++ (cần Rust)
```

## Trạng thái từng phần

| Phần | Trạng thái | Ghi chú |
|---|---|---|
| Vỏ Tauri + tab Writer/Sheets/Slides | ✅ | `desktop/` |
| Trang chủ + tệp gần đây | ✅ | lưu trong thư mục cấu hình (Rust), fallback localStorage |
| Lưu / mở tài liệu `.vdx` | ✅ | ghi nguyên tử (temp → fsync → rename), Save As, Ctrl+S |
| Tự lưu + khôi phục bản nháp | ✅ | tự lưu tệp `.vdx` sau 1,5 giây; bản nháp localStorage |
| Mở tệp từ hộp thoại hệ điều hành | ✅ | `tauri-plugin-dialog`; `.vdx` đọc được, OOXML chỉ ghi nhận tên |
| IPC UI → Rust → C++ | ✅ | `core.h`, `core-bridge`, 5 command lõi |
| Chuẩn hóa tiếng Việt (NFC, bỏ dấu) | ✅ | 24 kiểm tra C++, 12 test Rust |
| Editor văn bản | ✅ | ProseMirror: đậm/nghiêng/gạch chân/gạch ngang, H1–H3, danh sách, canh lề, tìm & thay thế, hoàn tác |
| Định dạng nâng cao | ✅ | Kiểu chữ, cỡ chữ, màu chữ, tô sáng, giãn dòng, xóa định dạng |
| Bảng trong Writer | ✅ | Chèn bảng theo lưới, thêm/xóa hàng & cột, gộp/tách ô, hàng tiêu đề, Tab chuyển ô |
| Liên kết & ngắt trang | ✅ | Gắn liên kết (chỉ URL an toàn), ngắt trang ở cấp đoạn văn |
| Engine công thức | ✅ | C++ (desktop) + TS fallback: `+ - * /`, ô, vùng, SUM/MIN/MAX/AVERAGE |
| Trình chiếu cơ bản | ✅ | thêm/sửa slide, khung 16:9 |
| Phân trang A4 thật | 🚧 | `native/core/modules/layout` |
| OOXML round-trip (.docx/.xlsx/.pptx) | 🚧 | `native/core/modules/ooxml` |
| Bảng mã TCVN3 / VNI | 🚧 | `native/core/modules/charset` — chờ bảng mã chuẩn |
| Ký số PKCS#11, CRDT, DLP | 🚧 | chưa bắt đầu |

### Phím tắt Writer

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

## Quyết định kiến trúc đã chốt

1. **Tauri 2, không phải Electron** — vỏ nhẹ, backend Rust, an toàn bộ nhớ ở
   tầng điều phối.
2. **C++ cho lõi tính toán, Rust chỉ làm cầu nối** — C++ có hệ sinh thái
   HarfBuzz/ICU/Skia/libxml2 phù hợp cho layout và OOXML.
3. **Web-first có chủ đích** — soạn thảo dùng ProseMirror trong WebView; engine
   layout C++ sẽ thay dần qua đúng hợp đồng IPC, không phải viết lại UI.
4. **Không trả `std::string`/`std::vector` qua ABI** — mọi chuỗi đi qua
   `vd_buf` và được giải phóng tường minh.
5. **Không bịa bảng mã** — TCVN3/VNI trả `VD_ERR_UNSUPPORTED` cho tới khi nạp
   bảng từ nguồn chuẩn (ICU/VNCONV), tránh làm hỏng dữ liệu người dùng.
6. **Lịch sử tệp gần đây thuộc về vỏ ứng dụng, không phải lõi** — Rust ghi
   `recent-files.json` vào thư mục cấu hình; C++ không cần biết người dùng
   mở tệp nào.
7. **Định dạng gốc `.vdx` là JSON có bao, có phiên bản** — `format`, `version`,
   `kind`, `meta`, `content`. UI đọc/ghi qua `packages/ipc-contract`; engine
   OOXML sau này chỉ cần ánh xạ vào `content`, không phải đổi cấu trúc tệp.
8. **Không ghi đè tệp không phải `.vdx`** — tệp `.docx/.xlsx/.pptx` được giữ
   nguyên cho tới khi có round-trip OOXML thật; lưu từ tài liệu đó luôn hỏi
   đường dẫn mới.

## Đóng góp

Mở Issue trước khi gửi Pull Request. Với thay đổi ảnh hưởng ABI, cập nhật
đồng thời `native/core/include/vietdesk/core.h`, `native/core-bridge`, Tauri command
và `packages/ipc-contract`.

## Giấy phép

[MIT](LICENSE)
