#include "common/utf8.h"

namespace vd {

bool utf8_decode(const uint8_t *data, size_t len, std::vector<Codepoint> &out) {
  out.clear();
  out.reserve(len);
  size_t i = 0;
  while (i < len) {
    const uint8_t b0 = data[i];
    Codepoint cp = 0;
    size_t extra = 0;

    if (b0 < 0x80) {
      cp = b0;
    } else if ((b0 & 0xE0) == 0xC0) {
      cp = b0 & 0x1F;
      extra = 1;
    } else if ((b0 & 0xF0) == 0xE0) {
      cp = b0 & 0x0F;
      extra = 2;
    } else if ((b0 & 0xF8) == 0xF0) {
      cp = b0 & 0x07;
      extra = 3;
    } else {
      return false; // byte mở đầu không hợp lệ
    }

    if (i + extra >= len) {
      return false; // chuỗi bị cắt cụt
    }
    for (size_t k = 1; k <= extra; ++k) {
      const uint8_t b = data[i + k];
      if ((b & 0xC0) != 0x80) {
        return false; // byte nối không hợp lệ
      }
      cp = (cp << 6) | (b & 0x3F);
    }

    // Chống overlong encoding và surrogate.
    static const Codepoint kMin[] = {0, 0x80, 0x800, 0x10000};
    if (cp < kMin[extra]) {
      return false;
    }
    if (cp >= 0xD800 && cp <= 0xDFFF) {
      return false;
    }
    if (cp > 0x10FFFF) {
      return false;
    }

    out.push_back(cp);
    i += extra + 1;
  }
  return true;
}

std::string utf8_encode(const std::vector<Codepoint> &cps) {
  std::string out;
  out.reserve(cps.size());
  for (Codepoint cp : cps) {
    if (cp < 0x80) {
      out.push_back(static_cast<char>(cp));
    } else if (cp < 0x800) {
      out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
      out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else if (cp < 0x10000) {
      out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
      out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else {
      out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
      out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    }
  }
  return out;
}

} // namespace vd
