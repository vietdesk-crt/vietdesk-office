# Module: layout (🚧 chưa triển khai)

## Trách nhiệm
Tính toán vị trí từng dòng, từng trang A4 theo đúng chuẩn văn bản hành chính
Việt Nam (Nghị định 30/2020/NĐ-CP) mà không cần dựng toàn bộ tài liệu.

## Hợp đồng dữ liệu cần chốt trước khi code
- Đơn vị đo: dùng **twip** (1/1440 inch) hay **point** (1/72 inch)? Khuyến nghị
  twip vì OOXML dùng twip, tránh sai số khi round-trip.
- Khổ giấy: A4 210×297mm; lề NĐ30: trên 20–25mm, dưới 20–25mm, trái 30–35mm,
  phải 15–20mm; chọn một bộ mặc định và cho phép ghi đè.
- Font metrics: lấy từ FreeType/HarfBuzz hay tự đọc `hmtx`?
- Kết quả trả về: mảng `LineBox { y, height, glyph_run[] }` phẳng (POD) để
  truyền qua ABI, không dùng con trỏ lồng nhau.

## Phụ thuộc dự kiến
`HarfBuzz` (shaping tiếng Việt), `FreeType` (metrics), `Skia` (vẽ, giai đoạn sau).

## Việc cần làm trước
1. Chốt unit + mô hình `LineBox`/`PageBox`.
2. Benchmark HarfBuzz với chuỗi tiếng Việt có dấu chồng (ế, ữ, ợ) để đo chi phí.
3. Quyết định layout chạy native (FFI) hay WASM — ảnh hưởng trực tiếp tới API.
