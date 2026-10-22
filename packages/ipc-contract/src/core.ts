/**
 * Lời gọi lõi C++ qua Tauri command.
 *
 * ĐÂY LÀ NGUỒN SỰ THẬT DUY NHẤT cho tên command và kiểu dữ liệu.
 * Khi thêm chức năng mới, sửa theo thứ tự:
 *   1. native/core/include/vietdesk/core.h  (C ABI)
 *   2. native/core-bridge/src/lib.rs        (wrapper an toàn)
 *   3. desktop/src-tauri/src/lib.rs      (Tauri command)
 *   4. file này                           (hợp đồng phía UI)
 *
 * UI không bao giờ gọi C++ trực tiếp: chỉ gọi qua các hàm dưới đây.
 */
import { invoke } from "@tauri-apps/api/core";
import { hasNativeCore } from "./env";

export type CoreRuntime = "c++" | "typescript-fallback";

export interface CoreInfo {
  version: string;
  runtime: CoreRuntime;
}

/** Phiên bản lõi C++ kèm nguồn thực thi. */
export async function coreInfo(): Promise<CoreInfo> {
  if (!hasNativeCore()) {
    return { version: "fallback-ts", runtime: "typescript-fallback" };
  }
  const version = await invoke<string>("core_version");
  return { version, runtime: "c++" };
}

async function callOrFallback(
  command: string,
  text: string,
  fallback: (value: string) => string,
): Promise<string> {
  if (!hasNativeCore()) {
    return fallback(text);
  }
  return invoke<string>(command, { text });
}

/** Ghép dấu tách rời thành ký tự dựng sẵn (NFC). */
export async function composeNfc(text: string): Promise<string> {
  return callOrFallback("vietnamese_compose", text, (value) =>
    value.normalize("NFC"),
  );
}

/** Bỏ thanh điệu, giữ dấu cấu tạo chữ: "Tiếng" → "Tiêng". */
export async function stripTones(text: string): Promise<string> {
  return callOrFallback("vietnamese_strip_tones", text, (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300\u0301\u0303\u0309\u0323]/g, "")
      .normalize("NFC"),
  );
}

/** Bỏ toàn bộ dấu: "Tiếng Việt" → "Tieng Viet". */
export async function removeDiacritics(text: string): Promise<string> {
  return callOrFallback("vietnamese_remove_diacritics", text, (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D"),
  );
}
