/**
 * Tuỳ chọn giao diện của vỏ ứng dụng.
 *
 * Chỉ lưu trong localStorage: đây là sở thích hiển thị của từng máy, không
 * phải dữ liệu tài liệu. Khi cần đồng bộ giữa các máy, có thể chuyển sang
 * tệp cấu hình do Rust quản lý như `recent-files.json`.
 */

export type ThemePreference = "light" | "dark" | "system";

const THEME_KEY = "vietdesk-theme";

/** Đọc lựa chọn giao diện; hỗ trợ dữ liệu cũ chỉ có "light"/"dark". */
export function readThemePreference(): ThemePreference {
  if (typeof localStorage === "undefined") {
    return "system";
  }
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {
    // localStorage bị chặn — rơi về "system".
  }
  return "system";
}

export function writeThemePreference(preference: ThemePreference): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Không lưu được thì vẫn giữ lựa chọn trong phiên hiện tại.
  }
}

/** Hệ điều hành đang dùng giao diện tối? (false nếu môi trường không hỗ trợ.) */
export function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

const AUTOSAVE_KEY = "vietdesk-autosave";

/** Đọc lựa chọn tự lưu; mặc định bật khi chưa có dữ liệu. */
export function readAutosaveEnabled(): boolean {
  if (typeof localStorage === "undefined") {
    return true;
  }
  try {
    return localStorage.getItem(AUTOSAVE_KEY) !== "off";
  } catch {
    // localStorage bị chặn — giữ mặc định là bật.
  }
  return true;
}

export function writeAutosaveEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(AUTOSAVE_KEY, enabled ? "on" : "off");
  } catch {
    // Không lưu được thì vẫn giữ lựa chọn trong phiên hiện tại.
  }
}
