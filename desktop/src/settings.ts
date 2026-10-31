/**
 * Tuỳ chọn giao diện của vỏ ứng dụng.
 *
 * Chỉ lưu trong localStorage: đây là sở thích hiển thị của từng máy, không
 * phải dữ liệu tài liệu. Khi cần đồng bộ giữa các máy, có thể chuyển sang
 * tệp cấu hình do Rust quản lý như `recent-files.json`.
 */

export type ThemePreference = "light";

const THEME_KEY = "vietdesk-theme";

/** Đọc lựa chọn giao diện: hệ thống chỉ sử dụng giao diện Sáng chuẩn văn phòng thuần Việt. */
export function readThemePreference(): ThemePreference {
  return "light";
}

export function writeThemePreference(_preference: ThemePreference): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(THEME_KEY, "light");
  } catch {
    // Không lưu được thì bỏ qua.
  }
}

/** Chế độ tối đã được gỡ bỏ khỏi hệ thống, luôn trả về false. */
export function systemPrefersDark(): boolean {
  return false;
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
