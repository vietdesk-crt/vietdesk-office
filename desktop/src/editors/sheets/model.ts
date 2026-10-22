/**
 * Mô hình nội dung của Sheets.
 *
 * Nội dung lưu trong `.vdx` có dạng `{ cells: { A1: "=SUM(...)", ... } }`.
 * Chỉ giá trị chuỗi mới được giữ lại; khoá và giá trị lạ bị bỏ qua.
 */

export type CellMap = Readonly<Record<string, string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Đọc bản đồ ô từ nội dung tài liệu, bỏ mọi giá trị không phải chuỗi. */
export function readCells(value: unknown): CellMap {
  const cells: Record<string, string> = {};
  if (isRecord(value) && isRecord(value.cells)) {
    for (const [id, raw] of Object.entries(value.cells)) {
      if (typeof raw === "string") {
        cells[id] = raw;
      }
    }
  }
  return cells;
}

/** Chuẩn hoá nội dung Sheets về đúng dạng lưu trong `.vdx`. */
export function normalizeSheetsContent(value: unknown): { cells: CellMap } {
  return { cells: readCells(value) };
}
