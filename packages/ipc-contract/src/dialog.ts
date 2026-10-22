/** Hộp thoại chọn tệp của hệ điều hành (chỉ có trong Tauri). */
import { open, save } from "@tauri-apps/plugin-dialog";
import { hasNativeCore } from "./env";

const OPEN_FILTERS = [
  {
    name: "Tài liệu VietDesk",
    extensions: ["vdx"],
  },
  {
    name: "Tài liệu văn phòng",
    extensions: [
      "docx",
      "doc",
      "odt",
      "rtf",
      "xlsx",
      "xls",
      "ods",
      "csv",
      "pptx",
      "ppt",
      "odp",
    ],
  },
  { name: "Tất cả tệp", extensions: ["*"] },
];

/**
 * Mở hộp thoại chọn tệp.
 * Trả null khi người dùng huỷ, hoặc khi chạy ngoài Tauri (UI dùng <input type=file>).
 */
export async function pickDocument(): Promise<string | null> {
  if (!hasNativeCore()) {
    return null;
  }
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Mở tài liệu",
    filters: OPEN_FILTERS,
  });
  if (typeof selected === "string") {
    return selected;
  }
  return null;
}

/**
 * Hộp thoại “Lưu thành…”. Chỉ trả đường dẫn, không tự ghi tệp.
 * Trả null khi huỷ hoặc khi chạy ngoài Tauri (UI chuyển sang tải tệp).
 */
export async function pickSavePath(
  defaultName: string,
): Promise<string | null> {
  if (!hasNativeCore()) {
    return null;
  }
  const selected = await save({
    title: "Lưu tài liệu",
    defaultPath: defaultName,
    filters: [{ name: "Tài liệu VietDesk", extensions: ["vdx"] }],
  });
  if (typeof selected === "string") {
    return /\.vdx$/i.test(selected) ? selected : `${selected}.vdx`;
  }
  return null;
}
