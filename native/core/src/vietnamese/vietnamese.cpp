#include "vietnamese/vietnamese.h"
#include "common/utf8.h"

#include <cstddef>
#include <vector>

namespace vd {
namespace {

// Bảng 12 nguyên âm tiếng Việt, mỗi hàng: chữ gốc + 5 thanh điệu
// theo thứ tự: sắc, huyền, hỏi, ngã, nặng.
// Đây là nguồn dữ liệu chuẩn của lõi; mọi hàm khác đều suy ra từ bảng này.
struct VowelRow {
  Codepoint base;
  Codepoint toned[6]; // [0] = không thanh điệu
  Codepoint plain;    // dạng bỏ hết dấu (dùng cho tìm kiếm)
};

const VowelRow kRows[] = {
    {0x0061, {0x0061, 0x00E1, 0x00E0, 0x1EA3, 0x00E3, 0x1EA1}, 0x0061}, // a
    {0x0103, {0x0103, 0x1EAF, 0x1EB1, 0x1EB3, 0x1EB5, 0x1EB7}, 0x0061}, // ă
    {0x00E2, {0x00E2, 0x1EA5, 0x1EA7, 0x1EA9, 0x1EAB, 0x1EAD}, 0x0061}, // â
    {0x0065, {0x0065, 0x00E9, 0x00E8, 0x1EBB, 0x1EBD, 0x1EB9}, 0x0065}, // e
    {0x00EA, {0x00EA, 0x1EBF, 0x1EC1, 0x1EC3, 0x1EC5, 0x1EC7}, 0x0065}, // ê
    {0x0069, {0x0069, 0x00ED, 0x00EC, 0x1EC9, 0x0129, 0x1ECB}, 0x0069}, // i
    {0x006F, {0x006F, 0x00F3, 0x00F2, 0x1ECF, 0x00F5, 0x1ECD}, 0x006F}, // o
    {0x00F4, {0x00F4, 0x1ED1, 0x1ED3, 0x1ED5, 0x1ED7, 0x1ED9}, 0x006F}, // ô
    {0x01A1, {0x01A1, 0x1EDB, 0x1EDD, 0x1EDF, 0x1EE1, 0x1EE3}, 0x006F}, // ơ
    {0x0075, {0x0075, 0x00FA, 0x00F9, 0x1EE7, 0x0169, 0x1EE5}, 0x0075}, // u
    {0x01B0, {0x01B0, 0x1EE9, 0x1EEB, 0x1EED, 0x1EEF, 0x1EF1}, 0x0075}, // ư
    {0x0079, {0x0079, 0x00FD, 0x1EF3, 0x1EF7, 0x1EF9, 0x1EF5}, 0x0079}, // y
};

constexpr size_t kRowCount = sizeof(kRows) / sizeof(kRows[0]);

// Dấu tổ hợp (combining marks) dùng trong tiếng Việt.
constexpr Codepoint kToneAcute = 0x0301;    // sắc
constexpr Codepoint kToneGrave = 0x0300;    // huyền
constexpr Codepoint kToneHook = 0x0309;     // hỏi
constexpr Codepoint kToneTilde = 0x0303;    // ngã
constexpr Codepoint kToneDotBelow = 0x0323; // nặng
constexpr Codepoint kMarkCircumflex = 0x0302;
constexpr Codepoint kMarkBreve = 0x0306;
constexpr Codepoint kMarkHorn = 0x031B;

// Đưa ký tự về dạng chữ thường để tra bảng.
// Chỉ xử lý miền chữ Latin có cặp hoa/thường lệch nhau 0x20 hoặc 1.
Codepoint to_lower(Codepoint c) {
  if (c >= 'A' && c <= 'Z') {
    return c + 0x20;
  }
  if (c >= 0x00C0 && c <= 0x00DE && c != 0x00D7) {
    return c + 0x20;
  }
  // Ngoại lệ: cặp Ư/ư (U+01AF/U+01B0) đi ngược thứ tự chẵn-lẻ so với phần
  // còn lại của Latin Extended-B, nên phải xử lý riêng trước quy tắc chung.
  if (c == 0x01AF) {
    return 0x01B0;
  }
  if (c == 0x01B0) {
    return c;
  }
  if ((c >= 0x0100 && c <= 0x01B0) || (c >= 0x1EA0 && c <= 0x1EFF)) {
    if (c % 2 == 0) {
      return c + 1;
    }
  }
  return c;
}

bool is_upper(Codepoint c) { return to_lower(c) != c; }

// Đặt chữ thường `lower` vào đúng kiểu hoa/thường của `original`.
Codepoint match_case(Codepoint original, Codepoint lower) {
  if (!is_upper(original)) {
    return lower;
  }
  return lower < 0x0100 ? lower - 0x20 : lower - 1;
}

int tone_index(Codepoint mark) {
  switch (mark) {
  case kToneAcute:
    return 1;
  case kToneGrave:
    return 2;
  case kToneHook:
    return 3;
  case kToneTilde:
    return 4;
  case kToneDotBelow:
    return 5;
  default:
    return 0;
  }
}

struct Lookup {
  int row;
  int tone;
  bool found;
};

// Tra một ký tự (đã về chữ thường) xem nó là nguyên âm nào, ở thanh điệu nào.
Lookup lookup_vowel(Codepoint lower) {
  for (size_t r = 0; r < kRowCount; ++r) {
    for (int t = 0; t < 6; ++t) {
      if (kRows[r].toned[t] == lower) {
        return {static_cast<int>(r), t, true};
      }
    }
  }
  return {0, 0, false};
}

// Ghép dấu cấu tạo chữ (mũ/trăng/móc) vào nguyên âm gốc.
// Trả 0 nếu tổ hợp không hợp lệ.
Codepoint apply_shape(Codepoint baseLower, Codepoint mark) {
  if (mark == kMarkCircumflex) {
    if (baseLower == 0x0061)
      return 0x00E2; // â
    if (baseLower == 0x0065)
      return 0x00EA; // ê
    if (baseLower == 0x006F)
      return 0x00F4; // ô
  } else if (mark == kMarkBreve) {
    if (baseLower == 0x0061)
      return 0x0103; // ă
  } else if (mark == kMarkHorn) {
    if (baseLower == 0x006F)
      return 0x01A1; // ơ
    if (baseLower == 0x0075)
      return 0x01B0; // ư
  }
  return 0;
}

} // namespace

bool compose_nfc(const std::string &in, std::string &out) {
  std::vector<Codepoint> cps;
  if (!utf8_decode(reinterpret_cast<const uint8_t *>(in.data()), in.size(),
                   cps)) {
    out.clear();
    return false;
  }

  std::vector<Codepoint> result;
  result.reserve(cps.size());

  for (Codepoint cp : cps) {
    const int tone = tone_index(cp);
    const bool is_mark = cp == kMarkCircumflex || cp == kMarkBreve ||
                         cp == kMarkHorn;

    if ((tone != 0 || is_mark) && !result.empty()) {
      const Codepoint prev = result.back();
      const Codepoint prevLower = to_lower(prev);
      const Lookup lk = lookup_vowel(prevLower);

      if (tone != 0 && lk.found) {
        // Thanh điệu chỉ áp lên nguyên âm chưa có thanh.
        if (lk.tone == 0) {
          result.back() =
              match_case(prev, kRows[lk.row].toned[tone]);
        }
        continue; // dấu đã được hấp thụ
      }

      if (is_mark && lk.found && lk.tone == 0) {
        const Codepoint shaped = apply_shape(kRows[lk.row].base, cp);
        if (shaped != 0) {
          result.back() = match_case(prev, shaped);
          continue;
        }
      }
      // Không áp được -> giữ nguyên dấu tổ hợp để không mất dữ liệu.
    }

    result.push_back(cp);
  }

  out = utf8_encode(result);
  return true;
}

std::string strip_tones(const std::string &in) {
  std::vector<Codepoint> cps;
  if (!utf8_decode(reinterpret_cast<const uint8_t *>(in.data()), in.size(),
                   cps)) {
    return in; // giữ nguyên dữ liệu hỏng thay vì làm mất chữ
  }

  for (Codepoint &cp : cps) {
    const Codepoint lower = to_lower(cp);
    const Lookup lk = lookup_vowel(lower);
    if (lk.found && lk.tone != 0) {
      cp = match_case(cp, kRows[lk.row].toned[0]);
    }
  }
  return utf8_encode(cps);
}

std::string remove_diacritics(const std::string &in) {
  std::vector<Codepoint> cps;
  if (!utf8_decode(reinterpret_cast<const uint8_t *>(in.data()), in.size(),
                   cps)) {
    return in;
  }

  for (Codepoint &cp : cps) {
    const Codepoint lower = to_lower(cp);
    if (lower == 0x0111) { // đ
      cp = match_case(cp, 0x0064);
      continue;
    }
    const Lookup lk = lookup_vowel(lower);
    if (lk.found) {
      cp = match_case(cp, kRows[lk.row].plain);
    }
  }
  return utf8_encode(cps);
}

} // namespace vd
