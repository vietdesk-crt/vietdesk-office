import { describe, expect, it } from "vitest";
import {
  buildDependencyDAG,
  cellId,
  columnIndex,
  columnLabel,
  computeSheet,
  extractCellDependencies,
  formatNumber,
  parseNumber,
  shuntingYard,
  topologicalSort,
} from "../src/editors/sheets";

describe("toạ độ ô", () => {
  it("đổi cột sang nhãn", () => {
    expect(columnLabel(0)).toBe("A");
    expect(columnLabel(25)).toBe("Z");
    expect(columnLabel(26)).toBe("AA");
    expect(columnLabel(51)).toBe("AZ");
    expect(columnLabel(52)).toBe("BA");
  });

  it("đổi nhãn sang cột", () => {
    expect(columnIndex("A")).toBe(0);
    expect(columnIndex("Z")).toBe(25);
    expect(columnIndex("AA")).toBe(26);
    expect(columnIndex("AZ")).toBe(51);
  });

  it("suy ra mã ô từ toạ độ 0-based", () => {
    expect(cellId(0, 0)).toBe("A1");
    expect(cellId(9, 2)).toBe("C10");
  });
});

describe("đọc số theo quy ước Việt Nam", () => {
  it("nhận dạng số thường", () => {
    expect(parseNumber("42")).toBe(42);
    expect(parseNumber("-3.5")).toBe(-3.5);
  });

  it("nhận dấu chấm phân cách nghìn", () => {
    expect(parseNumber("1.234.567")).toBe(1_234_567);
  });

  it("nhận dấu phẩy thập phân", () => {
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("1.234,56")).toBe(1234.56);
  });

  it("từ chối chuỗi không phải số", () => {
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("12a")).toBeNull();
  });
});

describe("engine công thức", () => {
  it("tính số học có thứ tự ưu tiên", () => {
    const result = computeSheet({ A1: "=1+2*3" });
    expect(result.A1?.numeric).toBe(7);
    expect(result.A1?.display).toBe("7");
  });

  it("tôn trọng ngoặc và dấu âm", () => {
    expect(computeSheet({ A1: "=(1+2)*3" }).A1?.numeric).toBe(9);
    expect(computeSheet({ A1: "=-4+1" }).A1?.numeric).toBe(-3);
  });

  it("tham chiếu ô khác", () => {
    const sheet = computeSheet({ A1: "10", B1: "5", C1: "=A1+B1" });
    expect(sheet.C1?.numeric).toBe(15);
  });

  it("tính hàm trên vùng ô", () => {
    const sheet = computeSheet({
      A1: "1",
      A2: "2",
      A3: "3",
      B1: "=SUM(A1:A3)",
      B2: "=AVERAGE(A1:A3)",
      B3: "=MAX(A1:A3)",
      B4: "=MIN(A1:A3)",
    });
    expect(sheet.B1?.numeric).toBe(6);
    expect(sheet.B2?.numeric).toBe(2);
    expect(sheet.B3?.numeric).toBe(3);
    expect(sheet.B4?.numeric).toBe(1);
  });

  it("bỏ qua ô trống và ô chữ trong vùng", () => {
    const sheet = computeSheet({ A1: "2", A2: "ghi chú", A3: "4", B1: "=SUM(A1:A3)" });
    expect(sheet.B1?.numeric).toBe(6);
  });

  it("phát hiện tham chiếu vòng", () => {
    const sheet = computeSheet({ A1: "=B1", B1: "=A1" });
    expect(sheet.A1?.error).toBe("Tham chiếu vòng");
    expect(sheet.B1?.error).toBe("Tham chiếu vòng");
  });

  it("báo lỗi chia cho 0", () => {
    const sheet = computeSheet({ A1: "=1/0" });
    expect(sheet.A1?.error).toBe("Chia cho 0");
    expect(sheet.A1?.display).toBe("#LỖI");
  });

  it("lan truyền lỗi qua tham chiếu", () => {
    const sheet = computeSheet({ A1: "=1/0", A2: "=A1+1" });
    expect(sheet.A2?.error).toBe("Chia cho 0");
  });

  it("từ chối tham chiếu tới ô chữ", () => {
    const sheet = computeSheet({ A1: "xin chào", A2: "=A1+1" });
    expect(sheet.A2?.error).toContain("không chứa số");
  });

  it("báo lỗi cú pháp rõ ràng", () => {
    expect(computeSheet({ A1: "=1+" }).A1?.error).toBeDefined();
    expect(computeSheet({ A1: "=FOO(1)" }).A1?.error).toContain("Chưa hỗ trợ");
  });

  it("giữ nguyên ô văn bản", () => {
    const sheet = computeSheet({ A1: "Doanh thu" });
    expect(sheet.A1?.display).toBe("Doanh thu");
    expect(sheet.A1?.numeric).toBeNull();
  });

  it("tính toán chính xác các hàm nâng cao COUNT, PRODUCT, ROUND, ABS, IF, SQRT", () => {
    const sheet = computeSheet({
      A1: "10",
      A2: "20",
      A3: "30",
      B1: "=COUNT(A1:A3)",
      B2: "=PRODUCT(A1:A2)",
      B3: "=ROUND(12.3456, 2)",
      B4: "=ABS(-50)",
      B5: "=SQRT(25)",
      B6: "=POWER(2, 4)",
      B7: "=MOD(10, 3)",
      B8: "=IF(A1 > 5, 999, 111)",
      B9: "=IF(A1 < 5, 999, 111)",
      B10: "=IF(A1 >= 10, 50, 0)",
      B11: "=IF(A1 <= 9, 50, 0)",
      B12: "=IF(A1 = 10, 77, 88)",
      B13: "=IF(A1 <> 10, 77, 88)",
    });

    expect(sheet.B1?.numeric).toBe(3);
    expect(sheet.B2?.numeric).toBe(200);
    expect(sheet.B3?.numeric).toBe(12.35);
    expect(sheet.B4?.numeric).toBe(50);
    expect(sheet.B5?.numeric).toBe(5);
    expect(sheet.B6?.numeric).toBe(16);
    expect(sheet.B7?.numeric).toBe(1);
    expect(sheet.B8?.numeric).toBe(999);
    expect(sheet.B9?.numeric).toBe(111);
    expect(sheet.B10?.numeric).toBe(50);
    expect(sheet.B11?.numeric).toBe(0);
    expect(sheet.B12?.numeric).toBe(77);
    expect(sheet.B13?.numeric).toBe(88);
  });

  it("short-circuit trong hàm IF: không kích hoạt lỗi ở nhánh không thoả điều kiện", () => {
    // Nếu điều kiện đúng, nhánh sai (1/0) không bao giờ bị tính
    const sheet1 = computeSheet({ A1: "=IF(1 = 1, 42, 1/0)" });
    expect(sheet1.A1?.numeric).toBe(42);
    expect(sheet1.A1?.error).toBeUndefined();

    // Nếu điều kiện sai, nhánh đúng (1/0) không bao giờ bị tính
    const sheet2 = computeSheet({ A1: "=IF(1 = 0, 1/0, 99)" });
    expect(sheet2.A1?.numeric).toBe(99);
    expect(sheet2.A1?.error).toBeUndefined();

    // Lồng nhau
    const sheet3 = computeSheet({
      A1: "0",
      B1: "=IF(A1 = 0, 0, 100 / A1)",
    });
    expect(sheet3.B1?.numeric).toBe(0);
    expect(sheet3.B1?.error).toBeUndefined();
  });

  it("tính toán toán tử lũy thừa ^ (power operator)", () => {
    expect(computeSheet({ A1: "=2^3" }).A1?.numeric).toBe(8);
    expect(computeSheet({ A1: "=2^3*2" }).A1?.numeric).toBe(16);
    expect(computeSheet({ A1: "=2^(1+2)" }).A1?.numeric).toBe(8);
  });

  it("nhận dạng toạ độ ô có ký tự tuyệt đối $", () => {
    const sheet = computeSheet({
      A1: "10",
      B1: "=$A$1 + 5",
      C1: "=A$1 + 2",
      D1: "=$A1 * 3",
    });
    expect(sheet.B1?.numeric).toBe(15);
    expect(sheet.C1?.numeric).toBe(12);
    expect(sheet.D1?.numeric).toBe(30);
  });
});

describe("đồ thị phụ thuộc DAG & Topological Sort", () => {
  it("trích xuất chính xác các ô phụ thuộc qua extractCellDependencies", () => {
    const deps = extractCellDependencies("=SUM(A1:A3) + B1 * 2 + $C$4");
    expect(deps).toContain("A1");
    expect(deps).toContain("A2");
    expect(deps).toContain("A3");
    expect(deps).toContain("B1");
    expect(deps).toContain("C4");
  });

  it("xây dựng DAG và sắp xếp thứ tự tính toán Topo", () => {
    const cells = {
      A1: "10",
      B1: "=A1 * 2",
      C1: "=B1 + 5",
    };
    const { precedents, dependents } = buildDependencyDAG(cells);
    expect(precedents.get("B1")?.has("A1")).toBe(true);
    expect(precedents.get("C1")?.has("B1")).toBe(true);
    expect(dependents.get("A1")?.has("B1")).toBe(true);
    expect(dependents.get("B1")?.has("C1")).toBe(true);

    const { order, circularCells } = topologicalSort(cells);
    expect(circularCells.size).toBe(0);
    // A1 phải được tính trước B1, B1 trước C1
    expect(order.indexOf("A1")).toBeLessThan(order.indexOf("B1"));
    expect(order.indexOf("B1")).toBeLessThan(order.indexOf("C1"));
  });

  it("phát hiện chu trình tham chiếu vòng trong đồ thị DAG", () => {
    const cells = {
      A1: "=B1 + 1",
      B1: "=C1 * 2",
      C1: "=A1 - 3",
      D1: "100",
    };
    const { circularCells } = topologicalSort(cells);
    expect(circularCells.has("A1")).toBe(true);
    expect(circularCells.has("B1")).toBe(true);
    expect(circularCells.has("C1")).toBe(true);
    expect(circularCells.has("D1")).toBe(false);
  });
});

describe("thuật toán Shunting-Yard (Infix -> RPN)", () => {
  it("chuyển đổi biểu thức số học sang RPN với đúng độ ưu tiên toán tử", () => {
    const rpn = shuntingYard("1 + 2 * 3");
    expect(rpn.map((t) => (t.kind === "number" ? t.value : t.kind === "op" ? t.value : ""))).toEqual([
      1, 2, 3, "*", "+",
    ]);
  });

  it("hỗ trợ dấu ngoặc và hàm trong Shunting-Yard", () => {
    const rpn = shuntingYard("(1 + 2) * 3");
    expect(rpn.map((t) => (t.kind === "number" ? t.value : t.kind === "op" ? t.value : ""))).toEqual([
      1, 2, "+", 3, "*",
    ]);
  });
});

describe("định dạng số", () => {
  it("dùng dấu phẩy thập phân kiểu Việt Nam", () => {
    expect(formatNumber(1234.5).replace(/\u00a0|\u202f/g, " ")).toBe("1.234,5");
  });
});
