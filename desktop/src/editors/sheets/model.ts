/**
 * Mô hình nội dung của Sheets.
 *
 * Nội dung lưu trong `.vdx` có dạng `{ cells: { A1: "=SUM(...)", ... } }`.
 * Chỉ giá trị chuỗi mới được giữ lại; khoá và giá trị lạ bị bỏ qua.
 */

export type CellMap = Readonly<Record<string, string>>;

export type NumberFormatType =
  | "general"
  | "currency"
  | "percent"
  | "integer"
  | "decimal";

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  numFormat?: NumberFormatType;
  color?: string;
  bg?: string;
}

import { isRecord } from "@vietdesk/ipc-contract";

export type CellStyleMap = Readonly<Record<string, CellStyle>>;

export interface SheetsContent {
  cells: CellMap;
  styles?: CellStyleMap;
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

/** Đọc bản đồ định dạng ô từ nội dung tài liệu. */
export function readStyles(value: unknown): CellStyleMap {
  const styles: Record<string, CellStyle> = {};
  if (isRecord(value) && isRecord(value.styles)) {
    for (const [id, raw] of Object.entries(value.styles)) {
      if (isRecord(raw)) {
        styles[id] = {
          bold: typeof raw.bold === "boolean" ? raw.bold : undefined,
          italic: typeof raw.italic === "boolean" ? raw.italic : undefined,
          align:
            raw.align === "left" || raw.align === "center" || raw.align === "right"
              ? raw.align
              : undefined,
          numFormat:
            raw.numFormat === "general" ||
            raw.numFormat === "currency" ||
            raw.numFormat === "percent" ||
            raw.numFormat === "integer" ||
            raw.numFormat === "decimal"
              ? raw.numFormat
              : undefined,
          color: typeof raw.color === "string" ? raw.color : undefined,
          bg: typeof raw.bg === "string" ? raw.bg : undefined,
        };
      }
    }
  }
  return styles;
}

/** Chuẩn hoá nội dung Sheets về đúng dạng lưu trong `.vdx`. */
export function normalizeSheetsContent(value: unknown): SheetsContent {
  const styles = readStyles(value);
  if (Object.keys(styles).length === 0) {
    return { cells: readCells(value) };
  }
  return {
    cells: readCells(value),
    styles,
  };
}
