/**
 * Chuyển `.docx` (Word / Google Docs / LibreOffice) sang ProseMirror JSON.
 *
 * Phạm vi: đoạn văn, tiêu đề, in đậm/nghiêng/gạch chân/gạch ngang, chỉ số
 * trên/dưới, màu chữ, cỡ chữ, liên kết, danh sách (gạch đầu dòng/đánh số),
 * bảng, ngắt dòng, ngắt trang, ảnh chèn (nhúng data URL). Bỏ qua: header/
 * footer, chú thích, khung nổi, hợp nhất ô, cột nhiều khối.
 */

import { entryText, type ZipArchive } from "./zip";
import { bytesToBase64 } from "./base64";
import { attr, child, children, descendants, parseXml } from "./xml";

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

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

const HEADING_STYLE = /^[Hh]eading\s*([1-9])$/;
const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;

/** Quan hệ r:id → đích (word/_rels/document.xml.rels). */
function readRelationships(zip: ZipArchive, relsPath: string): Map<string, string> {
  const map = new Map<string, string>();
  const entry = zip.readOptional(relsPath);
  if (!entry) return map;
  const root = parseXml(entryText(entry), relsPath);
  for (const node of [...root.getElementsByTagNameNS("*", "Relationship")]) {
    const id = node.getAttribute("Id");
    const target = node.getAttribute("Target");
    if (id && target) {
      map.set(id, target.replace(/^\//, ""));
    }
  }
  return map;
}

/** numId (numbering.xml) → "bullet" | "decimal" — chỉ xét cấp 0. */
function readNumberingFormats(zip: ZipArchive): Map<string, string> {
  const formats = new Map<string, string>();
  const entry = zip.readOptional("word/numbering.xml");
  if (!entry) return formats;
  const root = parseXml(entryText(entry), "word/numbering.xml");

  const abstractFormats = new Map<string, string>();
  for (const abstractNum of [...root.getElementsByTagNameNS("*", "abstractNum")]) {
    const id = attr(abstractNum, "abstractNumId");
    const level = abstractNum.getElementsByTagNameNS("*", "lvl")[0];
    const fmt = level ? attr(level, "numFmt") : null;
    if (id) abstractFormats.set(id, fmt === "decimal" ? "decimal" : "bullet");
  }
  for (const num of [...root.getElementsByTagNameNS("*", "num")]) {
    const id = attr(num, "numId");
    const abstract = child(num, "abstractNumId");
    const abstractId = abstract ? attr(abstract, "val") : null;
    if (id && abstractId) {
      formats.set(id, abstractFormats.get(abstractId) ?? "bullet");
    }
  }
  return formats;
}

function marksFromRunProperties(
  runProperties: Element | null,
  hyperlink: string | null,
): MarkJson[] {
  const marks: MarkJson[] = [];
  if (!runProperties) {
    if (hyperlink) marks.push(linkMark(hyperlink));
    return marks;
  }
  if (child(runProperties, "b")) marks.push({ type: "strong" });
  if (child(runProperties, "i")) marks.push({ type: "em" });
  const underline = child(runProperties, "u");
  const underlineValue = underline ? attr(underline, "val") : null;
  if (underline && underlineValue !== "none" && underlineValue !== "0") {
    marks.push({ type: "underline" });
  }
  if (child(runProperties, "strike") || child(runProperties, "dstrike")) {
    marks.push({ type: "strike" });
  }
  const vertical = child(runProperties, "vertAlign");
  const verticalValue = vertical ? attr(vertical, "val") : null;
  if (verticalValue === "superscript") marks.push({ type: "superscript" });
  if (verticalValue === "subscript") marks.push({ type: "subscript" });
  const color = child(runProperties, "color");
  const colorValue = color ? attr(color, "val") : null;
  if (colorValue && /^[0-9a-fA-F]{6}$/.test(colorValue)) {
    marks.push({ type: "textColor", attrs: { color: `#${colorValue.toLowerCase()}` } });
  }
  const size = child(runProperties, "sz");
  const sizeValue = size ? attr(size, "val") : null;
  const points = Number(sizeValue);
  if (sizeValue && Number.isFinite(points) && points > 0 && points <= 200) {
    marks.push({ type: "fontSize", attrs: { size: `${points / 2}pt` } });
  }
  if (hyperlink) marks.push(linkMark(hyperlink));
  return marks;
}

function linkMark(href: string): MarkJson {
  return { type: "link", attrs: { href, title: null } };
}

/** Ảnh trong media/ → data URL (tệp đã mở thì ảnh đi kèm). */
function imageSource(
  zip: ZipArchive,
  relationships: Map<string, string>,
  relationshipId: string | null,
): string | null {
  if (!relationshipId) return null;
  const target = relationships.get(relationshipId);
  if (!target) return null;
  const path = target.startsWith("word/") ? target : `word/${target}`;
  const entry = zip.readOptional(path);
  if (!entry || entry.bytes.length > MAX_INLINE_IMAGE_BYTES) return null;
  const extension = path.split(".").pop()?.toLowerCase() ?? "png";
  const mime = IMAGE_MIME[extension] ?? "image/png";
  return `data:${mime};base64,${bytesToBase64(entry.bytes)}`;
}

function drawingImage(
  zip: ZipArchive,
  relationships: Map<string, string>,
  drawing: Element,
): NodeJson | null {
  const blip = drawing.getElementsByTagNameNS("*", "blip")[0];
  const embed = blip ? blip.getAttribute("r:embed") : null;
  const src = imageSource(zip, relationships, embed);
  if (!src) return null;

  let width: number | null = null;
  let height: number | null = null;
  const extent = drawing.getElementsByTagNameNS("*", "extent")[0];
  if (extent) {
    // Đơn vị EMU: 1 px = 9525 EMU (96 dpi).
    const emuToPx = (value: string | null): number | null => {
      const emu = Number(value);
      return value && Number.isFinite(emu) && emu > 0
        ? Math.round(emu / 9525)
        : null;
    };
    width = emuToPx(extent.getAttribute("cx"));
    height = emuToPx(extent.getAttribute("cy"));
  }
  return {
    type: "image",
    attrs: {
      src,
      alt: "",
      width: width && width >= 16 && width <= 4000 ? width : null,
      height: height && height >= 16 && height <= 4000 ? height : null,
    },
  };
}

function runToInline(
  zip: ZipArchive,
  relationships: Map<string, string>,
  run: Element,
  hyperlink: string | null,
): NodeJson[] {
  const properties = child(run, "rPr");
  const marks = marksFromRunProperties(properties, hyperlink);
  const nodes: NodeJson[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    nodes.push(marks.length ? { type: "text", text, marks } : { type: "text", text });
  };

  for (const node of [...run.children]) {
    if (node.localName === "t") {
      pushText(node.textContent ?? "");
    } else if (node.localName === "tab") {
      pushText("\t");
    } else if (node.localName === "br") {
      const breakType = attr(node, "type");
      if (breakType === "page") {
        nodes.push({ type: "hard_break" });
      } else {
        nodes.push({ type: "hard_break" });
      }
    } else if (node.localName === "drawing" || node.localName === "pict") {
      const image = drawingImage(zip, relationships, node);
      if (image) nodes.push(image);
    }
  }
  return nodes;
}

/** Cấp tiêu đề từ tên style: "Heading1", "heading 2", "Title", "1". */
function headingLevel(paragraph: Element): number | null {
  const properties = child(paragraph, "pPr");
  const style = properties ? child(properties, "pStyle") : null;
  const value = style ? attr(style, "val") : null;
  if (!value) return null;
  const heading = HEADING_STYLE.exec(value.trim());
  if (heading) return Math.min(Number(heading[1]), 6);
  if (value === "Title") return 1;
  if (value === "Subtitle") return 2;
  if (/^[1-6]$/.test(value)) return Number(value);
  return null;
}

function paragraphAlign(paragraph: Element): string | null {
  const properties = child(paragraph, "pPr");
  const justification = properties ? child(properties, "jc") : null;
  const value = justification ? attr(justification, "val") : null;
  if (value === "left" || value === "center" || value === "right") return value;
  if (value === "both" || value === "distribute") return "justify";
  return null;
}

function paragraphNumbering(paragraph: Element): string | null {
  const properties = child(paragraph, "pPr");
  const numbering = properties ? child(properties, "numPr") : null;
  if (!numbering) return null;
  const id = child(numbering, "numId");
  return id ? attr(id, "val") : null;
}

interface ListState {
  ordered: boolean;
  items: NodeJson[];
}

function flushList(lists: NodeJson[], state: ListState | null): ListState | null {
  if (state && state.items.length > 0) {
    lists.push({
      type: state.ordered ? "ordered_list" : "bullet_list",
      content: state.items,
    });
  }
  return null;
}

function paragraphToItem(
  zip: ZipArchive,
  relationships: Map<string, string>,
  paragraph: Element,
  numbering: string | null,
): NodeJson {
  const inline: NodeJson[] = [];
  for (const node of [...paragraph.children]) {
    if (node.localName === "r") {
      inline.push(...runToInline(zip, relationships, node, null));
    } else if (node.localName === "hyperlink") {
      const relationshipId = node.getAttribute("r:id");
      const anchor = node.getAttribute("anchor");
      const href =
        (relationshipId && relationships.get(relationshipId)) ||
        (anchor ? `#${anchor}` : null);
      for (const run of children(node, "r")) {
        inline.push(...runToInline(zip, relationships, run, href));
      }
    } else if (node.localName === "bookmarkStart" || node.localName === "bookmarkEnd") {
      continue;
    }
  }

  const align = paragraphAlign(paragraph);
  const attrs: Record<string, unknown> = {};
  if (align) attrs.align = align;
  const level = numbering === null ? headingLevel(paragraph) : null;
  if (level) {
    return {
      type: "heading",
      attrs: { level },
      ...(inline.length ? { content: inline } : {}),
    };
  }
  return {
    type: "paragraph",
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(inline.length ? { content: inline } : {}),
  };
}

/** w:tbl → node table; hàng đầu tiên thành hàng tiêu đề. */
function tableToNode(
  zip: ZipArchive,
  relationships: Map<string, string>,
  table: Element,
): NodeJson {
  const rows: NodeJson[] = [];
  children(table, "tr").forEach((row, rowIndex) => {
    const cells: NodeJson[] = [];
    for (const cell of children(row, "tc")) {
      const blocks: NodeJson[] = [];
      for (const block of [...cell.children]) {
        if (block.localName === "p") {
          blocks.push(paragraphToItem(zip, relationships, block, null));
        } else if (block.localName === "tbl") {
          blocks.push(tableToNode(zip, relationships, block));
        }
      }
      if (blocks.length === 0) blocks.push({ type: "paragraph" });
      cells.push({
        type: rowIndex === 0 ? "table_header" : "table_cell",
        content: blocks,
      });
    }
    if (cells.length > 0) {
      rows.push({ type: "table_row", content: cells });
    }
  });
  return { type: "table", content: rows };
}

/** Chuyển toàn bộ tệp .docx (ZIP) sang ProseMirror JSON của Writer. */
export function convertDocx(zip: ZipArchive): Record<string, unknown> {
  const documentEntry = zip.read("word/document.xml");
  const root = parseXml(entryText(documentEntry), "word/document.xml");
  const body = child(root, "body") ?? root;
  const relationships = readRelationships(zip, "word/_rels/document.xml.rels");
  const numberingFormats = readNumberingFormats(zip);

  const blocks: NodeJson[] = [];
  const listState: { current: ListState | null } = { current: null };

  for (const node of [...body.children]) {
    if (node.localName === "p") {
      const numbering = paragraphNumbering(node);
      if (numbering) {
        const ordered = numberingFormats.get(numbering) === "decimal";
        if (!listState.current || listState.current.ordered !== ordered) {
          listState.current = flushList(blocks, listState.current);
          listState.current = { ordered, items: [] };
        }
        listState.current.items.push({
          type: "list_item",
          content: [paragraphToItem(zip, relationships, node, numbering)],
        });
      } else {
        listState.current = flushList(blocks, listState.current);

        // Ngắt trang tự nhiên: đoạn chỉ chứa w:br type="page".
        const properties = child(node, "pPr");
        const hasPageBreakBefore =
          properties && child(properties, "pageBreakBefore");
        if (hasPageBreakBefore) blocks.push({ type: "page_break" });

        const item = paragraphToItem(zip, relationships, node, null);
        blocks.push(item);

        if (
          properties &&
          descendants(node, "br").some((br) => attr(br, "type") === "page")
        ) {
          blocks.push({ type: "page_break" });
        }
      }
    } else if (node.localName === "tbl") {
      listState.current = flushList(blocks, listState.current);
      blocks.push(tableToNode(zip, relationships, node));
    } else if (node.localName === "sdt") {
      // Khối điều khiển nội dung (mục lục, v.v.) — lấy phần nội dung bên trong.
      const content = child(node, "sdtContent");
      if (content) {
        for (const inner of [...content.children]) {
          if (inner.localName === "p") {
            blocks.push(paragraphToItem(zip, relationships, inner, null));
          } else if (inner.localName === "tbl") {
            blocks.push(tableToNode(zip, relationships, inner));
          }
        }
      }
    }
  }
  flushList(blocks, listState.current);

  if (blocks.length === 0) {
    blocks.push({ type: "paragraph" });
  }
  return { type: "doc", content: blocks };
}

