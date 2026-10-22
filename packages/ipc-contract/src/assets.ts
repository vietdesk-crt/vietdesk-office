/**
 * Ảnh chèn trong tài liệu Writer.
 *
 * Ảnh không nằm trong tệp `.vdx` mà nằm trong thư mục `assets` cạnh tệp tài
 * liệu. Tài liệu chỉ lưu *đường dẫn tương đối* (`assets/anh-1.png`) nên vẫn
 * dùng được sau khi chuyển cả thư mục sang máy khác.
 *
 * Khi chạy ngoài Tauri (bản web) không ghi được vào thư mục, nên ảnh được nhúng
 * thẳng thành data URL — tài liệu vẫn xem được, chỉ là nặng hơn.
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { hasNativeCore } from "./env";

/** Giới hạn kích thước ảnh (16 MB) — cùng giới hạn với phía Rust. */
export const MAX_ASSET_BYTES = 16 * 1024 * 1024;

/** Phần mở rộng ảnh được phép chèn. */
export const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
] as const;

/**
 * Mở hộp thoại chọn ảnh.
 * Trả null khi người dùng huỷ hoặc khi chạy ngoài Tauri.
 */
export async function pickImageFile(): Promise<string | null> {
  if (!hasNativeCore()) {
    return null;
  }
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Chèn ảnh",
    filters: [{ name: "Ảnh", extensions: [...IMAGE_EXTENSIONS] }],
  });
  return typeof selected === "string" ? selected : null;
}

/** Đọc ảnh trên đĩa rồi mã hoá base64 (chỉ có trong Tauri). */
export async function readImageBase64(path: string): Promise<string> {
  if (!hasNativeCore()) {
    throw new Error("Đọc ảnh chỉ khả dụng trong bản desktop.");
  }
  return invoke<string>("asset_read_base64", { path });
}

/**
 * Lưu ảnh vào thư mục `assets` cạnh tệp tài liệu.
 * Trả về đường dẫn tương đối để lưu vào tài liệu.
 */
export async function writeImageAsset(
  documentPath: string,
  fileName: string,
  contentsBase64: string,
): Promise<string> {
  if (!hasNativeCore()) {
    throw new Error("Lưu ảnh chỉ khả dụng trong bản desktop.");
  }
  return invoke<string>("asset_write", {
    documentPath,
    fileName,
    contentsBase64,
  });
}

/** Thư mục chứa tệp tài liệu (không có dấu phân cách ở cuối). */
export function documentFolder(documentPath: string): string {
  const normalized = documentPath.replace(/[\\/]+$/, "");
  const index = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );
  return index > 0 ? normalized.slice(0, index) : "";
}

/**
 * Đường dẫn tuyệt đối của ảnh, tính từ đường dẫn tương đối trong tài liệu.
 */
export function resolveAssetPath(
  documentPath: string | null,
  relativePath: string,
): string | null {
  if (!documentPath || !relativePath) {
    return null;
  }
  if (/^(data:|https?:|blob:)/i.test(relativePath)) {
    return null;
  }
  const folder = documentFolder(documentPath);
  if (!folder) {
    return null;
  }
  const separator = documentPath.includes("\\") ? "\\" : "/";
  return `${folder}${separator}${relativePath.replace(/[\\/]/g, separator)}`;
}

/**
 * URL để trình duyệt hiển thị ảnh.
 *
 * Trong Tauri, ảnh nằm ngoài gói ứng dụng nên phải đi qua asset protocol.
 * Ngoài Tauri, ảnh đã là data URL nên giữ nguyên.
 */
export function assetUrl(
  documentPath: string | null,
  relativePath: string,
): string {
  if (!hasNativeCore()) {
    return relativePath;
  }
  const absolute = resolveAssetPath(documentPath, relativePath);
  return absolute ? convertFileSrc(absolute) : relativePath;
}

/** Đọc tệp ảnh trong trình duyệt thành data URL. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("Không đọc được tệp ảnh."));
      }
    };
    reader.readAsDataURL(file);
  });
}
