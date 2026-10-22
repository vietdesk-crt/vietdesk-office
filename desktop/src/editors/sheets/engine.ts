/**
 * Tầng chọn engine cho bảng tính.
 *
 * - Trong Tauri: gọi lõi C++ qua `@vietdesk/ipc-contract`.
 * - Trong trình duyệt (hoặc khi lõi lỗi): dùng engine TypeScript tham chiếu.
 *
 * Nhờ vậy UI không phụ thuộc trực tiếp vào C++, và bản web vẫn chạy được.
 */
import { computeSheetNative, hasNativeCore } from "@vietdesk/ipc-contract";
import { computeSheet } from "./formula";
import type { CellMap, CellResult } from "./formula";

export type SheetRuntime = "c++" | "typescript";

export interface SheetComputation {
  results: Record<string, CellResult>;
  /** Engine đã thực sự cho ra kết quả — hiển thị để người dùng biết. */
  runtime: SheetRuntime;
}

function fromNative(
  cells: Record<string, { display: string; numeric: number | null; error?: string }>,
): Record<string, CellResult> {
  const results: Record<string, CellResult> = {};
  for (const [id, cell] of Object.entries(cells)) {
    results[id] = cell.error
      ? { display: cell.display, numeric: cell.numeric, error: cell.error }
      : { display: cell.display, numeric: cell.numeric };
  }
  return results;
}

export async function computeSheetEngine(
  cells: CellMap,
): Promise<SheetComputation> {
  if (!hasNativeCore()) {
    return { results: computeSheet(cells), runtime: "typescript" };
  }

  try {
    const native = await computeSheetNative(cells);
    return { results: fromNative(native), runtime: "c++" };
  } catch (error) {
    // Không chặn người dùng vì lỗi engine: quay về bản TS và báo rõ runtime.
    console.warn("[vietdesk] engine C++ lỗi, dùng bản TypeScript:", error);
    return { results: computeSheet(cells), runtime: "typescript" };
  }
}
