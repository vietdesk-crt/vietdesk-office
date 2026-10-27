#include "formula/formula.h"

#include <algorithm>
#include <cctype>
#include <charconv>
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <locale>
#include <sstream>
#include <stdexcept>
#include <string>
#include <system_error>
#include <unordered_set>
#include <variant>
#include <vector>

namespace vd::formula {
namespace {

constexpr size_t kMaxFormulaBytes = 8192;
constexpr size_t kMaxTokens = 4096;
constexpr int kMaxDepth = 256;
constexpr size_t kMaxRangeCells = 10000;

class FormulaError : public std::exception {
public:
  explicit FormulaError(std::string message) : message_(std::move(message)) {}
  const char *what() const noexcept override { return message_.c_str(); }
  const std::string &message() const { return message_; }

private:
  std::string message_;
};

bool is_space(char c) {
  return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' ||
         c == '\v';
}

bool is_digit(char c) { return c >= '0' && c <= '9'; }

bool is_alpha(char c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
}

bool is_alnum(char c) { return is_alpha(c) || is_digit(c); }

bool is_upper_alpha(char c) { return c >= 'A' && c <= 'Z'; }

std::string trim_ascii(const std::string &value) {
  size_t begin = 0;
  size_t end = value.size();
  while (begin < end && is_space(value[begin])) {
    ++begin;
  }
  while (end > begin && is_space(value[end - 1])) {
    --end;
  }
  return value.substr(begin, end - begin);
}

std::string to_upper(std::string value) {
  for (char &c : value) {
    if (c >= 'a' && c <= 'z') {
      c = static_cast<char>(c - 'a' + 'A');
    }
  }
  return value;
}

/** Đọc số thực độc lập locale. Trả false nếu không phải số hữu hạn. */
bool parse_double(const std::string &text, double *out) {
  const char *begin = text.data();
  const char *end = begin + text.size();
  double value = 0.0;
  const auto parsed =
      std::from_chars(begin, end, value, std::chars_format::general);
  if (parsed.ec != std::errc() || parsed.ptr != end ||
      !std::isfinite(value)) {
    return false;
  }
  *out = value;
  return true;
}

/** "A1", "AA10" — đúng như regex `^[A-Z]+[0-9]+$` của bản TS. */
bool is_cell_id(const std::string &value) {
  size_t index = 0;
  while (index < value.size() && is_upper_alpha(value[index])) {
    ++index;
  }
  if (index == 0 || index == value.size()) {
    return false;
  }
  for (; index < value.size(); ++index) {
    if (!is_digit(value[index])) {
      return false;
    }
  }
  return true;
}

struct CellRef {
  int row = 0;
  int column = 0;
};

bool parse_cell_ref(const std::string &id, CellRef *out) {
  if (!is_cell_id(id)) {
    return false;
  }
  size_t index = 0;
  long long column = 0;
  while (index < id.size() && is_upper_alpha(id[index])) {
    column = column * 26 + (id[index] - 'A' + 1);
    if (column > 1000000) {
      return false;
    }
    ++index;
  }
  long long row = 0;
  for (; index < id.size(); ++index) {
    row = row * 10 + (id[index] - '0');
    if (row > 1000000) {
      return false;
    }
  }
  out->row = static_cast<int>(row - 1);
  out->column = static_cast<int>(column - 1);
  return true;
}

std::string column_label(int column) {
  std::string label;
  int value = column + 1;
  while (value > 0) {
    const int remainder = (value - 1) % 26;
    label.insert(label.begin(), static_cast<char>('A' + remainder));
    value = (value - 1) / 26;
  }
  return label;
}

std::string cell_id_from(int row, int column) {
  return column_label(column) + std::to_string(row + 1);
}

// --- Lexer ----------------------------------------------------------------

enum class TokenKind { Number, Ref, Op, LParen, RParen, Comma, Colon, Func, Compare };

struct Token {
  explicit Token(TokenKind kind) : kind(kind) {}

  TokenKind kind;
  double number = 0.0;
  char op = 0;
  std::string text; // mã ô hoặc tên hàm
};

void push_token(std::vector<Token> &tokens, Token token) {
  if (tokens.size() >= kMaxTokens) {
    throw FormulaError("Công thức quá dài");
  }
  tokens.push_back(std::move(token));
}

std::vector<Token> tokenize(const std::string &source) {
  std::vector<Token> tokens;
  size_t index = 0;

  while (index < source.size()) {
    const char c = source[index];

    if (is_space(c)) {
      ++index;
      continue;
    }

    if (is_digit(c)) {
      const size_t start = index;
      while (index < source.size() && is_digit(source[index])) {
        ++index;
      }
      // Chỉ nhận phần thập phân khi có ít nhất một chữ số sau dấu chấm,
      // giống regex `\d+(\.\d+)?`.
      if (index + 1 < source.size() && source[index] == '.' &&
          is_digit(source[index + 1])) {
        ++index;
        while (index < source.size() && is_digit(source[index])) {
          ++index;
        }
      }
      Token token{TokenKind::Number};
      if (!parse_double(source.substr(start, index - start), &token.number)) {
        throw FormulaError("Số không hợp lệ");
      }
      push_token(tokens, std::move(token));
      continue;
    }

    if (is_alpha(c) || c == '_') {
      const size_t start = index;
      while (index < source.size() &&
             (is_alnum(source[index]) || source[index] == '_')) {
        ++index;
      }
      const std::string word = source.substr(start, index - start);
      const std::string upper = to_upper(word);

      size_t look = index;
      while (look < source.size() && is_space(source[look])) {
        ++look;
      }
      const bool followed_by_paren =
          look < source.size() && source[look] == '(';

      bool only_letters = !word.empty();
      for (const char letter : word) {
        if (!is_alpha(letter)) {
          only_letters = false;
          break;
        }
      }

      if (followed_by_paren && only_letters) {
        Token token{TokenKind::Func};
        token.text = upper;
        push_token(tokens, std::move(token));
      } else if (is_cell_id(upper)) {
        Token token{TokenKind::Ref};
        token.text = upper;
        push_token(tokens, std::move(token));
      } else {
        throw FormulaError("Không nhận ra \"" + word + "\"");
      }
      continue;
    }

    switch (c) {
    case '+':
    case '-':
    case '*':
    case '/': {
      Token token{TokenKind::Op};
      token.op = c;
      push_token(tokens, std::move(token));
      break;
    }
    case '>':
    case '<':
    case '=': {
      Token token{TokenKind::Compare};
      if (index + 1 < source.size() &&
          (source[index + 1] == '=' || (c == '<' && source[index + 1] == '>'))) {
        token.text = source.substr(index, 2);
        index += 2;
      } else {
        token.text = std::string(1, c);
        index += 1;
      }
      push_token(tokens, std::move(token));
      continue;
    }
    case '(':
      push_token(tokens, Token{TokenKind::LParen});
      break;
    case ')':
      push_token(tokens, Token{TokenKind::RParen});
      break;
    case ',':
      push_token(tokens, Token{TokenKind::Comma});
      break;
    case ':':
      push_token(tokens, Token{TokenKind::Colon});
      break;
    default:
      if (static_cast<unsigned char>(c) >= 0x80) {
        throw FormulaError("Ký tự không hợp lệ");
      }
      throw FormulaError(std::string("Ký tự không hợp lệ \"") + c + "\"");
    }
    ++index;
  }

  return tokens;
}

// --- Evaluator ------------------------------------------------------------

class SheetEngine {
public:
  explicit SheetEngine(
      const std::unordered_map<std::string, std::string> &cells);
  const CellResult &result(const std::string &id);
  double number(const std::string &id);
  std::vector<double> range(const std::string &start_id,
                            const std::string &end_id);

private:
  const std::unordered_map<std::string, std::string> &cells_;
  std::unordered_map<std::string, CellResult> results_;
  std::unordered_set<std::string> visiting_;
};

using Value = std::variant<double, std::vector<double>>;

double scalar(const Value &value) {
  if (const auto *number = std::get_if<double>(&value)) {
    return *number;
  }
  throw FormulaError("Vùng ô chỉ dùng được trong hàm");
}

class Parser {
public:
  Parser(std::vector<Token> tokens, SheetEngine &engine)
      : tokens_(std::move(tokens)), engine_(engine) {}

  double parse() {
    if (tokens_.empty()) {
      throw FormulaError("Công thức rỗng");
    }
    const Value value = comparison(0);
    if (cursor_ < tokens_.size()) {
      throw FormulaError("Công thức thừa ký tự");
    }
    return scalar(value);
  }

  Value comparison(int depth) {
    check_depth(depth);
    Value left = additive(depth);
    while (cursor_ < tokens_.size() &&
           tokens_[cursor_].kind == TokenKind::Compare) {
      const std::string op = tokens_[cursor_++].text;
      const double r = scalar(additive(depth + 1));
      const double l = scalar(left);
      if (op == ">") left = (l > r) ? 1.0 : 0.0;
      else if (op == "<") left = (l < r) ? 1.0 : 0.0;
      else if (op == ">=") left = (l >= r) ? 1.0 : 0.0;
      else if (op == "<=") left = (l <= r) ? 1.0 : 0.0;
      else if (op == "=") left = (std::abs(l - r) < 1e-9) ? 1.0 : 0.0;
      else if (op == "<>") left = (std::abs(l - r) >= 1e-9) ? 1.0 : 0.0;
    }
    return left;
  }

private:
  const Token *peek() const {
    return cursor_ < tokens_.size() ? &tokens_[cursor_] : nullptr;
  }

  static void check_depth(int depth) {
    if (depth > kMaxDepth) {
      throw FormulaError("Công thức quá phức tạp");
    }
  }

  Value additive(int depth) {
    check_depth(depth);
    Value left = multiplicative(depth);
    for (;;) {
      const Token *token = peek();
      if (token == nullptr || token->kind != TokenKind::Op) {
        break;
      }
      if (token->op != '+' && token->op != '-') {
        break;
      }
      ++cursor_;
      const Value right = multiplicative(depth);
      left = token->op == '+' ? scalar(left) + scalar(right)
                              : scalar(left) - scalar(right);
    }
    return left;
  }

  Value multiplicative(int depth) {
    Value left = unary(depth);
    for (;;) {
      const Token *token = peek();
      if (token == nullptr || token->kind != TokenKind::Op) {
        break;
      }
      if (token->op != '*' && token->op != '/') {
        break;
      }
      ++cursor_;
      const Value right = unary(depth);
      const double divisor = scalar(right);
      if (token->op == '/' && divisor == 0.0) {
        throw FormulaError("Chia cho 0");
      }
      left = token->op == '*' ? scalar(left) * divisor : scalar(left) / divisor;
    }
    return left;
  }

  Value unary(int depth) {
    const Token *token = peek();
    if (token != nullptr && token->kind == TokenKind::Op &&
        (token->op == '-' || token->op == '+')) {
      ++cursor_;
      const double value = scalar(unary(depth + 1));
      return token->op == '-' ? -value : value;
    }
    return primary(depth);
  }

  Value primary(int depth) {
    check_depth(depth);
    const Token *token = peek();
    if (token == nullptr) {
      throw FormulaError("Công thức thiếu toán hạng");
    }

    if (token->kind == TokenKind::Number) {
      ++cursor_;
      return token->number;
    }

    if (token->kind == TokenKind::Ref) {
      const std::string id = token->text;
      ++cursor_;
      const Token *next = peek();
      if (next != nullptr && next->kind == TokenKind::Colon) {
        ++cursor_;
        const Token *end = peek();
        if (end == nullptr || end->kind != TokenKind::Ref) {
          throw FormulaError("Vùng ô không hợp lệ");
        }
        const std::string end_id = end->text;
        ++cursor_;
        return engine_.range(id, end_id);
      }
      return engine_.number(id);
    }

    if (token->kind == TokenKind::LParen) {
      ++cursor_;
      const Value value = comparison(depth + 1);
      const Token *close = peek();
      if (close == nullptr || close->kind != TokenKind::RParen) {
        throw FormulaError("Thiếu dấu )");
      }
      ++cursor_;
      return value;
    }

    if (token->kind == TokenKind::Func) {
      const std::string name = token->text;
      ++cursor_;
      const Token *open = peek();
      if (open == nullptr || open->kind != TokenKind::LParen) {
        throw FormulaError("Hàm " + name + " thiếu dấu (");
      }
      ++cursor_;

      std::vector<Value> args;
      const Token *first = peek();
      if (first != nullptr && first->kind != TokenKind::RParen) {
        for (;;) {
          args.push_back(comparison(depth + 1));
          const Token *separator = peek();
          if (separator != nullptr && separator->kind == TokenKind::Comma) {
            ++cursor_;
            continue;
          }
          break;
        }
      }

      const Token *close = peek();
      if (close == nullptr || close->kind != TokenKind::RParen) {
        throw FormulaError("Thiếu dấu )");
      }
      ++cursor_;
      return call_function(name, args);
    }

    throw FormulaError("Công thức không hợp lệ");
  }

  static double call_function(const std::string &name,
                              const std::vector<Value> &args) {
    std::vector<double> numbers;
    for (const Value &arg : args) {
      if (const auto *range = std::get_if<std::vector<double>>(&arg)) {
        numbers.insert(numbers.end(), range->begin(), range->end());
      } else {
        numbers.push_back(std::get<double>(arg));
      }
    }

    if (name == "SUM") {
      double total = 0.0;
      for (const double value : numbers) {
        total += value;
      }
      return total;
    }
    if (name == "MIN") {
      if (numbers.empty()) {
        return 0.0;
      }
      return *std::min_element(numbers.begin(), numbers.end());
    }
    if (name == "MAX") {
      if (numbers.empty()) {
        return 0.0;
      }
      return *std::max_element(numbers.begin(), numbers.end());
    }
    if (name == "AVERAGE") {
      if (numbers.empty()) {
        return 0.0;
      }
      double total = 0.0;
      for (const double value : numbers) {
        total += value;
      }
      return total / static_cast<double>(numbers.size());
    }
    if (name == "COUNT") {
      return static_cast<double>(numbers.size());
    }
    if (name == "PRODUCT") {
      if (numbers.empty()) {
        return 0.0;
      }
      double prod = 1.0;
      for (const double val : numbers) {
        prod *= val;
      }
      return prod;
    }
    if (name == "ABS") {
      if (args.empty()) {
        throw FormulaError("Hàm ABS cần 1 tham số");
      }
      return std::abs(scalar(args[0]));
    }
    if (name == "ROUND") {
      if (args.empty()) {
        throw FormulaError("Hàm ROUND cần ít nhất 1 tham số");
      }
      double val = scalar(args[0]);
      double digits = args.size() >= 2 ? scalar(args[1]) : 0.0;
      double factor = std::pow(10.0, digits);
      return std::round(val * factor) / factor;
    }
    if (name == "INT") {
      if (args.empty()) {
        throw FormulaError("Hàm INT cần 1 tham số");
      }
      return std::floor(scalar(args[0]));
    }
    if (name == "SQRT") {
      if (args.empty()) {
        throw FormulaError("Hàm SQRT cần 1 tham số");
      }
      double val = scalar(args[0]);
      if (val < 0.0) {
        throw FormulaError("Không thể tính căn bậc hai số âm");
      }
      return std::sqrt(val);
    }
    if (name == "POWER") {
      if (args.size() < 2) {
        throw FormulaError("Hàm POWER cần 2 tham số");
      }
      return std::pow(scalar(args[0]), scalar(args[1]));
    }
    if (name == "MOD") {
      if (args.size() < 2) {
        throw FormulaError("Hàm MOD cần 2 tham số: MOD(số, số_chia)");
      }
      double divisor = scalar(args[1]);
      if (divisor == 0.0) {
        throw FormulaError("Chia cho 0");
      }
      return std::fmod(scalar(args[0]), divisor);
    }
    if (name == "IF") {
      if (args.size() < 2) {
        throw FormulaError("Hàm IF cần ít nhất 2 tham số: IF(điều_kiện, đúng, [sai])");
      }
      double cond = scalar(args[0]);
      if (cond != 0.0) {
        return scalar(args[1]);
      }
      return args.size() >= 3 ? scalar(args[2]) : 0.0;
    }
    throw FormulaError("Chưa hỗ trợ hàm " + name + "()");
  }

  std::vector<Token> tokens_;
  SheetEngine &engine_;
  size_t cursor_ = 0;
};

SheetEngine::SheetEngine(
    const std::unordered_map<std::string, std::string> &cells)
    : cells_(cells) {}

const CellResult &SheetEngine::result(const std::string &id) {
  const auto cached = results_.find(id);
  if (cached != results_.end()) {
    return cached->second;
  }

  const auto source = cells_.find(id);
  const std::string raw =
      source == cells_.end() ? std::string() : trim_ascii(source->second);

  if (raw.empty()) {
    return results_.emplace(id, CellResult{}).first->second;
  }

  if (raw[0] != '=') {
    CellResult value;
    value.display = raw;
    double number = 0.0;
    if (parse_number(raw, &number)) {
      value.has_numeric = true;
      value.numeric = number;
    }
    return results_.emplace(id, std::move(value)).first->second;
  }

  if (visiting_.count(id) > 0) {
    throw FormulaError("Tham chiếu vòng");
  }

  visiting_.insert(id);
  CellResult value;
  try {
    const std::string expression = raw.substr(1);
    if (expression.size() > kMaxFormulaBytes) {
      throw FormulaError("Công thức quá dài");
    }
    Parser parser(tokenize(expression), *this);
    const double number = parser.parse();
    value.display = format_number(number);
    value.has_numeric = true;
    value.numeric = number;
  } catch (const FormulaError &error) {
    value.display = "#LỖI";
    value.has_error = true;
    value.error = error.message();
  } catch (...) {
    value.display = "#LỖI";
    value.has_error = true;
    value.error = "Công thức không hợp lệ";
  }
  visiting_.erase(id);

  return results_.emplace(id, std::move(value)).first->second;
}

double SheetEngine::number(const std::string &id) {
  const CellResult &value = result(id);
  if (value.has_error) {
    throw FormulaError(value.error);
  }
  if (!value.has_numeric) {
    throw FormulaError("Ô " + id + " không chứa số");
  }
  return value.numeric;
}

std::vector<double> SheetEngine::range(const std::string &start_id,
                                     const std::string &end_id) {
  CellRef start;
  CellRef end;
  if (!parse_cell_ref(start_id, &start) ||
      !parse_cell_ref(end_id, &end)) {
    throw FormulaError("Vùng ô không hợp lệ");
  }

  const int top = std::min(start.row, end.row);
  const int bottom = std::max(start.row, end.row);
  const int left = std::min(start.column, end.column);
  const int right = std::max(start.column, end.column);

  const size_t width = static_cast<size_t>(right - left + 1);
  const size_t height = static_cast<size_t>(bottom - top + 1);
  if (width * height > kMaxRangeCells) {
    throw FormulaError("Vùng ô quá lớn");
  }

  std::vector<double> values;
  for (int row = top; row <= bottom; ++row) {
    for (int column = left; column <= right; ++column) {
      const CellResult &cell = result(cell_id_from(row, column));
      if (cell.has_error) {
        throw FormulaError(cell.error);
      }
      if (cell.has_numeric) {
        values.push_back(cell.numeric);
      }
    }
  }
  return values;
}

} // namespace

bool parse_number(const std::string &raw, double *out) {
  if (out == nullptr) {
    return false;
  }

  std::string compact;
  compact.reserve(raw.size());
  for (const char c : raw) {
    if (!is_space(c)) {
      compact.push_back(c);
    }
  }
  if (compact.empty()) {
    return false;
  }

  size_t index = 0;
  if (compact[index] == '-') {
    ++index;
  }
  if (index >= compact.size() || !is_digit(compact[index])) {
    return false;
  }

  const size_t integer_start = index;
  while (index < compact.size() && is_digit(compact[index])) {
    ++index;
  }
  const size_t integer_digits = index - integer_start;

  const auto all_digits = [&compact](size_t from) {
    if (from >= compact.size()) {
      return false;
    }
    for (size_t i = from; i < compact.size(); ++i) {
      if (!is_digit(compact[i])) {
        return false;
      }
    }
    return true;
  };

  // Dạng 1: 1-3 chữ số, rồi các nhóm ".ddd" (phân cách nghìn), tuỳ chọn ",fff".
  if (integer_digits <= 3 && index < compact.size() &&
      compact[index] == '.') {
    size_t cursor = index;
    size_t groups = 0;
    bool valid = true;
    while (cursor < compact.size() && compact[cursor] == '.') {
      if (cursor + 4 > compact.size() ||
          !is_digit(compact[cursor + 1]) || !is_digit(compact[cursor + 2]) ||
          !is_digit(compact[cursor + 3])) {
        valid = false;
        break;
      }
      cursor += 4;
      ++groups;
    }
    if (valid && groups > 0) {
      if (cursor == compact.size()) {
        std::string normalized = compact;
        normalized.erase(
            std::remove(normalized.begin(), normalized.end(), '.'),
            normalized.end());
        return parse_double(normalized, out);
      }
      if (compact[cursor] == ',' && all_digits(cursor + 1)) {
        std::string normalized = compact;
        normalized.erase(
            std::remove(normalized.begin(), normalized.end(), '.'),
            normalized.end());
        const size_t comma = normalized.find(',');
        normalized[comma] = '.';
        return parse_double(normalized, out);
      }
    }
  }

  // Dạng 2: số nguyên + dấu phẩy thập phân.
  if (index < compact.size() && compact[index] == ',' &&
      all_digits(index + 1)) {
    std::string normalized = compact;
    normalized[index] = '.';
    return parse_double(normalized, out);
  }

  // Dạng 3: số thập phân dùng dấu chấm, hoặc số nguyên thuần.
  if (index == compact.size()) {
    return parse_double(compact, out);
  }
  if (compact[index] == '.' && all_digits(index + 1)) {
    return parse_double(compact, out);
  }

  return false;
}

std::string format_number(double value) {
  if (std::isnan(value)) {
    return "NaN";
  }
  if (std::isinf(value)) {
    return value < 0 ? "-∞" : "∞";
  }

  std::ostringstream stream;
  stream.imbue(std::locale::classic());
  stream << std::fixed << std::setprecision(6) << value;
  std::string raw = stream.str();

  const size_t dot = raw.find('.');
  std::string integer = dot == std::string::npos ? raw : raw.substr(0, dot);
  std::string fraction =
      dot == std::string::npos ? std::string() : raw.substr(dot + 1);

  while (!fraction.empty() && fraction.back() == '0') {
    fraction.pop_back();
  }

  bool negative = false;
  if (!integer.empty() && integer[0] == '-') {
    negative = true;
    integer.erase(integer.begin());
  }

  std::string grouped;
  grouped.reserve(integer.size() + integer.size() / 3);
  for (size_t i = 0; i < integer.size(); ++i) {
    if (i > 0 && (integer.size() - i) % 3 == 0) {
      grouped.push_back('.');
    }
    grouped.push_back(integer[i]);
  }

  std::string result;
  if (negative) {
    result.push_back('-');
  }
  result += grouped;
  if (!fraction.empty()) {
    result.push_back(',');
    result += fraction;
  }
  return result;
}

std::unordered_map<std::string, CellResult>
compute(const std::vector<std::pair<std::string, std::string>> &cells) {
  std::unordered_map<std::string, std::string> lookup;
  lookup.reserve(cells.size());
  for (const auto &[id, raw] : cells) {
    lookup.emplace(id, raw);
  }

  SheetEngine engine(lookup);
  std::unordered_map<std::string, CellResult> results;
  results.reserve(cells.size());
  for (const auto &[id, raw] : cells) {
    (void)raw;
    results.emplace(id, engine.result(id));
  }
  return results;
}

} // namespace vd::formula
