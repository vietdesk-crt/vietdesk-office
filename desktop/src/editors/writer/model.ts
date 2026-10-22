/**
 * Mô hình nội dung của Writer.
 *
 * Nội dung lưu trong `.vdx` là ProseMirror JSON kèm hai trường phụ:
 * `pageSetup` (đầu trang/chân trang) và `comments` (bình luận). Mọi dữ liệu
 * đọc từ đĩa hoặc bản nháp đều đi qua `normalizeWriterContent` trước khi vào
 * editor, nên phần còn lại của ứng dụng không phải tự kiểm tra từng trường.
 */
import type { Node as PMNode } from "prosemirror-model";
import { readComments } from "./comments";
import { DEFAULT_PAGE_SETUP, readPageSetup } from "./page";
import { writerSchema } from "./schema";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Nội dung ProseMirror của một văn bản trống (dùng làm mặc định khi lưu). */
export function createEmptyWriterDocument(): unknown {
  const doc = writerSchema.node("doc", null, [
    writerSchema.node("paragraph"),
  ]);
  return {
    ...doc.toJSON(),
    pageSetup: { ...DEFAULT_PAGE_SETUP },
    comments: [],
  };
}

function restoredDocument(value: Record<string, unknown>): PMNode | null {
  try {
    return writerSchema.nodeFromJSON(
      value as Parameters<typeof writerSchema.nodeFromJSON>[0],
    );
  } catch {
    return null;
  }
}

/**
 * Chuẩn hoá nội dung Writer đọc từ `.vdx` hoặc bản nháp.
 *
 * Dữ liệu hỏng được thay bằng văn bản trống thay vì làm sập trình soạn thảo;
 * các trường phụ (`pageSetup`, `comments`) cũng được đưa về đúng kiểu.
 */
export function normalizeWriterContent(value: unknown): unknown {
  if (!isRecord(value) || value.type !== "doc") {
    return createEmptyWriterDocument();
  }

  const doc = restoredDocument(value);
  if (!doc) {
    return createEmptyWriterDocument();
  }

  return {
    ...doc.toJSON(),
    pageSetup: readPageSetup(value),
    comments: readComments(value),
  };
}
