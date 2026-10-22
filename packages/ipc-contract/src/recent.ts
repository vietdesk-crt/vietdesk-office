/**
 * Danh sách tệp gần đây — dùng chung cho trang chủ.
 *
 * Hai chế độ lưu trữ sau cùng một API:
 *  - Trong Tauri: Rust ghi `recent-files.json` vào thư mục cấu hình ứng dụng
 *    và tự kiểm tra tệp còn tồn tại hay không.
 *  - Trong trình duyệt (`npm run dev`): localStorage, không kiểm tra được đĩa.
 *
 * UI chỉ làm việc với `RecentEntry`, không cần biết đang ở chế độ nào.
 */
import { invoke } from "@tauri-apps/api/core";
import type { DocumentType } from "./document";
import { hasNativeCore } from "./env";

export type DocumentKind = DocumentType | "unknown";

export interface RecentEntry {
  /** Khoá duy nhất: đường dẫn tuyệt đối, hoặc `unsaved:<kind>:<tên>`. */
  id: string;
  /** null nếu tài liệu chưa được lưu vào đĩa. */
  path: string | null;
  name: string;
  kind: DocumentKind;
  pinned: boolean;
  /** Unix epoch milliseconds. */
  openedAt: number;
  /** Kích thước byte, nếu đọc được. */
  size: number | null;
  /** Tệp còn tồn tại trên đĩa hay không. */
  exists: boolean;
}

const STORAGE_KEY = "vietdesk.recent.v1";
const LIMIT_KEY = "vietdesk.recent.limit";
const DEFAULT_LIMIT = 20;

/** Các mức giới hạn hiển thị trong Cài đặt. */
export const RECENT_LIMIT_OPTIONS = [10, 20, 50] as const;

export const DEFAULT_RECENT_LIMIT = DEFAULT_LIMIT;

/** Số tệp gần đây tối đa người dùng đã chọn (mặc định 20). */
export function readRecentLimit(): number {
  if (typeof localStorage === "undefined") {
    return DEFAULT_LIMIT;
  }
  try {
    const raw = Number(localStorage.getItem(LIMIT_KEY));
    if (Number.isInteger(raw) && raw >= 1 && raw <= 200) {
      return raw;
    }
  } catch {
    // localStorage bị chặn — dùng mặc định.
  }
  return DEFAULT_LIMIT;
}

/** Lưu lựa chọn giới hạn. Không tự cắt danh sách hiện có. */
export function writeRecentLimit(limit: number): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  const safe = Math.min(200, Math.max(1, Math.round(limit)));
  localStorage.setItem(LIMIT_KEY, String(safe));
}

const EXTENSION_KIND: Record<string, DocumentKind> = {
  doc: "writer",
  docx: "writer",
  odt: "writer",
  rtf: "writer",
  txt: "writer",
  xls: "sheets",
  xlsx: "sheets",
  ods: "sheets",
  csv: "sheets",
  ppt: "slides",
  pptx: "slides",
  odp: "slides",
};

/** Đoán loại tài liệu từ tên/đường dẫn tệp. */
export function kindFromFileName(name: string): DocumentKind {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_KIND[extension] ?? "unknown";
}

/** Sắp xếp: ghim trước, sau đó mới nhất trước. */
export function sortRecent(entries: RecentEntry[]): RecentEntry[] {
  return [...entries].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return b.openedAt - a.openedAt;
  });
}

function entryId(path: string | null, kind: DocumentKind, name: string): string {
  return path ?? `unsaved:${kind}:${name}`;
}

/** Đọc danh sách trong chế độ trình duyệt (đồng bộ, dùng cho test). */
export function readLocalRecent(): RecentEntry[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is RecentEntry =>
        typeof item === "object" && item !== null && "id" in item,
    );
  } catch {
    return [];
  }
}

function writeLocalRecent(entries: RecentEntry[]): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/** Xoá sạch danh sách (dùng cho test hoặc nút "Xoá lịch sử"). */
export function clearLocalRecent(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** Danh sách tệp gần đây, mới nhất trước. */
export async function listRecentFiles(): Promise<RecentEntry[]> {
  if (hasNativeCore()) {
    return invoke<RecentEntry[]>("recent_list");
  }
  return sortRecent(readLocalRecent());
}

/**
 * Ghi nhận một tệp vừa mở/tạo. Trùng `id` thì gộp, giữ trạng thái ghim.
 * Trả về danh sách mới để UI cập nhật ngay, không cần gọi lại `list`.
 */
export async function rememberFile(input: {
  path?: string | null;
  name: string;
  kind: DocumentKind;
}): Promise<RecentEntry[]> {
  const path = input.path ?? null;
  const kind = input.kind === "unknown" ? kindFromFileName(input.name) : input.kind;
  const limit = readRecentLimit();

  if (hasNativeCore()) {
    return invoke<RecentEntry[]>("recent_remember", {
      path,
      name: input.name,
      kind,
      limit,
    });
  }

  const entries = readLocalRecent();
  const id = entryId(path, kind, input.name);
  const previous = entries.find((entry) => entry.id === id);
  const next = entries.filter((entry) => entry.id !== id);
  next.push({
    id,
    path,
    name: input.name,
    kind,
    pinned: previous?.pinned ?? false,
    openedAt: Date.now(),
    size: previous?.size ?? null,
    exists: path !== null,
  });
  const trimmed = sortRecent(next).slice(0, limit);
  writeLocalRecent(trimmed);
  return trimmed;
}

/**
 * Đường dẫn tệp lưu lịch sử (chỉ có trong Tauri).
 * Trả null khi chạy bằng localStorage trong trình duyệt.
 */
export async function recentStorePath(): Promise<string | null> {
  if (!hasNativeCore()) {
    return null;
  }
  return invoke<string>("recent_store_path");
}

/** Xoá toàn bộ lịch sử gần đây. */
export async function clearRecentFiles(): Promise<RecentEntry[]> {
  if (hasNativeCore()) {
    return invoke<RecentEntry[]>("recent_clear");
  }
  clearLocalRecent();
  return [];
}

/** Ghim/bỏ ghim một tệp. */
export async function setRecentPinned(
  id: string,
  pinned: boolean,
): Promise<RecentEntry[]> {
  if (hasNativeCore()) {
    return invoke<RecentEntry[]>("recent_set_pinned", { id, pinned });
  }
  const entries = readLocalRecent().map((entry) =>
    entry.id === id ? { ...entry, pinned } : entry,
  );
  const sorted = sortRecent(entries);
  writeLocalRecent(sorted);
  return sorted;
}

/** Xoá một tệp khỏi danh sách (không xoá tệp trên đĩa). */
export async function forgetFile(id: string): Promise<RecentEntry[]> {
  if (hasNativeCore()) {
    return invoke<RecentEntry[]>("recent_forget", { id });
  }
  const entries = sortRecent(readLocalRecent().filter((entry) => entry.id !== id));
  writeLocalRecent(entries);
  return entries;
}
