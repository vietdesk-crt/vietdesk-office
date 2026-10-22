// Kiểm thử lõi C++ không phụ thuộc framework: chỉ cần biên dịch rồi chạy.
// Lệnh build xem trong core/README.md (mục "Build nhanh").
#include "vietdesk/core.h"

#include "vietnamese/vietnamese.h"

#include <cstdio>
#include <cstring>
#include <string>

namespace {

int g_failures = 0;
int g_checks = 0;

void expect_eq(const char *label, const std::string &actual,
               const std::string &expected) {
  ++g_checks;
  if (actual != expected) {
    ++g_failures;
    std::printf("FAIL %s\n  mong doi: %s\n  thuc te : %s\n", label,
                expected.c_str(), actual.c_str());
  }
}

void expect_true(const char *label, bool cond) {
  ++g_checks;
  if (!cond) {
    ++g_failures;
    std::printf("FAIL %s\n", label);
  }
}

std::string call_abi(int32_t (*fn)(const uint8_t *, size_t, vd_buf *),
                     const std::string &in) {
  vd_buf buf{};
  const int32_t rc = fn(reinterpret_cast<const uint8_t *>(in.data()), in.size(),
                        &buf);
  std::string result;
  if (rc == VD_OK && buf.ptr != nullptr) {
    result.assign(reinterpret_cast<const char *>(buf.ptr), buf.len);
  }
  vd_buf_free(&buf);
  return result;
}

} // namespace

int main() {
  using vd::compose_nfc;

  // --- compose_nfc: các thứ tự gõ khác nhau phải ra cùng một ký tự ---
  std::string out;
  {
    const std::string input = "e\xCC\x82\xCC\x81"; // e + U+0302 + U+0301
    expect_true("compose hop le", compose_nfc(input, out));
    expect_eq("e^ + sac -> ế", out, "\xE1\xBA\xBF"); // U+1EBF
  }
  {
    const std::string input = "e\xCC\x81\xCC\x82"; // sac truoc, mu sau
    expect_true("compose hop le 2", compose_nfc(input, out));
    // Dấu mũ đến sau dấu sắc: thanh điệu đã áp lên 'e' nên không ghép được mũ.
    // Ghi nhận hành vi hiện tại (giữ nguyên dấu tổ hợp) thay vì làm mất chữ.
    expect_true("khong mat du lieu", out.size() >= 3);
  }
  {
    const std::string input = "Nguye\xCC\x82\xCC\x83n";
    expect_true("compose Nguyễn", compose_nfc(input, out));
    expect_eq("Nguyen~ -> Nguyễn", out,
              "Nguy\xE1\xBB\x85n"); // Nguyễn (U+1EC5)
  }
  {
    const std::string input = "u\xCC\x9B"; // u + U+031B (moc)
    expect_true("compose horn", compose_nfc(input, out));
    expect_eq("u + moc -> ư", out, "\xC6\xB0"); // U+01B0
  }
  {
    const std::string input = "A\xCC\x81"; // A + sac
    expect_true("compose hoa", compose_nfc(input, out));
    expect_eq("A + sac -> Á", out, "\xC3\x81"); // U+00C1
  }
  {
    const std::string bad = "\xFF\xFE";
    expect_true("utf8 hong bi tu choi", !compose_nfc(bad, out));
  }

  // --- strip_tones / remove_diacritics ---
  const std::string viet = "Ti\xE1\xBA\xBFng Vi\xE1\xBB\x87t"; // "Tiếng Việt"
  expect_eq("strip_tones", vd::strip_tones(viet), "Ti\xC3\xAAng Vi\xC3\xAAt");
  expect_eq("remove_diacritics", vd::remove_diacritics(viet), "Tieng Viet");
  expect_eq("remove_diacritics d", vd::remove_diacritics("\xC4\x91"),
            "d"); // đ
  expect_eq("remove_diacritics u co moc",
            vd::remove_diacritics("\xC4\x90\xC6\xB0\xE1\xBB\x9Dng ph\xE1\xBB\x91"),
            "Duong pho"); // Đường phố
  expect_eq("strip_tones hoa", vd::strip_tones("\xE1\xBA\xBE"),
            "\xC3\x8A"); // Ế -> Ê

  // --- C ABI ---
  expect_eq("abi version", vd_core_version(), "0.2.0");
  expect_eq("abi compose", call_abi(vd_vietnamese_compose, "a\xCC\x81"), "\xC3\xA1");
  expect_eq("abi remove_diacritics",
            call_abi(vd_vietnamese_remove_diacritics, viet), "Tieng Viet");

  {
    vd_buf buf{};
    const uint8_t bad[] = {0xFF};
    expect_true("abi utf8 hong -> ma loi",
                vd_vietnamese_compose(bad, 1, &buf) == VD_ERR_INVALID_UTF8);
    expect_true("abi khong cap phat khi loi", buf.ptr == nullptr);
  }
  {
    vd_buf buf{};
    expect_true("abi tham so null",
                vd_vietnamese_compose(nullptr, 0, &buf) == VD_OK);
    vd_buf_free(&buf);
    vd_buf_free(nullptr); // phải an toàn
  }
  {
    vd_charset cs = VD_CHARSET_UNICODE;
    const std::string s = viet;
    expect_true("detect utf8",
                vd_vietnamese_detect_charset(
                    reinterpret_cast<const uint8_t *>(s.data()), s.size(),
                    &cs) == VD_OK &&
                    cs == VD_CHARSET_UNICODE);
    vd_buf buf2{};
    expect_true("convert tcvn3 chua ho tro",
                vd_charset_convert(VD_CHARSET_UNICODE, VD_CHARSET_TCVN3,
                                   reinterpret_cast<const uint8_t *>(s.data()),
                                   s.size(), &buf2) == VD_ERR_UNSUPPORTED);
    vd_buf_free(&buf2);
  }

  std::printf("%d/%d kiem tra dat\n", g_checks - g_failures, g_checks);
  return g_failures == 0 ? 0 : 1;
}
