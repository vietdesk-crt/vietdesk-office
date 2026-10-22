/** Đọc/ghi tệp tài liệu trên đĩa (chỉ có trong Tauri). */
import { invoke } from "@tauri-apps/api/core";
import { hasNativeCore } from "./env";

/** Đọc tối đa 32 MB — cùng giới hạn với phía Rust. */
export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;

export async function readDocumentFile(path: string): Promise<string> {
  if (!hasNativeCore()) {
    throw new Error("Đọc tệp chỉ khả dụng trong bản desktop.");
  }
  return invoke<string>("document_read", { path });
}

/** Ghi nguyên tử: Rust ghi tệp tạm rồi đổi tên, không để lại tệp hỏng. */
export async function writeDocumentFile(
  path: string,
  contents: string,
): Promise<void> {
  if (!hasNativeCore()) {
    throw new Error("Ghi tệp chỉ khả dụng trong bản desktop.");
  }
  await invoke<void>("document_write", { path, contents });
}
