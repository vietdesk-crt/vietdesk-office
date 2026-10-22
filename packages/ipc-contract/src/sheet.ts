/**
 * Hợp đồng gọi engine công thức C++ qua Tauri.
 *
 * UI không tự tính bằng C++: chỉ gọi hàm này. Bản TypeScript trong
 * `desktop/src/editors/sheets` vẫn được giữ làm oracle/fallback cho trình duyệt.
 */
import { invoke } from "@tauri-apps/api/core";
import { hasNativeCore } from "./env";

/** Kết quả một ô do engine C++ trả về. */
export interface SheetCellResult {
  /** Chuỗi hiển thị (đã định dạng vi-VN nếu là số). */
  display: string;
  /** Giá trị số, hoặc null nếu ô trống/chữ/lỗi. */
  numeric: number | null;
  /** Thông điệp lỗi tiếng Việt nếu công thức không hợp lệ. */
  error?: string;
}

export type SheetCellMap = Record<string, string>;

/**
 * Tính toàn bộ bảng bằng lõi C++.
 *
 * Chỉ dùng được trong Tauri; ngoài trình duyệt hàm ném lỗi để tầng gọi tự
 * chọn fallback TypeScript.
 */
export async function computeSheetNative(
  cells: SheetCellMap,
): Promise<Record<string, SheetCellResult>> {
  if (!hasNativeCore()) {
    throw new Error("Engine công thức C++ chỉ khả dụng trong bản desktop.");
  }
  return invoke<Record<string, SheetCellResult>>("sheet_compute", { cells });
}
