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
  | { kind: "op"; value: "+" | "-" | "*" | "/" | "^" }
  | { kind: "compare"; value: ">" | "<" | ">=" | "<=" | "=" | "<>" }
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

    if (char === "$") {
      const absMatch = /^\$([A-Za-z]+)\$?([0-9]+)/.exec(rest);
      if (absMatch) {
        const col = absMatch[1]!.toUpperCase();
        const row = absMatch[2]!;
        tokens.push({ kind: "ref", id: `${col}${row}` });
        index += absMatch[0].length;
        continue;
      }
    }

    const identifierMatch = IDENTIFIER.exec(rest);
    if (identifierMatch) {
      const word = identifierMatch[0]!;
      const upper = word.toUpperCase();
      const following = rest.slice(word.length);
      if (following.startsWith("$")) {
        const rowMatch = /^\$([0-9]+)/.exec(following);
        if (rowMatch && /^[A-Za-z]+$/.test(word)) {
          tokens.push({ kind: "ref", id: `${upper}${rowMatch[1]}` });
          index += word.length + rowMatch[0].length;
          continue;
        }
      }
      const followingTrim = following.trimStart();
      index += word.length;
      if (followingTrim.startsWith("(") && /^[A-Za-z]+$/.test(word)) {
        tokens.push({ kind: "func", name: upper });
      } else if (CELL_ID.test(upper)) {
        tokens.push({ kind: "ref", id: upper });
      } else {
        throw new FormulaError(`Không nhận ra "${word}"`);
      }
      continue;
    }

    if (char === ">" || char === "<" || char === "=") {
      if (rest.startsWith(">=") || rest.startsWith("<=") || rest.startsWith("<>")) {
        tokens.push({ kind: "compare", value: rest.slice(0, 2) as any });
        index += 2;
        continue;
      }
      tokens.push({ kind: "compare", value: char as any });
      index += 1;
      continue;
    }

    switch (char) {
      case "+":
      case "-":
      case "*":
      case "/":
      case "^":
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
    case "COUNT":
      return numbers.length;
    case "PRODUCT":
      return numbers.length === 0 ? 0 : numbers.reduce((prod, v) => prod * v, 1);
    case "ABS":
      if (args.length === 0) throw new FormulaError("Hàm ABS cần 1 tham số");
      return Math.abs(scalar(args[0]));
    case "ROUND": {
      if (args.length === 0) throw new FormulaError("Hàm ROUND cần ít nhất 1 tham số");
      const val = scalar(args[0]);
      const digits = args.length >= 2 ? scalar(args[1]) : 0;
      const factor = Math.pow(10, digits);
      return Math.round(val * factor) / factor;
    }
    case "INT":
      if (args.length === 0) throw new FormulaError("Hàm INT cần 1 tham số");
      return Math.floor(scalar(args[0]));
    case "SQRT": {
      if (args.length === 0) throw new FormulaError("Hàm SQRT cần 1 tham số");
      const val = scalar(args[0]);
      if (val < 0) throw new FormulaError("Không thể tính căn bậc hai số âm");
      return Math.sqrt(val);
    }
    case "POWER":
      if (args.length < 2) throw new FormulaError("Hàm POWER cần 2 tham số");
      return Math.pow(scalar(args[0]), scalar(args[1]));
    case "MOD": {
      if (args.length < 2) throw new FormulaError("Hàm MOD cần 2 tham số: MOD(số, số_chia)");
      const divisor = scalar(args[1]);
      if (divisor === 0) throw new FormulaError("Chia cho 0");
      return scalar(args[0]) % divisor;
    }
    case "IF": {
      if (args.length < 2) throw new FormulaError("Hàm IF cần ít nhất 2 tham số: IF(điều_kiện, đúng, [sai])");
      const cond = scalar(args[0]);
      if (cond !== 0) {
        return scalar(args[1]);
      }
      return args.length >= 3 ? scalar(args[2]) : 0;
    }
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
    const value = this.comparison();
    if (this.cursor < this.tokens.length) {
      throw new FormulaError("Công thức thừa ký tự");
    }
    return scalar(value);
  }

  private comparison(): Value {
    let left = this.additive();
    while (this.cursor < this.tokens.length) {
      const token = this.peek();
      if (!token || token.kind !== "compare") break;
      this.cursor += 1;
      const right = this.additive();
      const l = scalar(left);
      const r = scalar(right);
      switch (token.value) {
        case ">": left = l > r ? 1 : 0; break;
        case "<": left = l < r ? 1 : 0; break;
        case ">=": left = l >= r ? 1 : 0; break;
        case "<=": left = l <= r ? 1 : 0; break;
        case "=": left = Math.abs(l - r) < 1e-9 ? 1 : 0; break;
        case "<>": left = Math.abs(l - r) >= 1e-9 ? 1 : 0; break;
      }
    }
    return left;
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
    let left = this.power();
    for (;;) {
      const token = this.peek();
      if (!token || token.kind !== "op") {
        break;
      }
      if (token.value !== "*" && token.value !== "/") {
        break;
      }
      this.cursor += 1;
      const right = this.power();
      const divisor = scalar(right);
      if (token.value === "/" && divisor === 0) {
        throw new FormulaError("Chia cho 0");
      }
      left =
        token.value === "*" ? scalar(left) * divisor : scalar(left) / divisor;
    }
    return left;
  }

  private power(): Value {
    const left = this.unary();
    const token = this.peek();
    if (token && token.kind === "op" && token.value === "^") {
      this.cursor += 1;
      // Lũy thừa có tính kết hợp phải (right-associative): 2^3^2 = 2^(3^2) = 512
      const right = this.power();
      return Math.pow(scalar(left), scalar(right));
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

  private skipArgument(): void {
    let parenDepth = 0;
    while (this.cursor < this.tokens.length) {
      const token = this.tokens[this.cursor];
      if (!token) break;
      if (token.kind === "lparen") {
        parenDepth += 1;
        this.cursor += 1;
      } else if (token.kind === "rparen") {
        if (parenDepth === 0) {
          break;
        }
        parenDepth -= 1;
        this.cursor += 1;
      } else if (token.kind === "comma") {
        if (parenDepth === 0) {
          break;
        }
        this.cursor += 1;
      } else {
        this.cursor += 1;
      }
    }
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
      const value = this.comparison();
      const close = this.peek();
      if (!close || close.kind !== "rparen") {
        throw new FormulaError("Thiếu dấu )");
      }
      this.cursor += 1;
      return value;
    }

    if (token.kind === "func") {
      const funcName = token.name;
      this.cursor += 1;
      const open = this.peek();
      if (!open || open.kind !== "lparen") {
        throw new FormulaError(`Hàm ${funcName} thiếu dấu (`);
      }
      this.cursor += 1;

      // Xử lý riêng hàm IF để đảm bảo Short-Circuit: chỉ đánh giá nhánh thoả điều kiện
      if (funcName === "IF") {
        const cond = scalar(this.comparison());
        const sep1 = this.peek();
        if (!sep1 || sep1.kind !== "comma") {
          throw new FormulaError("Hàm IF cần ít nhất 2 tham số: IF(điều_kiện, đúng, [sai])");
        }
        this.cursor += 1;

        let result: number;
        if (cond !== 0) {
          result = scalar(this.comparison());
          const sep2 = this.peek();
          if (sep2 && sep2.kind === "comma") {
            this.cursor += 1;
            this.skipArgument();
          }
        } else {
          this.skipArgument();
          const sep2 = this.peek();
          if (sep2 && sep2.kind === "comma") {
            this.cursor += 1;
            result = scalar(this.comparison());
          } else {
            result = 0;
          }
        }

        const close = this.peek();
        if (!close || close.kind !== "rparen") {
          throw new FormulaError("Thiếu dấu )");
        }
        this.cursor += 1;
        return result;
      }

      const args: Value[] = [];
      const first = this.peek();
      if (!first || first.kind !== "rparen") {
        for (;;) {
          args.push(this.comparison());
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
      return callFunction(funcName, args);
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

/**
 * Mở rộng một dải ô như "A1:A3" thành danh sách các mã ô: ["A1", "A2", "A3"].
 */
export function expandCellRange(startId: string, endId: string): string[] {
  const start = CELL_ID.exec(startId);
  const end = CELL_ID.exec(endId);
  if (!start || !end) return [];
  const startRow = Number(start[2]) - 1;
  const endRow = Number(end[2]) - 1;
  const startCol = columnIndex(start[1] as string);
  const endCol = columnIndex(end[1] as string);
  const top = Math.min(startRow, endRow);
  const bottom = Math.max(startRow, endRow);
  const left = Math.min(startCol, endCol);
  const right = Math.max(startCol, endCol);

  if ((bottom - top + 1) * (right - left + 1) > 10_000) {
    return [];
  }

  const ids: string[] = [];
  for (let r = top; r <= bottom; r += 1) {
    for (let c = left; c <= right; c += 1) {
      ids.push(cellId(r, c));
    }
  }
  return ids;
}

/**
 * Trích xuất toàn bộ mã ô mà công thức tham chiếu đến (Precedents).
 * Ví dụ: "=SUM(A1:A3) + B1 * 2" -> ["A1", "A2", "A3", "B1"].
 */
export function extractCellDependencies(rawFormula: string): string[] {
  const trimmed = rawFormula.trim();
  if (!trimmed.startsWith("=")) return [];
  try {
    const tokens = tokenize(trimmed.slice(1));
    const deps = new Set<string>();
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token && token.kind === "ref") {
        const next = tokens[i + 1];
        if (next && next.kind === "colon") {
          const end = tokens[i + 2];
          if (end && end.kind === "ref") {
            const rangeCells = expandCellRange(token.id, end.id);
            for (const id of rangeCells) deps.add(id);
            i += 2;
            continue;
          }
        }
        deps.add(token.id);
      }
    }
    return Array.from(deps);
  } catch {
    return [];
  }
}

/**
 * Xây dựng Đồ thị Có hướng Không chu trình (DAG) cho bảng tính:
 * - precedents: ô X cần những ô nào để tính giá trị
 * - dependents: khi ô X đổi giá trị, những ô nào cần được tính lại
 */
export function buildDependencyDAG(cells: CellMap): {
  precedents: Map<string, Set<string>>;
  dependents: Map<string, Set<string>>;
} {
  const precedents = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  for (const [id, raw] of Object.entries(cells)) {
    if (!dependents.has(id)) dependents.set(id, new Set());
    if (typeof raw === "string" && raw.trim().startsWith("=")) {
      const deps = extractCellDependencies(raw);
      precedents.set(id, new Set(deps));
      for (const dep of deps) {
        if (!dependents.has(dep)) dependents.set(dep, new Set());
        dependents.get(dep)!.add(id);
      }
    } else {
      precedents.set(id, new Set());
    }
  }

  return { precedents, dependents };
}

/**
 * Sắp xếp Topo (Topological Sort) đồ thị phụ thuộc và phát hiện chu trình (3-Color DFS).
 * - Trả về `order`: Thứ tự duyệt an toàn để tính toán tuần tự hoặc song song.
 * - Trả về `circularCells`: Tập các ô rơi vào chu trình tham chiếu vòng.
 */
export function topologicalSort(cells: CellMap): {
  order: string[];
  circularCells: Set<string>;
} {
  const { precedents } = buildDependencyDAG(cells);
  const order: string[] = [];
  const circularCells = new Set<string>();

  // 0: Trắng (Chưa thăm), 1: Xám (Đang duyệt trên nhánh đệ quy), 2: Đen (Đã xong)
  const state = new Map<string, 0 | 1 | 2>();
  for (const id of Object.keys(cells)) {
    state.set(id, 0);
  }

  function dfs(node: string, path: string[]): boolean {
    const s = state.get(node) ?? 0;
    if (s === 1) {
      const cycleStart = path.indexOf(node);
      const cycleNodes = cycleStart >= 0 ? path.slice(cycleStart) : path;
      for (const c of cycleNodes) circularCells.add(c);
      circularCells.add(node);
      return false;
    }
    if (s === 2) {
      return true;
    }

    state.set(node, 1);
    path.push(node);

    const deps = precedents.get(node);
    if (deps) {
      for (const dep of deps) {
        if (cells[dep] !== undefined) {
          if (!dfs(dep, path)) {
            circularCells.add(node);
          }
        }
      }
    }

    path.pop();
    state.set(node, 2);
    if (!circularCells.has(node)) {
      order.push(node);
    }
    return true;
  }

  for (const id of Object.keys(cells)) {
    if ((state.get(id) ?? 0) === 0) {
      dfs(id, []);
    }
  }

  return { order, circularCells };
}

export type RPNToken =
  | { kind: "number"; value: number }
  | { kind: "ref"; id: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" | "^" }
  | { kind: "compare"; value: ">" | "<" | ">=" | "<=" | "=" | "<>" }
  | { kind: "func"; name: string; argCount: number };

/**
 * Thuật toán Shunting-Yard của Dijkstra: chuyển biểu thức Infix sang Ký pháp Ba Lan ngược (RPN).
 */
export function shuntingYard(rawFormula: string): RPNToken[] {
  const trimmed = rawFormula.trim();
  const source = trimmed.startsWith("=") ? trimmed.slice(1) : trimmed;
  const tokens = tokenize(source);

  const output: RPNToken[] = [];
  const operatorStack: Array<
    | { kind: "op"; value: "+" | "-" | "*" | "/" | "^" }
    | { kind: "compare"; value: ">" | "<" | ">=" | "<=" | "=" | "<>" }
    | { kind: "lparen" }
    | { kind: "func"; name: string; argCount: number }
  > = [];

  const precedence: Record<string, number> = {
    "=": 1, "<>": 1, "<": 1, "<=": 1, ">": 1, ">=": 1,
    "+": 2, "-": 2,
    "*": 3, "/": 3,
    "^": 4,
  };

  const isRightAssociative = (op: string) => op === "^";

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;

    if (token.kind === "number") {
      output.push({ kind: "number", value: token.value });
    } else if (token.kind === "ref") {
      output.push({ kind: "ref", id: token.id });
    } else if (token.kind === "func") {
      operatorStack.push({ kind: "func", name: token.name, argCount: 1 });
    } else if (token.kind === "comma") {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1]!.kind !== "lparen") {
        const top = operatorStack.pop()!;
        if (top.kind === "op" || top.kind === "compare") {
          output.push(top);
        }
      }
      for (let j = operatorStack.length - 1; j >= 0; j -= 1) {
        const item = operatorStack[j]!;
        if (item.kind === "func") {
          item.argCount += 1;
          break;
        }
      }
    } else if (token.kind === "op" || token.kind === "compare") {
      const opPrec = precedence[token.value] ?? 0;
      while (operatorStack.length > 0) {
        const top = operatorStack[operatorStack.length - 1]!;
        if (top.kind === "lparen" || top.kind === "func") break;
        const topPrec = precedence[top.value] ?? 0;
        if (topPrec > opPrec || (topPrec === opPrec && !isRightAssociative(token.value))) {
          output.push(operatorStack.pop() as RPNToken);
        } else {
          break;
        }
      }
      operatorStack.push(token);
    } else if (token.kind === "lparen") {
      operatorStack.push({ kind: "lparen" });
    } else if (token.kind === "rparen") {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1]!.kind !== "lparen") {
        const top = operatorStack.pop()!;
        if (top.kind === "op" || top.kind === "compare") {
          output.push(top);
        }
      }
      if (operatorStack.length > 0 && operatorStack[operatorStack.length - 1]!.kind === "lparen") {
        operatorStack.pop();
      }
      if (operatorStack.length > 0 && operatorStack[operatorStack.length - 1]!.kind === "func") {
        output.push(operatorStack.pop() as RPNToken);
      }
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop()!;
    if (top.kind === "op" || top.kind === "compare" || top.kind === "func") {
      output.push(top as RPNToken);
    }
  }

  return output;
}

/**
 * Lớp Đồ thị Phụ thuộc (Dependency DAG) cho bảng tính:
 * Quản lý quan hệ precedents, dependents, phát hiện chu trình (Cycle Detection),
 * và tính toán thứ tự Topo (Topological Sort).
 */
export class DependencyDAG {
  private precedents = new Map<string, Set<string>>();
  private dependents = new Map<string, Set<string>>();

  constructor(cells?: CellMap) {
    if (cells) {
      this.rebuild(cells);
    }
  }

  rebuild(cells: CellMap): void {
    const dag = buildDependencyDAG(cells);
    this.precedents = dag.precedents;
    this.dependents = dag.dependents;
  }

  getPrecedents(id: string): string[] {
    return Array.from(this.precedents.get(id) ?? []);
  }

  getDependents(id: string): string[] {
    return Array.from(this.dependents.get(id) ?? []);
  }

  /**
   * Lấy danh sách toàn bộ các ô bị ảnh hưởng khi một tập ô thay đổi (Dirty Transitive Closure).
   */
  getAffectedCells(changedIds: string[]): string[] {
    const affected = new Set<string>();
    const queue = [...changedIds];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const deps = this.dependents.get(current);
      if (deps) {
        for (const dep of deps) {
          if (!affected.has(dep)) {
            affected.add(dep);
            queue.push(dep);
          }
        }
      }
    }
    return Array.from(affected);
  }

  topologicalOrder(cells: CellMap): { order: string[]; circularCells: Set<string> } {
    return topologicalSort(cells);
  }
}

/**
 * Lớp Bộ giải cú pháp & Ký pháp Ba Lan Ngược Shunting-Yard (RPN Engine).
 */
export class ShuntingYardEngine {
  tokenize(formula: string): Token[] {
    const trimmed = formula.trim();
    const source = trimmed.startsWith("=") ? trimmed.slice(1) : trimmed;
    return tokenize(source);
  }

  toRPN(formula: string): RPNToken[] {
    return shuntingYard(formula);
  }
}

/**
 * Lớp Động cơ Tính toán Công thức Bảng tính (OOP Formula Engine).
 */
export class FormulaEngine {
  private readonly dag: DependencyDAG;
  private readonly engine: SheetEngine;

  constructor(private readonly cells: CellMap) {
    this.dag = new DependencyDAG(cells);
    this.engine = new SheetEngine(cells);
  }

  evaluate(id: string): CellResult {
    return this.engine.result(id);
  }

  evaluateAll(): Record<string, CellResult> {
    return computeSheet(this.cells);
  }

  getDAG(): DependencyDAG {
    return this.dag;
  }
}

