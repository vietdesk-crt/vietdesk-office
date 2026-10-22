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

/** Đọc thô bytes của một tệp (dùng cho OOXML/ODF — bản chất là ZIP nhị phân). */
export async function readDocumentBinary(path: string): Promise<Uint8Array> {
  if (!hasNativeCore()) {
    throw new Error("Đọc tệp chỉ khả dụng trong bản desktop.");
  }
  const base64 = await invoke<string>("document_read_binary", { path });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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

/**
 * Ghi tệp nhị phân (DOCX, PDF…) từ base64 — dùng cho "Lưu" sang định dạng Word.
 * Cùng cơ chế nguyên tử với `writeDocumentFile` phía Rust.
 */
export async function writeDocumentBinary(
  path: string,
  contentsBase64: string,
): Promise<void> {
  if (!hasNativeCore()) {
    throw new Error("Ghi tệp chỉ khả dụng trong bản desktop.");
  }
  await invoke<void>("document_write_binary", { path, contentsBase64 });
}
