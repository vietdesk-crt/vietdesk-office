// Kiểm thử engine công thức C++ và lớp C ABI.
// Chạy: npm run test:core (hoặc ctest trong native/core/build).
#include "vietdesk/core.h"

#include "formula/formula.h"

#include <cmath>
#include <cstdio>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace {

int g_failures = 0;
int g_checks = 0;

using Cells = std::vector<std::pair<std::string, std::string>>;
using Sheet = std::unordered_map<std::string, vd::formula::CellResult>;

void expect_true(const char *label, bool condition) {
  ++g_checks;
  if (!condition) {
    ++g_failures;
    std::printf("FAIL %s\n", label);
  }
}

void expect_eq(const char *label, const std::string &actual,
               const std::string &expected) {
  ++g_checks;
  if (actual != expected) {
    ++g_failures;
    std::printf("FAIL %s\n  mong doi: %s\n  thuc te : %s\n", label,
                expected.c_str(), actual.c_str());
  }
}

void expect_near(const char *label, double actual, double expected) {
  ++g_checks;
  if (!(std::fabs(actual - expected) < 1e-9)) {
    ++g_failures;
    std::printf("FAIL %s\n  mong doi: %.12g\n  thuc te : %.12g\n", label,
                expected, actual);
  }
}

Sheet run(const Cells &cells) { return vd::formula::compute(cells); }

const vd::formula::CellResult *find_cell(const Sheet &sheet,
                                         const std::string &id) {
  const auto found = sheet.find(id);
  return found == sheet.end() ? nullptr : &found->second;
}

void expect_number(const char *label, const Sheet &sheet,
                   const std::string &id, double expected) {
  const vd::formula::CellResult *cell = find_cell(sheet, id);
  expect_true(label, cell != nullptr);
  if (cell == nullptr) {
    return;
  }
  expect_true((std::string(label) + " (có số)").c_str(), cell->has_numeric);
  expect_near(label, cell->numeric, expected);
}

void expect_display(const char *label, const Sheet &sheet,
                    const std::string &id, const std::string &expected) {
  const vd::formula::CellResult *cell = find_cell(sheet, id);
  expect_true(label, cell != nullptr);
  if (cell != nullptr) {
    expect_eq(label, cell->display, expected);
  }
}

void expect_error(const char *label, const Sheet &sheet, const std::string &id,
                  const std::string &expected) {
  const vd::formula::CellResult *cell = find_cell(sheet, id);
  expect_true(label, cell != nullptr);
  if (cell != nullptr) {
    expect_true((std::string(label) + " (có lỗi)").c_str(), cell->has_error);
    expect_eq(label, cell->error, expected);
  }
}

void expect_error_contains(const char *label, const Sheet &sheet,
                           const std::string &id, const std::string &needle) {
  const vd::formula::CellResult *cell = find_cell(sheet, id);
  expect_true(label, cell != nullptr);
  if (cell != nullptr) {
    expect_true((std::string(label) + " (có lỗi)").c_str(), cell->has_error);
    expect_true(label, cell->error.find(needle) != std::string::npos);
  }
}

struct AbiSheet {
  vd_sheet_result value{};
  AbiSheet() = default;
  AbiSheet(const AbiSheet &) = delete;
  AbiSheet &operator=(const AbiSheet &) = delete;
  ~AbiSheet() { vd_sheet_result_free(&value); }
};

int32_t compute_abi(const Cells &cells, vd_sheet_result *out) {
  std::vector<vd_cell_input> inputs;
  inputs.reserve(cells.size());
  for (const auto &[id, raw] : cells) {
    vd_cell_input input{};
    input.id = reinterpret_cast<const uint8_t *>(id.data());
    input.id_len = id.size();
    input.raw = reinterpret_cast<const uint8_t *>(raw.data());
    input.raw_len = raw.size();
    inputs.push_back(input);
  }
  return vd_formula_compute(inputs.empty() ? nullptr : inputs.data(),
                            inputs.size(), out);
}

const vd_cell_result *find_abi_cell(const vd_sheet_result &sheet,
                                    const std::string &id) {
  for (size_t i = 0; i < sheet.len; ++i) {
    const vd_cell_result &cell = sheet.cells[i];
    if (std::string(reinterpret_cast<const char *>(cell.id), cell.id_len) ==
        id) {
      return &cell;
    }
  }
  return nullptr;
}

std::string abi_string(const uint8_t *data, size_t len) {
  return data == nullptr ? std::string()
                         : std::string(reinterpret_cast<const char *>(data),
                                       len);
}

void test_parse_number() {
  double value = 0.0;
  expect_true("parse 42", vd::formula::parse_number("42", &value));
  expect_near("parse 42 value", value, 42.0);

  expect_true("parse -3.5", vd::formula::parse_number("-3.5", &value));
  expect_near("parse -3.5 value", value, -3.5);

  expect_true("parse 1.234.567",
              vd::formula::parse_number("1.234.567", &value));
  expect_near("parse 1.234.567 value", value, 1234567.0);

  expect_true("parse 12,5", vd::formula::parse_number("12,5", &value));
  expect_near("parse 12,5 value", value, 12.5);

  expect_true("parse 1.234,56",
              vd::formula::parse_number("1.234,56", &value));
  expect_near("parse 1.234,56 value", value, 1234.56);

  expect_true("parse 1.234", vd::formula::parse_number("1.234", &value));
  expect_near("parse 1.234 value", value, 1234.0);

  expect_true("parse 1.2345", vd::formula::parse_number("1.2345", &value));
  expect_near("parse 1.2345 value", value, 1.2345);

  expect_true("parse 1 234,5", vd::formula::parse_number("1 234,5", &value));
  expect_near("parse 1 234,5 value", value, 1234.5);

  expect_true("reject abc", !vd::formula::parse_number("abc", &value));
  expect_true("reject empty", !vd::formula::parse_number("", &value));
  expect_true("reject 12a", !vd::formula::parse_number("12a", &value));
  expect_true("reject 1.234.56",
              !vd::formula::parse_number("1.234.56", &value));
  expect_true("reject 1e3", !vd::formula::parse_number("1e3", &value));
  expect_true("reject +1", !vd::formula::parse_number("+1", &value));

  const std::string huge(400, '9');
  expect_true("reject huge (infinity)",
              !vd::formula::parse_number(huge, &value));
}

void test_format_number() {
  expect_eq("format 1234.5", vd::formula::format_number(1234.5), "1.234,5");
  expect_eq("format 1234567", vd::formula::format_number(1234567.0),
            "1.234.567");
  expect_eq("format -1234.5", vd::formula::format_number(-1234.5),
            "-1.234,5");
  expect_eq("format 0", vd::formula::format_number(0.0), "0");
  expect_eq("format -0", vd::formula::format_number(-0.0), "-0");
  expect_eq("format 0.000001", vd::formula::format_number(0.000001),
            "0,000001");
  expect_eq("format 2", vd::formula::format_number(2.0), "2");
  expect_eq("format 1.2345678", vd::formula::format_number(1.2345678),
            "1,234568");
  expect_eq("format 1000000", vd::formula::format_number(1000000.0),
            "1.000.000");
  expect_eq("format lam tron len", vd::formula::format_number(999.9999999),
            "1.000");
  expect_eq("format nhieu chu so",
            vd::formula::format_number(123456789.123456789),
            "123.456.789,123457");
  expect_eq("format rat nho", vd::formula::format_number(1e-7), "0");
  expect_eq("format 1e21", vd::formula::format_number(1e21),
            "1.000.000.000.000.000.000.000");
}

void test_arithmetic() {
  Sheet sheet = run({{"A1", "=1+2*3"}});
  expect_number("uu tien *", sheet, "A1", 7.0);
  expect_display("uu tien hien thi", sheet, "A1", "7");

  sheet = run({{"A1", "=(1+2)*3"}});
  expect_number("ngoac", sheet, "A1", 9.0);

  sheet = run({{"A1", "=-4+1"}});
  expect_number("dau am", sheet, "A1", -3.0);

  sheet = run({{"A1", "=2*-3"}});
  expect_number("nhan so am", sheet, "A1", -6.0);

  sheet = run({{"A1", "=+2"}});
  expect_number("dau duong", sheet, "A1", 2.0);

  sheet = run({{"A1", "=1/4"}});
  expect_display("chia le", sheet, "A1", "0,25");
}

void test_references_and_functions() {
  Sheet sheet = run({{"A1", "10"}, {"B1", "5"}, {"C1", "=A1+B1"}});
  expect_number("tham chieu", sheet, "C1", 15.0);
  expect_display("tham chieu hien thi", sheet, "C1", "15");

  sheet = run({{"A1", "1"},
               {"A2", "2"},
               {"A3", "3"},
               {"B1", "=SUM(A1:A3)"},
               {"B2", "=AVERAGE(A1:A3)"},
               {"B3", "=MAX(A1:A3)"},
               {"B4", "=MIN(A1:A3)"}});
  expect_number("SUM", sheet, "B1", 6.0);
  expect_number("AVERAGE", sheet, "B2", 2.0);
  expect_number("MAX", sheet, "B3", 3.0);
  expect_number("MIN", sheet, "B4", 1.0);

  sheet = run({{"A1", "2"},
               {"A2", "ghi chú"},
               {"A3", "4"},
               {"B1", "=SUM(A1:A3)"}});
  expect_number("bo qua chu/trong", sheet, "B1", 6.0);

  sheet = run({{"A1", "1"}, {"A2", "2"}, {"B1", "=SUM(A1:A2, 10)"}});
  expect_number("SUM tron vung va so", sheet, "B1", 13.0);

  sheet = run({{"A1", "=SUM(A1:A1)"}});
  expect_error("tu tham chieu vung", sheet, "A1", "Tham chiếu vòng");

  sheet = run({{"A1", "1"}, {"B1", "=SUM(A1:A3)"}});
  expect_number("vung vuot du lieu", sheet, "B1", 1.0);
}

void test_errors() {
  Sheet sheet = run({{"A1", "=B1"}, {"B1", "=A1"}});
  expect_error("vong A1", sheet, "A1", "Tham chiếu vòng");
  expect_error("vong B1", sheet, "B1", "Tham chiếu vòng");

  sheet = run({{"A1", "=1/0"}});
  expect_error("chia 0", sheet, "A1", "Chia cho 0");
  expect_display("chia 0 hien thi", sheet, "A1", "#LỖI");
  expect_true("chia 0 khong co so", !find_cell(sheet, "A1")->has_numeric);

  sheet = run({{"A1", "=1/0"}, {"A2", "=A1+1"}});
  expect_error("lan truyen loi", sheet, "A2", "Chia cho 0");

  sheet = run({{"A1", "xin chào"}, {"A2", "=A1+1"}});
  expect_error_contains("tham chieu chu", sheet, "A2", "không chứa số");

  sheet = run({{"A1", "=1+"}});
  expect_error("thieu toan hang", sheet, "A1", "Công thức thiếu toán hạng");

  sheet = run({{"A1", "=1 2"}});
  expect_error("thua ky tu", sheet, "A1", "Công thức thừa ký tự");

  sheet = run({{"A1", "=FOO(1)"}});
  expect_error_contains("ham chua ho tro", sheet, "A1", "Chưa hỗ trợ");

  sheet = run({{"A1", "=FOO"}});
  expect_error_contains("ten la", sheet, "A1", "Không nhận ra");

  sheet = run({{"A1", "=1$"}});
  expect_error_contains("ky tu la", sheet, "A1", "Ký tự không hợp lệ");

  sheet = run({{"A1", "="}});
  expect_error("cong thuc rong", sheet, "A1", "Công thức rỗng");

  sheet = run({{"A1", "=SUM(A1:ZZZ1000)"}});
  expect_error("vung qua lon", sheet, "A1", "Vùng ô quá lớn");

  sheet = run({{"A1", "=1"}, {"B1", "=SUM(A1:A2)+1"}});
  expect_number("vung trong", sheet, "B1", 2.0);
}

void test_cells_preserved() {
  Sheet sheet = run({{"A1", "Doanh thu"},
                     {"A2", "1.234,56"},
                     {"A3", "  "},
                     {"A4", "Tiếng Việt"}});
  expect_display("van ban", sheet, "A1", "Doanh thu");
  expect_true("van ban khong co so", !find_cell(sheet, "A1")->has_numeric);

  expect_display("so giu nguyen chuoi", sheet, "A2", "1.234,56");
  expect_number("so doc theo vi-VN", sheet, "A2", 1234.56);

  expect_display("o trong", sheet, "A3", "");
  expect_true("o trong khong co so", !find_cell(sheet, "A3")->has_numeric);

  expect_display("tieng Viet", sheet, "A4", "Tiếng Việt");
}

void test_depth_limit() {
  const std::string formula =
      "=" + std::string(400, '(') + "1" + std::string(400, ')');
  Sheet sheet = run({{"A1", formula}});
  expect_error("gioi han do sau", sheet, "A1", "Công thức quá phức tạp");
}

void test_abi() {
  Cells cells = {{"A1", "10"}, {"B1", "5"}, {"C1", "=A1+B1"}};
  AbiSheet sheet;
  const int32_t rc = compute_abi(cells, &sheet.value);
  expect_true("abi rc", rc == VD_OK);
  expect_true("abi len", sheet.value.len == 3);

  const vd_cell_result *c1 = find_abi_cell(sheet.value, "C1");
  expect_true("abi C1", c1 != nullptr);
  if (c1 != nullptr) {
    expect_true("abi C1 co so", c1->has_numeric == 1);
    expect_near("abi C1 so", c1->numeric, 15.0);
    expect_eq("abi C1 hien thi", abi_string(c1->display, c1->display_len),
              "15");
    expect_true("abi C1 khong loi", c1->error == nullptr);
  }

  const vd_cell_result *a1 = find_abi_cell(sheet.value, "A1");
  expect_true("abi A1", a1 != nullptr);
  if (a1 != nullptr) {
    expect_eq("abi A1 hien thi", abi_string(a1->display, a1->display_len),
              "10");
    expect_true("abi A1 khong loi", a1->error == nullptr);
  }

  // Thứ tự đầu vào được giữ nguyên.
  if (sheet.value.len == 3) {
    expect_eq("abi thu tu 0",
              abi_string(sheet.value.cells[0].id, sheet.value.cells[0].id_len),
              "A1");
    expect_eq("abi thu tu 2",
              abi_string(sheet.value.cells[2].id, sheet.value.cells[2].id_len),
              "C1");
  }

  // Lỗi cấp ô: display #LỖI + thông điệp, không phải lỗi lời gọi.
  AbiSheet failed;
  const int32_t failed_rc = compute_abi({{"A1", "=1/0"}}, &failed.value);
  expect_true("abi loi o rc", failed_rc == VD_OK);
  expect_true("abi loi o len", failed.value.len == 1);
  if (failed.value.len == 1) {
    const vd_cell_result &cell = failed.value.cells[0];
    expect_eq("abi loi o hien thi",
              abi_string(cell.display, cell.display_len), "#LỖI");
    expect_true("abi loi o khong so", cell.has_numeric == 0);
    expect_eq("abi loi o thong diep", abi_string(cell.error, cell.error_len),
              "Chia cho 0");
  }

  // Văn bản tiếng Việt đi qua ABI nguyên vẹn.
  AbiSheet text;
  expect_true("abi van ban rc",
              compute_abi({{"A1", "Tiếng Việt"}}, &text.value) == VD_OK);
  if (text.value.len == 1) {
    expect_eq("abi van ban",
              abi_string(text.value.cells[0].display,
                         text.value.cells[0].display_len),
              "Tiếng Việt");
  }

  // Tham số không hợp lệ.
  expect_true("abi out null", vd_formula_compute(nullptr, 0, nullptr) ==
                                  VD_ERR_INVALID_ARG);
  expect_true("abi cells null",
              vd_formula_compute(nullptr, 1, &sheet.value) ==
                  VD_ERR_INVALID_ARG);
  expect_true("abi out duoc zero",
              sheet.value.cells == nullptr && sheet.value.len == 0);

  // UTF-8 hỏng bị từ chối ở mức lời gọi.
  const uint8_t bad[] = {0xFF};
  vd_cell_input bad_input{};
  bad_input.id = reinterpret_cast<const uint8_t *>("A1");
  bad_input.id_len = 2;
  bad_input.raw = bad;
  bad_input.raw_len = 1;
  vd_sheet_result bad_out{};
  expect_true("abi utf8 hong", vd_formula_compute(&bad_input, 1, &bad_out) ==
                                   VD_ERR_INVALID_UTF8);
  expect_true("abi utf8 hong zero",
              bad_out.cells == nullptr && bad_out.len == 0);

  // Bảng rỗng và free lặp lại không crash.
  vd_sheet_result empty{};
  expect_true("abi rong", vd_formula_compute(nullptr, 0, &empty) == VD_OK);
  expect_true("abi rong len", empty.len == 0);
  vd_sheet_result_free(&empty);
  vd_sheet_result_free(&empty);
  vd_sheet_result_free(nullptr);
}

} // namespace

int main() {
  test_parse_number();
  test_format_number();
  test_arithmetic();
  test_references_and_functions();
  test_errors();
  test_cells_preserved();
  test_depth_limit();
  test_abi();

  if (g_failures != 0) {
    std::printf("%d/%d kiểm tra thất bại\n", g_failures, g_checks);
    return 1;
  }
  std::printf("OK: %d kiểm tra công thức\n", g_checks);
  return 0;
}
