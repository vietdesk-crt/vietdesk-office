# Module: ooxml (🚧 chưa triển khai)

## Trách nhiệm
Đọc/ghi `.docx`, `.xlsx`, `.pptx` theo hướng **round-trip**: mở file → sửa →
lưu lại mà không làm mất định dạng mà VietDesk chưa hiểu.

## Nguyên tắc round-trip
1. Giữ nguyên mọi part XML không đụng tới (byte-for-byte) — đây là điều kiện
   sống còn để không phá file của người dùng.
2. Chỉ ghi lại part nào thực sự thay đổi.
3. Ghi qua file tạm rồi `rename()` nguyên tử, không ghi đè trực tiếp.
4. Không "chuẩn hóa" XML của Office: giữ namespace, thứ tự thuộc tính, `mc:Ignorable`.

## Phụ thuộc dự kiến
`libxml2` (parse), `minizip-ng` (zip), `OpenXLSX` (tham khảo, không bắt buộc).

## Rủi ro đã biết
- Số floating point của Excel lưu dạng `t="n"` với tối đa 15 chữ số — phải
  format lại đúng để tránh sai số hiển thị.
- `.pptx` có quan hệ phức tạp (slide → layout → master → theme); sửa một slide
  có thể phải cập nhật `presentation.xml.rels`.
- Font nhúng (embedded fonts) là part nhị phân, tuyệt đối không re-encode.
