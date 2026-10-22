// Engine công thức bảng tính — bản C++ chính thức.
//
// Hợp đồng dữ liệu và hành vi phải khớp với bản tham chiếu TypeScript ở
// `desktop/src/editors/sheets/formula.ts` (được giữ làm oracle và fallback cho bản web):
//   - Cùng cú pháp: + - * / ( ), tham chiếu ô, vùng ô, SUM/MIN/MAX/AVERAGE.
//   - Cùng thông báo lỗi tiếng Việt và cùng quy ước hiển thị "#LỖI".
//   - Cùng cách đọc số vi-VN: "1.234,56" -> 1234.56.
//
// Khác biệt có chủ đích so với bản TS:
//   - Giới hạn độ sâu/độ dài công thức để không tràn stack C++.
//   - Không dùng locale của tiến trình khi đọc/ghi số.
#pragma once

#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace vd::formula {

struct CellResult {
  /** Chuỗi hiển thị trên lưới (đã định dạng vi-VN nếu là số). */
  std::string display;
  bool has_numeric = false;
  double numeric = 0.0;
  bool has_error = false;
  std::string error;
};

/** Đọc số theo quy ước Việt Nam. Trả false nếu không phải số. */
bool parse_number(const std::string &raw, double *out);

/** Định dạng số kiểu vi-VN: "." phân cách nghìn, "," thập phân, tối đa 6 chữ số. */
std::string format_number(double value);

/**
 * Tính toàn bộ bảng. Khóa là mã ô ("A1"), giá trị là chuỗi thô.
 * Kết quả trả về đủ mọi ô đầu vào, kể cả ô trống/văn bản.
 */
std::unordered_map<std::string, CellResult>
compute(const std::vector<std::pair<std::string, std::string>> &cells);

} // namespace vd::formula
