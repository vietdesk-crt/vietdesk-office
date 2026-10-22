# native/ — mã gốc

Hai lớp chạy trực tiếp trên máy, không phụ thuộc WebView:

| Thư mục | Ngôn ngữ | Vai trò |
|---|---|---|
| `core/` | C++17 | Thuật toán và engine: Unicode tiếng Việt, bố cục A4, OOXML, bảng mã. Phơi ra C ABI thuần. |
| `core-bridge/` | Rust | Wrapper an toàn quanh C ABI (`Result`, kiểm tra lỗi), được các Tauri command gọi. |

Luồng gọi:

```
React (desktop/src) → Tauri command (desktop/src-tauri) → core-bridge (Rust)
                    → C ABI (core/include/vietdesk/core.h) → core/src, core/modules
```

## Build

```bash
# Rust + C++ cùng lúc: build.rs dùng crate `cc`, không cần CMake
cargo build -p vietdesk-core-bridge

# Kiểm thử C++ trực tiếp bằng g++
npm run test:core

# Build lõi C++ độc lập (có CMake)
cmake -S native/core -B native/core/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/core/build -j
ctest --test-dir native/core/build --output-on-failure
```

Quy tắc ABI và hợp đồng từng module: xem [`core/README.md`](core/README.md)
và `core/modules/*/README.md`.
