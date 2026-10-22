import { DOCUMENT_KINDS } from "@vietdesk/ipc-contract";
import type { DocumentKind } from "@vietdesk/ipc-contract";
import { sheetsApp } from "./sheets";
import { slidesApp } from "./slides";
import type { AppDescriptor, AppId, HomeCard } from "./types";
import { writerApp } from "./writer";

/** Thứ tự cố định dùng cho rail, trang chủ và vòng lặp trạng thái. */
export const APP_IDS = DOCUMENT_KINDS;

export const APPS: Record<AppId, AppDescriptor> = {
  writer: writerApp,
  sheets: sheetsApp,
  slides: slidesApp,
};

/** Thẻ "Tạo mới" trên trang chủ, lấy từ mô tả của từng ứng dụng. */
export const HOME_CARDS: Array<HomeCard & { kind: AppId }> = APP_IDS.map(
  (kind) => ({ kind, ...APPS[kind].home }),
);

const UNKNOWN_DISPLAY = { label: "Tệp khác", glyph: "?" } as const;

export function isAppId(kind: DocumentKind): kind is AppId {
  return (APP_IDS as readonly string[]).includes(kind);
}

/** Loại tài liệu từ danh sách gần đây → ứng dụng dùng để mở. */
export function appForKind(kind: DocumentKind): AppId {
  return isAppId(kind) ? kind : "writer";
}

/**
 * Metadata hiển thị cho một loại tài liệu, kể cả tệp không nhận diện được.
 * Chỉ dùng ở UI; không liên quan đến việc chọn editor.
 */
export function appDisplay(kind: DocumentKind): {
  label: string;
  glyph: string;
} {
  return isAppId(kind)
    ? { label: APPS[kind].label, glyph: APPS[kind].glyph }
    : UNKNOWN_DISPLAY;
}

export type { AppDescriptor, AppDocument, AppId, HomeCard } from "./types";
