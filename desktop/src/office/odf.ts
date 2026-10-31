/**
 * Chuyển định dạng chuẩn mở OpenDocument (.odt/.ods/.odp) sang mô hình nội bộ.
 *
 * ODF dùng namespace `text:`/`table:`/`draw:`. Chỉ đọc phần văn bản: tiêu đề
 * (text:h), đoạn (text:p), danh sách (text:list), bảng tính (table:table-cell)
 * và khung chữ trên slide (draw:frame). Bỏ qua style, chú thích, hình khối.
 */

import { entryText, type ZipArchive } from "./zip";
import { attr, child, children, parseXml } from "./xml";

interface MarkJson {
  type: string;
  attrs?: Record<string, unknown>;
}
interface NodeJson {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NodeJson[];
  marks?: MarkJson[];
  text?: string;
}

/** Văn bản của một text:p, xử lý text:span (đậm/nghiêng), text:s, text:tab, text:linebreak. */
function inlineFromSpan(element: Element, marks: MarkJson[]): NodeJson[] {
  const nodes: NodeJson[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    nodes.push(marks.length ? { type: "text", text, marks } : { type: "text", text });
  };

  for (const node of [...element.childNodes]) {
    if (node.nodeType === 3) {
      pushText(node.textContent ?? "");
      continue;
    }
    if (node.nodeType !== 1) continue;
    const tag = (node as Element).localName;
    if (tag === "s") {
      pushText(" ");
    } else if (tag === "tab") {
      pushText("\t");
    } else if (tag === "linebreak" || tag === "soft-hyphen") {
      if (tag === "linebreak") nodes.push({ type: "hard_break" });
    } else if (tag === "span" || tag === "hyperlink") {
      const span = node as Element;
      const style = attr(span, "style-name");
      const nested = [...marks];
      if (style && /bold/i.test(style)) nested.push({ type: "strong" });
      if (style && /italic/i.test(style)) nested.push({ type: "em" });
      const href = tag === "hyperlink" ? span.getAttribute("xlink:href") : null;
      if (href) nested.push({ type: "link", attrs: { href, title: null } });
      nodes.push(...inlineFromSpan(span, nested));
    } else {
      nodes.push(...inlineFromSpan(node as Element, marks));
    }
  }
  return nodes;
}

function paragraphNode(paragraph: Element): NodeJson {
  const inline = inlineFromSpan(paragraph, []);
  return { type: "paragraph", ...(inline.length ? { content: inline } : {}) };
}

function listBlocks(list: Element, ordered: boolean): NodeJson {
  const items: NodeJson[] = [];
  for (const item of children(list, "list-item")) {
    const blocks: NodeJson[] = [];
    for (const block of [...item.children]) {
      if (block.localName === "p") blocks.push(paragraphNode(block));
      else if (block.localName === "h") {
        blocks.push({
          type: "heading",
          attrs: { level: Math.min(Number(attr(block, "outline-level")) || 1, 6) },
          content: inlineFromSpan(block, []),
        });
      } else if (block.localName === "list") {
        blocks.push(listBlocks(block, attr(block, "style-name")?.includes("Number") ?? false));
      }
    }
    if (blocks.length === 0) blocks.push({ type: "paragraph" });
    items.push({ type: "list_item", content: blocks });
  }
  return { type: ordered ? "ordered_list" : "bullet_list", content: items };
}

/** text:p / text:h / text:list → mảng block Writer. */
function blocksFromContainer(container: Element): NodeJson[] {
  const blocks: NodeJson[] = [];
  for (const node of [...container.children]) {
    if (node.localName === "p") {
      blocks.push(paragraphNode(node));
    } else if (node.localName === "h") {
      const level = Number(attr(node, "outline-level"));
      blocks.push({
        type: "heading",
        attrs: { level: Number.isFinite(level) ? Math.min(Math.max(level, 1), 6) : 1 },
        content: inlineFromSpan(node, []),
      });
    } else if (node.localName === "list") {
      blocks.push(listBlocks(node, attr(node, "style-name")?.includes("Number") ?? false));
    }
  }
  return blocks;
}

function contentRoot(zip: ZipArchive): Element {
  return parseXml(entryText(zip.read("content.xml")), "content.xml");
}

/** .odt → JSON văn bản của Writer. */
export function convertOdt(zip: ZipArchive): Record<string, unknown> {
  const root = contentRoot(zip);
  const body = child(root, "body");
  const text = body ? child(body, "text") : null;
  const blocks = text ? blocksFromContainer(text) : [];
  if (blocks.length === 0) blocks.push({ type: "paragraph" });
  return { type: "doc", content: blocks };
}

/** .ods → `{ cells }` của Sheets (bảng đầu tiên). */
export function convertOds(zip: ZipArchive): { cells: Record<string, string> } {
  const root = contentRoot(zip);
  const spreadsheet = child(child(root, "body") ?? root, "spreadsheet");
  const table = spreadsheet ? child(spreadsheet, "table") : null;
  const cells: Record<string, string> = {};
  if (!table) return { cells };

  const columnLabel = (index: number): string => {
    let name = "";
    let remaining = index + 1;
    while (remaining > 0) {
      remaining -= 1;
      name = String.fromCharCode(65 + (remaining % 26)) + name;
      remaining = Math.floor(remaining / 26);
    }
    return name;
  };

  let rowIndex = 0;
  for (const row of children(table, "table-row")) {
    const repeat = Math.min(Number(attr(row, "number-rows-repeated")) || 1, 5000);
    if (repeat > 1 && children(row, "table-cell").length === 0) {
      rowIndex += repeat;
      continue;
    }
    // Hàng trống lặp nhiều → nhảy dòng; hàng có nội dung → xử lý từng dòng một.
    for (let copy = 0; copy < repeat; copy += 1) {
      rowIndex += 1;
      let columnIndex = 0;
      for (const cell of children(row, "table-cell")) {
        const cellRepeat = Math.min(Number(attr(cell, "number-columns-repeated")) || 1, 1024);
        const paragraphs = children(cell, "p").map((p) => textOf(p));
        const value = paragraphs.join(" ").trim();
        for (let step = 0; step < cellRepeat; step += 1) {
          if (value) cells[`${columnLabel(columnIndex)}${rowIndex}`] = value;
          columnIndex += 1;
        }
      }
    }
  }
  return { cells };
}

/** .odp → `{ slides }` của Slides. */
export function convertOdp(zip: ZipArchive): {
  slides: { id: string; title: string; body: string }[];
} {
  const root = contentRoot(zip);
  const presentation = child(child(root, "body") ?? root, "presentation");
  const slides: { id: string; title: string; body: string }[] = [];
  if (!presentation) return { slides };

  let index = 0;
  for (const page of children(presentation, "page")) {
    index += 1;
    const lines: string[] = [];
    for (const frame of children(page, "frame")) {
      const box = child(frame, "text-box");
      if (!box) continue;
      for (const node of [...box.children]) {
        if (node.localName === "p" || node.localName === "h") {
          const text = textOf(node).trim();
          if (text) lines.push(text);
        }
      }
    }
    slides.push({
      id: `slide-odp-${index}`,
      title: lines[0] ?? `Trang chiếu ${index}`,
      body: lines.slice(1).join("\n"),
    });
  }
  if (slides.length === 0) {
    throw new Error("Tệp trình chiếu không có trang nào.");
  }
  return { slides };
}

function textOf(element: Element): string {
  return element.textContent ?? "";
}
