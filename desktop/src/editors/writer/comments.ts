/**
 * Bình luận ghim vào văn bản.
 *
 * Một bình luận gồm hai phần:
 *  - mark `comment` ghim vào đúng đoạn văn bản được bình luận,
 *  - nội dung bình luận (người viết, lời nhắn, thời điểm) nằm trong danh
 *    sách `comments` cạnh nội dung tài liệu, giống `pageSetup`.
 *
 * Vì sao tách vậy? Vị trí ghim nằm trong chính cây tài liệu nên tự di chuyển
 * theo văn bản khi người dùng sửa — không phải tự ánh xạ vị trí sau mỗi lần
 * gõ. Phần nội dung thì không cần nằm trong cây tài liệu, nên để ngoài cho
 * gọn.
 */

import type { Node as PMNode } from "prosemirror-model";
import { isRecord } from "@vietdesk/ipc-contract";
import { writerSchema } from "./schema";

export interface WriterComment {
  /** Mã định danh, trùng với `id` của mark ghim trong văn bản. */
  id: string;
  /** Người viết bình luận. */
  author: string;
  /** Lời nhắn. */
  text: string;
  /** Trích đoạn văn bản được bình luận (để đọc lại khi không mở văn bản). */
  quote: string;
  /** Unix epoch milliseconds. */
  createdAt: number;
}

/** Độ dài tối đa của lời nhắn. */
export const MAX_COMMENT_TEXT = 2000;

/** Độ dài tối đa của trích đoạn. */
export const MAX_COMMENT_QUOTE = 300;

/** Số bình luận tối đa giữ trong một tài liệu. */
export const MAX_COMMENTS = 500;

function readText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

/** Chuẩn hoá danh sách bình luận từ dữ liệu đọc được; bỏ qua phần tử lạ. */
export function normalizeComments(value: unknown): WriterComment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const comments: WriterComment[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const id = readText(item.id, 64);
    const text = readText(item.text, MAX_COMMENT_TEXT);
    if (!id || !text.trim()) {
      continue;
    }
    const createdAt = Number(item.createdAt);
    comments.push({
      id,
      author: readText(item.author, 80) || "Tác giả",
      text,
      quote: readText(item.quote, MAX_COMMENT_QUOTE),
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    });
    if (comments.length >= MAX_COMMENTS) {
      break;
    }
  }
  return comments;
}

/** Đọc danh sách bình luận ra khỏi nội dung tài liệu Writer. */
export function readComments(content: unknown): WriterComment[] {
  if (isRecord(content)) {
    return normalizeComments(content.comments);
  }
  return [];
}

/** Sinh mã định danh cho bình luận mới. */
export function createCommentId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Định dạng thời điểm của bình luận theo lịch Việt Nam. */
export function formatCommentTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

/**
 * Vị trí trong tài liệu đang ghim bình luận `id`.
 *
 * Trả về null nếu bình luận không còn ghim vào đâu (ví dụ văn bản đã bị xoá).
 */
export function findCommentRange(
  doc: PMNode,
  id: string,
): { from: number; to: number } | null {
  let range: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (!node.isText) {
      return true;
    }
    const mark = node.marks.find(
      (item) =>
        item.type === writerSchema.marks.comment && item.attrs.id === id,
    );
    if (mark) {
      if (range) {
        range.to = pos + node.nodeSize;
      } else {
        range = { from: pos, to: pos + node.nodeSize };
      }
    }
    return false;
  });
  return range;
}
