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
 * Đề nghị định dạng mở OpenXML chuẩn văn phòng:
 * - Writer: Tài liệu văn bản (.docx)
 * - Sheets: Bảng tính (.xlsx) / CSV (.csv)
 * - Slides: Bản trình chiếu (.pptx)
 * Vẫn cho phép chọn .vdx (định dạng mở của VietDesk).
 * Trả null khi huỷ hoặc khi chạy ngoài Tauri (UI chuyển sang tải tệp).
 */
export async function pickSavePath(
  defaultName: string,
  kind?: "writer" | "sheets" | "slides",
): Promise<string | null> {
  if (!hasNativeCore()) {
    return null;
  }
  const base = defaultName.replace(/\.(vdx|docx?|odt|odp|xlsx|csv|pptx|ppt)$/i, "");

  let defaultExt = "docx";
  let filters = [
    { name: "Word (.docx)", extensions: ["docx"] },
    { name: "Tài liệu VietDesk (.vdx)", extensions: ["vdx"] },
  ];

  if (kind === "sheets" || /\.(xlsx|xls|csv)$/i.test(defaultName)) {
    defaultExt = "xlsx";
    filters = [
      { name: "Excel (.xlsx)", extensions: ["xlsx"] },
      { name: "Bảng tính CSV (.csv)", extensions: ["csv"] },
      { name: "Tài liệu VietDesk (.vdx)", extensions: ["vdx"] },
    ];
  } else if (kind === "slides" || /\.(pptx|ppt|odp)$/i.test(defaultName)) {
    defaultExt = "pptx";
    filters = [
      { name: "PowerPoint (.pptx)", extensions: ["pptx"] },
      { name: "Tài liệu VietDesk (.vdx)", extensions: ["vdx"] },
    ];
  }

  const selected = await save({
    title: "Lưu tài liệu",
    defaultPath: `${base}.${defaultExt}`,
    filters,
  });
  if (typeof selected !== "string") {
    return null;
  }
  if (/\.(vdx|docx|doc|xlsx|xls|csv|pptx|ppt)$/i.test(selected)) {
    return selected;
  }
  return `${selected}.${defaultExt}`;
}

/**
 * Hộp thoại chọn nơi lưu tệp xuất (PDF, v.v.) — định dạng tuỳ ý gọi.
 * Trả null khi huỷ hoặc khi chạy ngoài Tauri (UI chuyển sang tải tệp).
 */
export async function pickExportPath(
  defaultName: string,
  title: string,
  filter: { name: string; extensions: string[] },
): Promise<string | null> {
  if (!hasNativeCore()) {
    return null;
  }
  const selected = await save({
    title,
    defaultPath: defaultName,
    filters: [filter],
  });
  if (typeof selected !== "string") {
    return null;
  }
  const suffix = `.${filter.extensions[0]}`;
  return selected.toLowerCase().endsWith(suffix.toLowerCase())
    ? selected
    : `${selected}${suffix}`;
}
