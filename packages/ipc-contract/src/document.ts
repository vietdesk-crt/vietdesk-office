/**
 * Định dạng tài liệu gốc của VietDesk (`.vdx`).
 *
 * Đây là JSON có bao (envelope) để sau này engine OOXML có thể ánh xạ vào mà
 * không phải đổi cấu trúc lưu trữ. Mọi tài liệu — Writer, Sheets, Slides —
 * dùng chung một bao, chỉ khác phần `content`:
 *
 * ```json
 * {
 *   "format": "vietdesk.document",
 *   "version": 1,
 *   "kind": "writer",
 *   "meta": { "title": "Báo cáo", "createdAt": 0, "updatedAt": 0 },
 *   "content": { "type": "doc", "content": [] }
 * }
 * ```
 *
 * Quy tắc: KHÔNG đổi `format`/`version` khi chỉ thêm trường vào `content`;
 * chỉ tăng `version` khi thay đổi cấu trúc bao hoặc ngữ nghĩa nội dung.
 */

export const DOCUMENT_FORMAT = "vietdesk.document";
export const DOCUMENT_VERSION = 1;
export const DOCUMENT_EXTENSION = "vdx";

export type DocumentType = "writer" | "sheets" | "slides";

export interface DocumentMeta {
  title: string;
  /** Unix epoch milliseconds. */
  createdAt: number;
  /** Unix epoch milliseconds. */
  updatedAt: number;
}

export interface DocumentEnvelope<Content = unknown> {
  format: typeof DOCUMENT_FORMAT;
  version: number;
  kind: DocumentType;
  meta: DocumentMeta;
  content: Content;
}

export class DocumentFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentFormatError";
  }
}

const KINDS: readonly DocumentType[] = ["writer", "sheets", "slides"];

/** Tệp có phải định dạng gốc của VietDesk không? */
export function isVietDeskDocument(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(`.${DOCUMENT_EXTENSION}`);
}

/** Tên tệp gợi ý khi lưu, đã bỏ ký tự cấm của Windows/macOS/Linux. */
export function documentFileName(title: string): string {
  const trimmed = title.trim();
  if (isVietDeskDocument(trimmed)) {
    return trimmed;
  }
  const safe = trimmed
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "Tài liệu"}.${DOCUMENT_EXTENSION}`;
}

/** Bỏ đuôi `.vdx` để hiển thị tên tài liệu. */
export function documentTitleFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return base.replace(/\.vdx$/i, "");
}

export function createDocumentEnvelope<Content>(
  kind: DocumentType,
  title: string,
  content: Content,
  now = Date.now(),
): DocumentEnvelope<Content> {
  return {
    format: DOCUMENT_FORMAT,
    version: DOCUMENT_VERSION,
    kind,
    meta: { title, createdAt: now, updatedAt: now },
    content,
  };
}

export function serializeDocument(envelope: DocumentEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Đọc và kiểm tra một tệp `.vdx`.
 * Ném `DocumentFormatError` với thông báo tiếng Việt để hiển thị thẳng cho người dùng.
 */
export function parseDocument(text: string, now = Date.now()): DocumentEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DocumentFormatError("Tệp không phải JSON hợp lệ.");
  }

  if (!isRecord(raw)) {
    throw new DocumentFormatError("Nội dung tệp không phải một đối tượng.");
  }
  if (raw.format !== DOCUMENT_FORMAT) {
    throw new DocumentFormatError("Đây không phải tài liệu VietDesk (.vdx).");
  }

  const version = raw.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new DocumentFormatError("Tệp thiếu phiên bản định dạng hợp lệ.");
  }
  if (version > DOCUMENT_VERSION) {
    throw new DocumentFormatError(
      `Tài liệu được tạo bởi phiên bản VietDesk mới hơn (v${version}). Hãy cập nhật ứng dụng.`,
    );
  }
  if (!KINDS.includes(raw.kind as DocumentType)) {
    throw new DocumentFormatError("Loại tài liệu không được hỗ trợ.");
  }
  if (raw.content === null || raw.content === undefined) {
    throw new DocumentFormatError("Tài liệu không có nội dung.");
  }

  const meta = isRecord(raw.meta) ? raw.meta : {};
  const title =
    typeof meta.title === "string" && meta.title.trim()
      ? meta.title
      : "Tài liệu không tên";

  return {
    format: DOCUMENT_FORMAT,
    version,
    kind: raw.kind as DocumentType,
    meta: {
      title,
      createdAt: readTimestamp(meta.createdAt, now),
      updatedAt: readTimestamp(meta.updatedAt, now),
    },
    content: raw.content,
  };
}
