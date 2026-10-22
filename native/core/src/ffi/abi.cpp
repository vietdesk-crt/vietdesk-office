// Cầu nối C ABI. Đây là BIÊN GIỚI DUY NHẤT mà Rust/ngôn ngữ khác được gọi vào.
// Không đặt logic nghiệp vụ ở đây: chỉ kiểm tra tham số, gọi module, đóng gói kết quả.
#include "vietdesk/core.h"

#include "common/utf8.h"
#include "formula/formula.h"
#include "vietnamese/vietnamese.h"

#include <cstdlib>
#include <cstring>
#include <new>
#include <string>
#include <utility>
#include <vector>

namespace {

constexpr const char *kVersion = "0.2.0";

int32_t fill_buf(const std::string &value, vd_buf *out) {
  out->ptr = nullptr;
  out->len = 0;
  out->cap = 0;
  if (value.empty()) {
    return VD_OK;
  }
  auto *mem = static_cast<uint8_t *>(std::malloc(value.size()));
  if (mem == nullptr) {
    return VD_ERR_OUT_OF_MEMORY;
  }
  std::memcpy(mem, value.data(), value.size());
  out->ptr = mem;
  out->len = value.size();
  out->cap = value.size();
  return VD_OK;
}

bool valid_text_args(const uint8_t *in, size_t in_len, const vd_buf *out) {
  if (out == nullptr) {
    return false;
  }
  if (in == nullptr && in_len != 0) {
    return false;
  }
  return true;
}

int32_t alloc_result_string(const std::string &value, uint8_t **ptr,
                            size_t *len) {
  *ptr = nullptr;
  *len = 0;
  if (value.empty()) {
    return VD_OK;
  }
  auto *mem = static_cast<uint8_t *>(std::malloc(value.size()));
  if (mem == nullptr) {
    return VD_ERR_OUT_OF_MEMORY;
  }
  std::memcpy(mem, value.data(), value.size());
  *ptr = mem;
  *len = value.size();
  return VD_OK;
}

} // namespace

extern "C" {

const char *vd_core_version(void) { return kVersion; }

int32_t vd_vietnamese_compose(const uint8_t *in, size_t in_len, vd_buf *out) {
  if (!valid_text_args(in, in_len, out)) {
    return VD_ERR_INVALID_ARG;
  }
  try {
    const std::string input(reinterpret_cast<const char *>(in), in_len);
    std::string result;
    if (!vd::compose_nfc(input, result)) {
      return VD_ERR_INVALID_UTF8;
    }
    return fill_buf(result, out);
  } catch (...) {
    return VD_ERR_INTERNAL;
  }
}

int32_t vd_vietnamese_strip_tones(const uint8_t *in, size_t in_len,
                                  vd_buf *out) {
  if (!valid_text_args(in, in_len, out)) {
    return VD_ERR_INVALID_ARG;
  }
  try {
    const std::string input(reinterpret_cast<const char *>(in), in_len);
    std::vector<vd::Codepoint> probe;
    if (!vd::utf8_decode(in, in_len, probe)) {
      return VD_ERR_INVALID_UTF8;
    }
    return fill_buf(vd::strip_tones(input), out);
  } catch (...) {
    return VD_ERR_INTERNAL;
  }
}

int32_t vd_vietnamese_remove_diacritics(const uint8_t *in, size_t in_len,
                                        vd_buf *out) {
  if (!valid_text_args(in, in_len, out)) {
    return VD_ERR_INVALID_ARG;
  }
  try {
    std::vector<vd::Codepoint> probe;
    if (!vd::utf8_decode(in, in_len, probe)) {
      return VD_ERR_INVALID_UTF8;
    }
    const std::string input(reinterpret_cast<const char *>(in), in_len);
    return fill_buf(vd::remove_diacritics(input), out);
  } catch (...) {
    return VD_ERR_INTERNAL;
  }
}

int32_t vd_vietnamese_detect_charset(const uint8_t *in, size_t in_len,
                                     vd_charset *out) {
  if (out == nullptr || (in == nullptr && in_len != 0)) {
    return VD_ERR_INVALID_ARG;
  }

  std::vector<vd::Codepoint> probe;
  if (vd::utf8_decode(in, in_len, probe)) {
    *out = VD_CHARSET_UNICODE;
    return VD_OK;
  }

  // Không phải UTF-8: phân biệt TCVN3 và VNI bằng vùng byte đặc trưng.
  // TCVN3 dùng dải 0xA1..0xFE cho toàn bộ chữ có dấu; VNI dùng 0x80..0xFF
  // nhưng phần lớn nội dung vẫn là ASCII.
  bool has_tcvn_range = false;
  bool has_high_byte = false;
  for (size_t i = 0; i < in_len; ++i) {
    if (in[i] >= 0xA1) {
      has_tcvn_range = true;
    }
    if (in[i] >= 0x80) {
      has_high_byte = true;
    }
  }

  if (has_high_byte) {
    *out = VD_CHARSET_TCVN3;
  } else {
    *out = VD_CHARSET_UNICODE; // toàn ASCII: coi như Unicode
  }
  (void)has_tcvn_range;
  return VD_OK;
}

int32_t vd_charset_convert(vd_charset src, vd_charset dst, const uint8_t *in,
                           size_t in_len, vd_buf *out) {
  if (!valid_text_args(in, in_len, out)) {
    return VD_ERR_INVALID_ARG;
  }

  // Sao chép nguyên văn khi không cần chuyển.
  if (src == dst) {
    if (src != VD_CHARSET_UNICODE) {
      return VD_ERR_UNSUPPORTED;
    }
    try {
      return fill_buf(std::string(reinterpret_cast<const char *>(in), in_len),
                      out);
    } catch (...) {
      return VD_ERR_INTERNAL;
    }
  }

  // Bảng mã TCVN3/VNI chưa được nạp. Xem core/modules/charset/README.md:
  // bảng mã phải lấy từ nguồn chuẩn (VNCONV / ICU), không được gõ tay.
  return VD_ERR_UNSUPPORTED;
}

int32_t vd_formula_compute(const vd_cell_input *cells, size_t len,
                           vd_sheet_result *out) {
  if (out == nullptr) {
    return VD_ERR_INVALID_ARG;
  }
  out->cells = nullptr;
  out->len = 0;
  out->cap = 0;

  if (cells == nullptr && len != 0) {
    return VD_ERR_INVALID_ARG;
  }

  try {
    std::vector<std::pair<std::string, std::string>> input;
    input.reserve(len);
    std::vector<vd::Codepoint> probe;

    for (size_t i = 0; i < len; ++i) {
      const vd_cell_input &cell = cells[i];
      if ((cell.id == nullptr && cell.id_len != 0) ||
          (cell.raw == nullptr && cell.raw_len != 0)) {
        return VD_ERR_INVALID_ARG;
      }
      if (!vd::utf8_decode(cell.id, cell.id_len, probe) ||
          !vd::utf8_decode(cell.raw, cell.raw_len, probe)) {
        return VD_ERR_INVALID_UTF8;
      }
      input.emplace_back(
          cell.id_len == 0
              ? std::string()
              : std::string(reinterpret_cast<const char *>(cell.id),
                            cell.id_len),
          cell.raw_len == 0
              ? std::string()
              : std::string(reinterpret_cast<const char *>(cell.raw),
                            cell.raw_len));
    }

    const auto results = vd::formula::compute(input);
    if (input.empty()) {
      return VD_OK;
    }

    auto *array = static_cast<vd_cell_result *>(
        std::calloc(input.size(), sizeof(vd_cell_result)));
    if (array == nullptr) {
      return VD_ERR_OUT_OF_MEMORY;
    }
    out->cells = array;
    out->len = input.size();
    out->cap = input.size();

    for (size_t i = 0; i < input.size(); ++i) {
      const auto found = results.find(input[i].first);
      if (found == results.end()) {
        vd_sheet_result_free(out);
        return VD_ERR_INTERNAL;
      }

      vd_cell_result &target = array[i];
      const vd::formula::CellResult &value = found->second;
      if (alloc_result_string(input[i].first, &target.id, &target.id_len) !=
              VD_OK ||
          alloc_result_string(value.display, &target.display,
                              &target.display_len) != VD_OK ||
          (value.has_error &&
           alloc_result_string(value.error, &target.error,
                               &target.error_len) != VD_OK)) {
        vd_sheet_result_free(out);
        return VD_ERR_OUT_OF_MEMORY;
      }
      target.has_numeric = value.has_numeric ? 1 : 0;
      target.numeric = value.numeric;
    }

    return VD_OK;
  } catch (const std::bad_alloc &) {
    vd_sheet_result_free(out);
    return VD_ERR_OUT_OF_MEMORY;
  } catch (...) {
    vd_sheet_result_free(out);
    return VD_ERR_INTERNAL;
  }
}

void vd_sheet_result_free(vd_sheet_result *result) {
  if (result == nullptr) {
    return;
  }
  if (result->cells != nullptr) {
    for (size_t i = 0; i < result->len; ++i) {
      std::free(result->cells[i].id);
      std::free(result->cells[i].display);
      std::free(result->cells[i].error);
    }
    std::free(result->cells);
  }
  result->cells = nullptr;
  result->len = 0;
  result->cap = 0;
}

void vd_buf_free(vd_buf *buf) {
  if (buf == nullptr) {
    return;
  }
  std::free(buf->ptr);
  buf->ptr = nullptr;
  buf->len = 0;
  buf->cap = 0;
}

} // extern "C"
