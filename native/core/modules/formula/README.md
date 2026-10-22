# Module: formula (✅ nền đã chạy trong C++)

## Trách nhiệm
Tính toán bảng tính và các tiện ích kế toán Việt Nam.

## Đã triển khai
- Lexer + parser + evaluator cho `+ - * /`, ngoặc, dấu âm/dương.
- Tham chiếu ô (`A1`) và vùng ô (`A1:A3`), phát hiện tham chiếu vòng.
- Hàm dãy cơ bản: `SUM`, `MIN`, `MAX`, `AVERAGE`.
- Đọc số theo quy ước vi-VN (`1.234,56` → `1234.56`) và định dạng hiển thị
  vi-VN (`.` phân cách nghìn, `,` thập phân, tối đa 6 chữ số lẻ).
- Lỗi cấp ô có thông điệp tiếng Việt, hiển thị `#LỖI`; lỗi lan truyền qua
  tham chiếu giống bản Excel/TypeScript tham chiếu.
- Giới hạn an toàn: công thức ≤ 8 KiB, ≤ 4096 token, độ sâu ≤ 256, vùng
  ≤ 10.000 ô — tránh tràn stack/treo UI.

## Hợp đồng C ABI
- `vd_formula_compute(const vd_cell_input *cells, size_t len, vd_sheet_result *out)`
- Kết quả giữ đúng thứ tự đầu vào; chuỗi do lõi cấp phát và giải phóng bằng
  `vd_sheet_result_free()`.
- Lỗi cấp ô nằm trong `vd_cell_result.error` (không phải mã lỗi lời gọi).

Luồng gọi: `SheetsEditor → computeSheetEngine → ipc-contract → Tauri
sheet_compute → core-bridge::compute_sheet → C ABI → formula.cpp`.

## Bản tham chiếu TypeScript
`desktop/src/editors/sheets/formula.ts` được giữ làm oracle và fallback cho bản chạy trong
trình duyệt. Khi sửa hành vi, phải cập nhật cả hai và chạy:
- `npm run test:core` — 168 kiểm tra C++.
- `npm test` — 19 test công thức TS + test tầng chọn engine.
- `cargo test -p vietdesk-core-bridge` — parity qua C ABI.

## Còn thiếu
- `IF`, `ROUND`, `VLOOKUP`, địa chỉ tuyệt đối `$A$1`, bảng tính nhiều sheet.
- Đọc số tiền thành chữ tiếng Việt: `1.234.567` → "Một triệu hai trăm ba
  mươi bốn nghìn năm trăm sáu mươi bảy đồng" (bắt buộc cho hóa đơn/chứng từ).
- Làm tròn `round half away from zero` như Excel (hiện dùng định dạng của
  iostream; cần test riêng cho các giá trị đúng nửa đơn vị).
- Hàm ngày tháng, phần trăm, định dạng số theo ô (không chỉ theo giá trị).
- Tính lại toàn bộ bảng sau mỗi lần sửa; bảng lớn cần cập nhật tăng dần
  (dependency graph) thay vì gọi IPC lại toàn bộ.

## Quy ước đã chốt
- Đơn vị tiền tệ mặc định: VND, không có phần thập phân khi hiển thị.
- Xử lý "lẻ"/"linh" trong đọc số: `1.005` → "Một nghìn không trăm lẻ năm".
- Không dùng locale toàn cục của tiến trình để đọc/ghi số (tránh lệch giữa
  máy Việt Nam và CI).
