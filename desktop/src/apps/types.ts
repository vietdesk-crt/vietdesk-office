import type { DocumentType } from "@vietdesk/ipc-contract";
import type { ReactNode } from "react";

/** Ba ứng dụng tạo được tài liệu mới. Trùng với `DocumentType` của định dạng `.vdx`. */
export type AppId = DocumentType;

/** Phần trạng thái của một tài liệu mà adapter của từng ứng dụng cần. */
export interface AppDocument {
  name: string;
  /** Đường dẫn tệp trên đĩa; null khi tài liệu chưa lưu. */
  path: string | null;
  content: unknown;
  /** Tăng khi nạp tài liệu khác — dùng làm `key` để remount editor. */
  revision: number;
  dirty?: boolean;
  savedAt?: number | null;
  saveStatus?: string;
}

export interface EditorRenderOptions {
  document: AppDocument;
  onChange: (content: unknown) => void;
}

/** Nội dung thẻ "Tạo mới" trên trang chủ. */
export interface HomeCard {
  title: string;
  description: string;
  formats: string;
}

/**
 * Mô tả một ứng dụng.
 *
 * Mọi hiểu biết riêng về Writer/Sheets/Slides nằm trong descriptor tương ứng:
 * metadata hiển thị, nội dung mặc định, cách chuẩn hoá nội dung đọc từ đĩa và
 * cách chuyển trạng thái chung sang props của editor.
 */
export interface AppDescriptor {
  id: AppId;
  label: string;
  glyph: string;
  defaultName: string;
  home: HomeCard;
  createDefaultContent: () => unknown;
  normalizeContent: (value: unknown) => unknown;
  renderEditor: (options: EditorRenderOptions) => ReactNode;
}
