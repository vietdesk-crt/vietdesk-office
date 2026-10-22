#ifndef VIETDESK_COMMON_UTF8_H
#define VIETDESK_COMMON_UTF8_H

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace vd {

using Codepoint = char32_t;

// Giải mã UTF-8. Trả false nếu chuỗi không hợp lệ (byte thừa, surrogate,
// codepoint > U+10FFFF).
bool utf8_decode(const uint8_t *data, size_t len, std::vector<Codepoint> &out);

// Mã hóa danh sách codepoint thành UTF-8.
std::string utf8_encode(const std::vector<Codepoint> &cps);

} // namespace vd

#endif // VIETDESK_COMMON_UTF8_H
