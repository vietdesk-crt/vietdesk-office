/** Phát hiện môi trường chạy: trong Tauri (có lõi) hay trình duyệt thuần. */
export function hasNativeCore(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
