/**
 * Bảng điều hướng cấu trúc tài liệu (outline).
 *
 * Thu thập mọi khối tiêu đề theo đúng thứ tự xuất hiện trong tài liệu, kèm
 * vị trí node để người dùng bấm là nhảy tới tiêu đề đó.
 *
 * Cùng nguyên tắc với tìm kiếm: chỉ lấy nội dung của chính node tiêu đề,
 * không lấy nội dung của các node con (tiêu đề không chứa block con).
 */
import type { Node as PMNode } from "prosemirror-model";

export interface OutlineEntry {
  /** Cấp tiêu đề, chuẩn hoá về khoảng 1..6. */
  level: number;
  /** Nội dung tiêu đề đã cắt khoảng trắng thừa. */
  text: string;
  /** Vị trí node tiêu đề trong document (dùng để đặt con trỏ). */
  pos: number;
}

/** Chuẩn hoá cấp tiêu đề về khoảng 1..6. */
function normalizeLevel(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.min(Math.max(Math.round(numeric), 1), 6);
}

/**
 * Lấy danh sách tiêu đề của tài liệu.
 *
 * @param doc cây ProseMirror hiện tại.
 */
export function collectOutline(doc: PMNode): OutlineEntry[] {
  const entries: OutlineEntry[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") {
      return true;
    }
    entries.push({
      level: normalizeLevel(node.attrs.level),
      text: node.textContent.trim() || "Tiêu đề trống",
      pos,
    });
    // Tiêu đề không chứa khối con — không cần đi sâu thêm.
    return false;
  });

  return entries;
}

/**
 * Chỉ số của tiêu đề đang được con trỏ nằm trong (hoặc ngay trước vị trí con
 * trỏ). Trả về -1 nếu con trỏ không nằm trong vùng tiêu đề nào.
 */
export function activeOutlineIndex(
  entries: OutlineEntry[],
  selectionPos: number,
): number {
  let active = -1;
  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index].pos <= selectionPos) {
      active = index;
    } else {
      break;
    }
  }
  return active;
}
