#ifndef VIETDESK_VIETNAMESE_H
#define VIETDESK_VIETNAMESE_H

#include <string>

namespace vd {

// Ghép dấu tách rời (NFD) thành ký tự dựng sẵn (NFC) theo quy tắc tiếng Việt.
// Xử lý được mọi thứ tự gõ: "e" + dấu mũ + dấu sắc, hoặc "e" + dấu sắc + dấu mũ.
// Trả chuỗi rỗng nếu đầu vào không phải UTF-8 hợp lệ.
bool compose_nfc(const std::string &in, std::string &out);

// Bỏ thanh điệu (sắc/huyền/hỏi/ngã/nặng), giữ dấu cấu tạo chữ: ế -> ê.
std::string strip_tones(const std::string &in);

// Bỏ toàn bộ dấu: ế -> e, đ -> d. Dùng cho tìm kiếm không dấu.
std::string remove_diacritics(const std::string &in);

} // namespace vd

#endif // VIETDESK_VIETNAMESE_H
