/**
 * Tìm kiếm văn bản trong tài liệu ProseMirror.
 *
 * Tìm trong từng block (đoạn văn, tiêu đề, mục danh sách) để kết quả không
 * vắt qua ranh giới đoạn. Vị trí trả về là vị trí tuyệt đối trong document,
 * dùng trực tiếp cho TextSelection và transaction thay thế.
 */
import type { Node as PMNode } from "prosemirror-model";

export interface SearchMatch {
  from: number;
  to: number;
}

interface TextSegment {
  /** Vị trí bắt đầu/kết thúc trong document. */
  from: number;
  to: number;
  /** Vị trí trong chuỗi văn bản của block. */
  start: number;
  end: number;
}

interface TextBlock {
  text: string;
  segments: TextSegment[];
}

function collectBlockText(block: PMNode, blockPos: number): TextBlock {
  let text = "";
  const segments: TextSegment[] = [];

  block.descendants((node, pos) => {
    if (node.isText && node.text) {
      // `pos` của text node là tương đối so với block; nội dung block bắt đầu
      // tại blockPos + 1 (sau token mở node).
      const from = blockPos + 1 + pos;
      segments.push({
        from,
        to: from + node.text.length,
        start: text.length,
        end: text.length + node.text.length,
      });
      text += node.text;
    }
    return true;
  });

  return { text, segments };
}

function collectBlocks(doc: PMNode): TextBlock[] {
  const blocks: TextBlock[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      blocks.push(collectBlockText(node, pos));
      // Không đi xuống text node nữa — đã gom trong collectBlockText.
      return false;
    }
    return true;
  });
  return blocks;
}

function mapStart(block: TextBlock, offset: number): number | null {
  for (const segment of block.segments) {
    if (offset >= segment.start && offset < segment.end) {
      return segment.from + (offset - segment.start);
    }
    if (offset === segment.end) {
      continue; // điểm nối: thuộc text node kế tiếp
    }
  }
  return block.segments.at(-1)?.to ?? null;
}

function mapEnd(block: TextBlock, offset: number): number | null {
  for (const segment of block.segments) {
    if (offset > segment.start && offset <= segment.end) {
      return segment.from + (offset - segment.start);
    }
  }
  return null;
}

/**
 * Tìm tất cả kết quả không chồng nhau.
 *
 * @param caseSensitive mặc định không phân biệt hoa/thường (theo locale vi).
 */
export function findMatches(
  doc: PMNode,
  query: string,
  caseSensitive = false,
): SearchMatch[] {
  if (!query) {
    return [];
  }

  const needle = caseSensitive ? query : query.toLocaleLowerCase("vi");
  const matches: SearchMatch[] = [];

  for (const block of collectBlocks(doc)) {
    if (!block.text) {
      continue;
    }
    const haystack = caseSensitive
      ? block.text
      : block.text.toLocaleLowerCase("vi");

    let index = 0;
    while (index <= haystack.length - needle.length) {
      const found = haystack.indexOf(needle, index);
      if (found === -1) {
        break;
      }
      const from = mapStart(block, found);
      const to = mapEnd(block, found + needle.length);
      if (from !== null && to !== null && to > from) {
        matches.push({ from, to });
      }
      index = found + needle.length;
    }
  }

  return matches;
}
