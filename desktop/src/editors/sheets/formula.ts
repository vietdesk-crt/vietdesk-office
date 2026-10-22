/**
 * Engine công thức tham chiếu (TypeScript) và fallback cho bản chạy web.
 *
 * Bản chính thức chạy trong lõi C++ tại `native/core/src/formula/` và được
 * gọi qua IPC trong bản desktop. Bản TS này được giữ để:
 *   1. Làm oracle đối chiếu khi sửa engine C++.
 *   2. Cho `npm run dev` trong trình duyệt vẫn tính được công thức.
 *
 * Hỗ trợ: + - * / ( ), tham chiếu ô, vùng ô, SUM / MIN / MAX / AVERAGE.
 */

import type { CellMap } from "./model";

export type { CellMap } from "./model";

export interface CellResult {
  /** Chuỗi hiển thị trong ô (đã định dạng theo vi-VN). */
  display: string;
  /** Giá trị số, hoặc null nếu ô là chữ/rỗng/lỗi. */
  numeric: number | null;
  /** Thông điệp lỗi nếu công thức không hợp lệ. */
  error?: string;
}

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaError";
  }
}

type Value = number | number[];

type Token =
  | { kind: "number"; value: number }
  | { kind: "ref"; id: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" }
  | { kind: "colon" }
  | { kind: "func"; name: string };

const CELL_ID = /^([A-Z]+)([0-9]+)$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;
const NUMBER_LITERAL = /^\d+(?:\.\d+)?/;

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnLabel(column: number): string {
  let value = column + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

/** "A" → 0, "AA" → 26. */
export function columnIndex(label: string): number {
  let value = 0;
  for (const char of label.toUpperCase()) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value - 1;
}

/** Toạ độ 0-based → mã ô kiểu Excel. */
export function cellId(row: number, column: number): string {
  return `${columnLabel(column)}${row + 1}`;
}

/**
 * Đọc số theo quy ước Việt Nam:
 *  - "1.234.567"  → 1234567 (dấu chấm phân cách nghìn)
 *  - "12,5"       → 12.5    (dấu phẩy thập phân)
 *  - "1.234,56"   → 1234.56
 * Trả null nếu không phải số.
 */
export function parseNumber(raw: string): number | null {
  const compact = raw.trim().replace(/\s/g, "");
  if (!compact) {
    return null;
  }
  let normalized = compact;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+,\d+$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Định dạng số theo vi-VN, tối đa 6 chữ số thập phân. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 6,
  }).format(value);
}

function scalar(value: Value): number {
  if (Array.isArray(value)) {
    throw new FormulaError("Vùng ô chỉ dùng được trong hàm");
  }
  return value;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const rest = source.slice(index);
    const char = rest[0] as string;

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const numberMatch = NUMBER_LITERAL.exec(rest);
    if (numberMatch) {
      tokens.push({ kind: "number", value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = IDENTIFIER.exec(rest);
    if (identifierMatch) {
      const word = identifierMatch[0];
      const upper = word.toUpperCase();
      const following = rest.slice(word.length).trimStart();
      index += word.length;
      if (following.startsWith("(") && /^[A-Za-z]+$/.test(word)) {
        tokens.push({ kind: "func", name: upper });
      } else if (CELL_ID.test(upper)) {
        tokens.push({ kind: "ref", id: upper });
      } else {
        throw new FormulaError(`Không nhận ra "${word}"`);
      }
      continue;
    }

    switch (char) {
      case "+":
      case "-":
      case "*":
      case "/":
        tokens.push({ kind: "op", value: char });
        break;
      case "(":
        tokens.push({ kind: "lparen" });
        break;
      case ")":
        tokens.push({ kind: "rparen" });
        break;
      case ",":
        tokens.push({ kind: "comma" });
        break;
      case ":":
        tokens.push({ kind: "colon" });
        break;
      default:
        throw new FormulaError(`Ký tự không hợp lệ "${char}"`);
    }
    index += 1;
  }

  return tokens;
}

function callFunction(name: string, args: Value[]): number {
  const numbers = args.flatMap((arg) => (Array.isArray(arg) ? arg : [arg]));
  switch (name) {
    case "SUM":
      return numbers.reduce((total, value) => total + value, 0);
    case "MIN":
      return numbers.length === 0 ? 0 : Math.min(...numbers);
    case "MAX":
      return numbers.length === 0 ? 0 : Math.max(...numbers);
    case "AVERAGE":
      return numbers.length === 0
        ? 0
        : numbers.reduce((total, value) => total + value, 0) / numbers.length;
    default:
      throw new FormulaError(`Chưa hỗ trợ hàm ${name}()`);
  }
}

class SheetEngine {
  private readonly results: Record<string, CellResult> = {};
  private readonly visiting = new Set<string>();

  constructor(private readonly cells: CellMap) {}

  result(id: string): CellResult {
    const cached = this.results[id];
    if (cached) {
      return cached;
    }

    const raw = (this.cells[id] ?? "").trim();
    if (!raw) {
      const empty: CellResult = { display: "", numeric: null };
      this.results[id] = empty;
      return empty;
    }

    if (!raw.startsWith("=")) {
      const numeric = parseNumber(raw);
      const text: CellResult =
        numeric === null
          ? { display: raw, numeric: null }
          : { display: raw, numeric };
      this.results[id] = text;
      return text;
    }

    if (this.visiting.has(id)) {
      throw new FormulaError("Tham chiếu vòng");
    }

    this.visiting.add(id);
    try {
      const value = new Parser(tokenize(raw.slice(1)), this).parse();
      const result: CellResult = {
        display: formatNumber(value),
        numeric: value,
      };
      this.results[id] = result;
      return result;
    } catch (cause) {
      const message =
        cause instanceof FormulaError ? cause.message : "Công thức không hợp lệ";
      const failed: CellResult = { display: "#LỖI", numeric: null, error: message };
      this.results[id] = failed;
      return failed;
    } finally {
      this.visiting.delete(id);
    }
  }

  number(id: string): number {
    const result = this.result(id);
    if (result.error) {
      throw new FormulaError(result.error);
    }
    if (result.numeric === null) {
      throw new FormulaError(`Ô ${id} không chứa số`);
    }
    return result.numeric;
  }

  range(startId: string, endId: string): number[] {
    const start = CELL_ID.exec(startId);
    const end = CELL_ID.exec(endId);
    if (!start || !end) {
      throw new FormulaError("Vùng ô không hợp lệ");
    }
    const startRow = Number(start[2]) - 1;
    const endRow = Number(end[2]) - 1;
    const startCol = columnIndex(start[1] as string);
    const endCol = columnIndex(end[1] as string);
    const top = Math.min(startRow, endRow);
    const bottom = Math.max(startRow, endRow);
    const left = Math.min(startCol, endCol);
    const right = Math.max(startCol, endCol);

    if ((bottom - top + 1) * (right - left + 1) > 10_000) {
      throw new FormulaError("Vùng ô quá lớn");
    }

    const values: number[] = [];
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        const cell = this.result(cellId(row, column));
        if (cell.error) {
          throw new FormulaError(cell.error);
        }
        if (cell.numeric !== null) {
          values.push(cell.numeric);
        }
      }
    }
    return values;
  }
}

class Parser {
  private cursor = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly engine: SheetEngine,
  ) {}

  parse(): number {
    if (this.tokens.length === 0) {
      throw new FormulaError("Công thức rỗng");
    }
    const value = this.additive();
    if (this.cursor < this.tokens.length) {
      throw new FormulaError("Công thức thừa ký tự");
    }
    return scalar(value);
  }

  private peek(): Token | undefined {
    return this.tokens[this.cursor];
  }

  private additive(): Value {
    let left = this.multiplicative();
    for (;;) {
      const token = this.peek();
      if (!token || token.kind !== "op") {
        break;
      }
      if (token.value !== "+" && token.value !== "-") {
        break;
      }
      this.cursor += 1;
      const right = this.multiplicative();
      left =
        token.value === "+"
          ? scalar(left) + scalar(right)
          : scalar(left) - scalar(right);
    }
    return left;
  }

  private multiplicative(): Value {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      if (!token || token.kind !== "op") {
        break;
      }
      if (token.value !== "*" && token.value !== "/") {
        break;
      }
      this.cursor += 1;
      const right = this.unary();
      const divisor = scalar(right);
      if (token.value === "/" && divisor === 0) {
        throw new FormulaError("Chia cho 0");
      }
      left =
        token.value === "*" ? scalar(left) * divisor : scalar(left) / divisor;
    }
    return left;
  }

  private unary(): Value {
    const token = this.peek();
    if (token && token.kind === "op" && (token.value === "-" || token.value === "+")) {
      this.cursor += 1;
      const value = scalar(this.unary());
      return token.value === "-" ? -value : value;
    }
    return this.primary();
  }

  private primary(): Value {
    const token = this.peek();
    if (!token) {
      throw new FormulaError("Công thức thiếu toán hạng");
    }

    if (token.kind === "number") {
      this.cursor += 1;
      return token.value;
    }

    if (token.kind === "ref") {
      this.cursor += 1;
      const next = this.peek();
      if (next && next.kind === "colon") {
        this.cursor += 1;
        const end = this.peek();
        if (!end || end.kind !== "ref") {
          throw new FormulaError("Vùng ô không hợp lệ");
        }
        this.cursor += 1;
        return this.engine.range(token.id, end.id);
      }
      return this.engine.number(token.id);
    }

    if (token.kind === "lparen") {
      this.cursor += 1;
      const value = this.additive();
      const close = this.peek();
      if (!close || close.kind !== "rparen") {
        throw new FormulaError("Thiếu dấu )");
      }
      this.cursor += 1;
      return value;
    }

    if (token.kind === "func") {
      this.cursor += 1;
      const open = this.peek();
      if (!open || open.kind !== "lparen") {
        throw new FormulaError(`Hàm ${token.name} thiếu dấu (`);
      }
      this.cursor += 1;

      const args: Value[] = [];
      const first = this.peek();
      if (!first || first.kind !== "rparen") {
        for (;;) {
          args.push(this.additive());
          const separator = this.peek();
          if (separator && separator.kind === "comma") {
            this.cursor += 1;
            continue;
          }
          break;
        }
      }

      const close = this.peek();
      if (!close || close.kind !== "rparen") {
        throw new FormulaError("Thiếu dấu )");
      }
      this.cursor += 1;
      return callFunction(token.name, args);
    }

    throw new FormulaError("Công thức không hợp lệ");
  }
}

/** Tính toàn bộ bảng: mỗi ô trong `cells` được trả về một kết quả. */
export function computeSheet(cells: CellMap): Record<string, CellResult> {
  const engine = new SheetEngine(cells);
  const results: Record<string, CellResult> = {};
  for (const id of Object.keys(cells)) {
    results[id] = engine.result(id);
  }
  return results;
}
