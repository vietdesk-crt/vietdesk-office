/**
 * Xuất tài liệu Writer sang `.docx` (WordprocessingML).
 *
 * Điểm mấu chót: người dùng nhận được tệp mở trực tiếp được trong MS Word và
 * Google Docs. Tệp là một ZIP gồm vài phần XML tối thiểu; chúng ta không nén
 * (chế độ "stored" của ZIP) nên không cần thêm thư viện nén.
 *
 * Giữ được: đoạn văn, tiêu đề (định dạng trực tiếp), in đậm/nghiêng/gạch dưới/
 * gạch ngang/trên chỉ/dưới chỉ, cỡ chữ, họ chữ, màu chữ, tô sáng, liên kết,
 * thụt lề, canh lề, giãn dòng, danh sách (gạch đầu dòng/thứ tự/việc cần làm),
 * bảng, ảnh nhúng (data URL), ngắt trang, kẻ ngang và khổ giấy A4 lề NĐ30.
 * Bình luận chưa mang sang bản DOCX — vẫn giữ nguyên trong `.vdx`.
 */
import type { Node as PMNode } from "prosemirror-model";
import { isRecord } from "@vietdesk/ipc-contract";
import { writerSchema } from "../editors/writer/schema";
import { readPageSetup } from "../editors/writer/page";
import { base64ToBytes, createZip, type ZipEntryInput } from "./binary";

/** 1 mm = 56.6929 twip (đơn vị đo của Word). */
const MM_TO_TWIP = 56.6929;

/** Mỗi cấp thụt lề ≈ 1,27 cm — khớp với nấc thụt lề trên màn hình. */
const INDENT_TWIPS_PER_LEVEL = 720;

/** Hệ số px → EMU (đơn vị vị trí ảnh của Word). */
const PX_TO_EMU = 9525;

/** numId của gạch đầu dòng và danh sách thứ tự (khai trong word/numbering.xml). */
const NUM_BULLET = 1;
const NUM_ORDERED = 2;

const MEDIA_TYPE_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

/** Bảng màu Word gần với bảng màu tô sáng của Writer. */
const HIGHLIGHT_NAMES: Record<string, string> = {
  FCF19D: "yellow",
  C6F0C0: "green",
  B4E1F5: "cyan",
  E1CDF6: "magenta",
  F6CFE1: "pink",
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** "12pt" → half-points (đơn vị w:sz của Word). */
function halfPointsFromSize(size: unknown): number | null {
  if (typeof size !== "string") {
    return null;
  }
  const match = /^([\d.]+)\s*pt$/.exec(size.trim());
  if (!match) {
    return null;
  }
  const points = Number(match[1]);
  return Number.isFinite(points) && points > 0 ? Math.round(points * 2) : null;
}

/** Họ chữ của Writer → họ Word phổ biến có sẵn trên máy. */
function wordFontFamily(family: string): string {
  if (/mono/i.test(family)) {
    return "Courier New";
  }
  if (/serif/i.test(family) && !/sans/i.test(family)) {
    return "Times New Roman";
  }
  return "Calibri";
}

function colorHex(color: unknown): string | null {
  if (typeof color !== "string") {
    return null;
  }
  const trimmed = color.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.slice(1).toUpperCase() : null;
}

interface RunStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  superscript: boolean;
  subscript: boolean;
  fontFamily?: string;
  fontSizeHalves?: number;
  color?: string;
  highlight?: string;
  href?: string;
}

function styleFromMarks(node: PMNode): RunStyle {
  const style: RunStyle = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    superscript: false,
    subscript: false,
  };
  node.marks.forEach((mark) => {
    const attrs = isRecord(mark.attrs) ? mark.attrs : {};
    switch (mark.type.name) {
      case "strong":
        style.bold = true;
        break;
      case "em":
        style.italic = true;
        break;
      case "underline":
        style.underline = true;
        break;
      case "strike":
        style.strike = true;
        break;
      case "superscript":
        style.superscript = true;
        break;
      case "subscript":
        style.subscript = true;
        break;
      case "fontFamily":
        if (typeof attrs.family === "string") {
          style.fontFamily = attrs.family;
        }
        break;
      case "fontSize":
        style.fontSizeHalves = halfPointsFromSize(attrs.size) ?? undefined;
        break;
      case "textColor":
        style.color = colorHex(attrs.color) ?? undefined;
        break;
      case "highlight":
        {
          const hex = colorHex(attrs.color);
          if (hex) {
            style.highlight = hex;
          }
        }
        break;
      case "link":
        if (typeof attrs.href === "string") {
          style.href = attrs.href;
        }
        break;
      default:
        // comment: bản DOCX chưa mang bình luận.
        break;
    }
  });
  return style;
}

/** Gộp mọi thuộc tính chữ vào một `w:rPr` — Word chấp nhận thứ tự tự do. */
function runPropsXml(style: RunStyle): string {
  const parts: string[] = [];
  if (style.bold) {
    parts.push("<w:b/>");
  }
  if (style.italic) {
    parts.push("<w:i/>");
  }
  if (style.underline) {
    parts.push('<w:u w:val="single"/>');
  }
  if (style.strike) {
    parts.push('<w:strike w:val="true"/>');
  }
  if (style.fontSizeHalves) {
    parts.push(
      `<w:sz w:val="${style.fontSizeHalves}"/><w:szCs w:val="${style.fontSizeHalves}"/>`,
    );
  }
  if (style.fontFamily) {
    const font = escapeXml(wordFontFamily(style.fontFamily));
    parts.push(`<w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>`);
  }
  if (style.color && style.color !== "14140F") {
    parts.push(`<w:color w:val="${style.color}"/>`);
  }
  if (style.highlight) {
    const named = HIGHLIGHT_NAMES[style.highlight] ?? "yellow";
    parts.push(`<w:highlight w:val="${named}"/>`);
  }
  if (style.superscript || style.subscript) {
    parts.push(
      `<w:vertAlign w:val="${style.superscript ? "superscript" : "subscript"}"/>`,
    );
  }
  return parts.length > 0 ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
}

/** Trạng thái gom trong một lần dựng tài liệu: liên kết + ảnh nhúng. */
interface Emitter {
  /** Liên kết ngoài: từng href cần một Relationship rIdH*. */
  links: string[];
  /** Ảnh nhúng: từng ảnh thành một tệp trong word/media/ + một rId. */
  images: { name: string; bytes: Uint8Array }[];
  /** Số thứ tự cho wp:docPr — mỗi ảnh cần một id duy nhất. */
  drawings: number;
}

function makeEmitter(): Emitter {
  return { links: [], images: [], drawings: 1 };
}

/** Ghi ảnh từ data URL; trả về rId, hoặc null nếu không mang được. */
function embedImage(emitter: Emitter, src: string): string | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(src.trim());
  if (!match) {
    // Ảnh trỏ tới tệp ngoài (assets/…) — chỉ mang được khi đã có data URL.
    return null;
  }
  const extension = MEDIA_TYPE_BY_MIME[match[1]];
  if (!extension) {
    return null;
  }
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(match[2]);
  } catch {
    return null;
  }
  const name = `image${emitter.images.length + 1}.${extension}`;
  emitter.images.push({ name, bytes });
  // rId1 là numbering → ảnh bắt đầu từ rId2.
  return `rId${emitter.images.length + 1}`;
}

function imageRunXml(node: PMNode, emitter: Emitter, relId: string): string {
  const attrs = node.attrs as Record<string, unknown>;
  const widthEmu = Math.max(1, Math.round(Number(attrs.width) || 0)) * PX_TO_EMU;
  const heightEmu = Math.max(1, Math.round(Number(attrs.height) || 0)) * PX_TO_EMU;
  const alt = escapeXml(String(attrs.alt ?? "Ảnh"));
  const drawingId = emitter.drawings++;
  return (
    `<w:r><w:rPr></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${widthEmu}" cy="${heightEmu}"/>` +
    `<wp:docPr id="${drawingId}" name="Hình ảnh" descr="${alt}"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

/** Nội dung trong dòng (chữ, ảnh, ngắt dòng) — trả XML của run. */
function inlineContentXml(node: PMNode, emitter: Emitter): string {
  if (node.isText && node.text) {
    const style = styleFromMarks(node);
    const inner = node.text
      .split("\n")
      .map((line) => `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
      .join("<w:br/>");
    const run = `<w:r>${runPropsXml(style)}${inner}</w:r>`;
    if (style.href) {
      let index = emitter.links.indexOf(style.href);
      if (index === -1) {
        index = emitter.links.length;
        emitter.links.push(style.href);
      }
      return `<w:hyperlink r:id="rIdH${index + 1}" w:history="1">${run}</w:hyperlink>`;
    }
    return run;
  }
  if (node.type.name === "image") {
    const attrs = node.attrs as Record<string, unknown>;
    const relId = embedImage(emitter, String(attrs.src ?? ""));
    if (relId === null) {
      // Không nhúng được: giữ chú thích để thông tin không lặn hoàn toàn.
      const alt = escapeXml(String(attrs.alt ?? ""));
      return `<w:r><w:rPr></w:rPr><w:t xml:space="preserve">[Ảnh: ${alt}]</w:t></w:r>`;
    }
    return imageRunXml(node, emitter, relId);
  }
  if (node.type.name === "hard_break") {
    return "<w:r><w:br/></w:r>";
  }
  return "";
}

// ============================ PHẦN THÂN TÀI LIỆU ============================

interface ParagraphAttrs {
  align: unknown;
  lineHeight: unknown;
  indent: number;
  firstLineIndent: number;
  /** 0 = đoạn thường; 1..6 = tiêu đề. */
  level: number;
}

function headingLevelOf(name: string, attrs: Record<string, unknown>): number {
  if (name !== "heading") {
    return 0;
  }
  const level = Number(attrs.level);
  return Math.min(Math.max(Number.isFinite(level) ? level : 1, 1), 6);
}

/** Cỡ chữ tiêu đề (pt) — khớp gần với màn hình Writer. */
const HEADING_SIZES: Record<number, number> = {
  1: 16,
  2: 14,
  3: 13,
  4: 12,
  5: 11,
  6: 11,
};

function paragraphPropsXml(
  attrs: ParagraphAttrs,
  numbering?: { id: number },
): string {
  const props: string[] = [];
  if (numbering) {
    props.push(
      `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numbering.id}"/></w:numPr>`,
    );
    // Danh sách lùi vào một nấc rồi lùi ngược "hanging" cho ký hiệu đầu dòng.
    const left = (Math.max(0, attrs.indent) + 1) * INDENT_TWIPS_PER_LEVEL;
    props.push(
      `<w:ind w:left="${left}" w:hanging="${INDENT_TWIPS_PER_LEVEL}"/>`,
    );
  } else if (attrs.indent > 0 || attrs.firstLineIndent > 0) {
    const parts: string[] = [];
    if (attrs.indent > 0) {
      parts.push(`w:left="${attrs.indent * INDENT_TWIPS_PER_LEVEL}"`);
    }
    if (attrs.firstLineIndent > 0) {
      parts.push(
        `w:firstLine="${attrs.firstLineIndent * INDENT_TWIPS_PER_LEVEL}"`,
      );
    }
    props.push(`<w:ind ${parts.join(" ")}/>`);
  }

  if (typeof attrs.align === "string") {
    const jc = attrs.align === "justify" ? "both" : attrs.align;
    if (jc === "center" || jc === "right" || jc === "both") {
      props.push(`<w:jc w:val="${jc}"/>`);
    }
  }
  if (typeof attrs.lineHeight === "number" && attrs.lineHeight > 0) {
    props.push(
      `<w:spacing w:line="${Math.round(attrs.lineHeight * 240)}" w:lineRule="auto"/>`,
    );
  }
  if (attrs.level >= 1 && attrs.level <= 6) {
    const size = Math.round(HEADING_SIZES[attrs.level] * 2);
    props.push(`<w:keepNext/><w:b/><w:sz w:val="${size}"/>`);
  }
  return props.length > 0 ? `<w:pPr>${props.join("")}</w:pPr>` : "";
}

function paragraphAttrsOf(node: PMNode): ParagraphAttrs {
  const attrs = node.attrs as Record<string, unknown>;
  return {
    align: attrs.align,
    lineHeight: attrs.lineHeight,
    indent: Number(attrs.indent) || 0,
    firstLineIndent: Number(attrs.firstLineIndent) || 0,
    level: headingLevelOf(node.type.name, attrs),
  };
}

/**
 * Một khối cấp cao nhất dạng "đoạn": paragraph, heading, ngắt trang, kẻ ngang.
 * `numbering` đặt khi khối nằm trong danh sách.
 */
function paragraphXml(
  node: PMNode,
  emitter: Emitter,
  numbering?: { id: number },
): string {
  if (node.type.name === "page_break") {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }
  if (node.type.name === "horizontal_rule") {
    return (
      "<w:p><w:pPr><w:pBdr>" +
      '<w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/>' +
      "</w:pBdr></w:pPr><w:r><w:t xml:space=\"preserve\"></w:t></w:r></w:p>"
    );
  }

  const props = paragraphPropsXml(paragraphAttrsOf(node), numbering);
  const inline: string[] = [];
  if (node.childCount === 0) {
    // Đoạn trống: giữ dòng trống đúng như trên màn hình.
    inline.push('<w:r><w:t xml:space="preserve"></w:t></w:r>');
  }
  node.content.forEach((child) => {
    if (child.isText || child.type.name === "image" || child.type.name === "hard_break") {
      inline.push(inlineContentXml(child, emitter));
    }
  });
  return `<w:p>${props}${inline.join("")}</w:p>`;
}

/** Run ô tick đặt trước nội dung của mục "việc cần làm". */
function tickRunXml(checked: boolean): string {
  return `<w:r><w:rPr></w:rPr><w:t xml:space="preserve">${checked ? "☑" : "☐"} </w:t></w:r>`;
}

/**
 * Một mục danh sách. Nội dung của `list_item`/`task_item` là các khối; khối
 * đầu nhận đánh số, các khối sau thành đoạn thường thụt lề.
 */
function listItemXml(node: PMNode, emitter: Emitter, numbering: { id: number }): string {
  const parts: string[] = [];
  let first = true;
  node.content.forEach((child) => {
    if (child.type.name === "paragraph" || child.type.name === "heading") {
      const xml = paragraphXml(child, emitter, first ? numbering : undefined);
      if (first && node.type.name === "task_item") {
        // Cắm ô tick ngay sau pPr — giữ an toàn khi không có pPr.
        const withProps = xml.startsWith("<w:p><w:pPr>");
        if (withProps) {
          const end = xml.indexOf("</w:pPr>") + "</w:pPr>".length;
          parts.push(xml.slice(0, end) + tickRunXml(node.attrs.checked === true) + xml.slice(end));
        } else {
          parts.push(xml.replace("<w:p>", `<w:p>${tickRunXml(node.attrs.checked === true)}`));
        }
      } else {
        parts.push(xml);
      }
    } else {
      // Danh sách lồng nhau: đánh số lại theo cùng numId (mức lồng sâu hơn
      // hiển thị trơn trong bản xuất này).
      parts.push(blocksXml(child, emitter));
    }
    first = false;
  });
  return parts.join("");
}

/** Bảng: mỗi tế bào là một <w:tc> chứa các đoạn nhỏ. */
function tableXml(node: PMNode, emitter: Emitter): string {
  const rows: string[] = [];
  node.content.forEach((row) => {
    const cells: string[] = [];
    row.content.forEach((cell) => {
      const header = cell.type.name === "table_header";
      const paragraphs: string[] = [];
      cell.content.forEach((block) => {
        if (block.type.name === "paragraph" || block.type.name === "heading") {
          paragraphs.push(paragraphXml(block, emitter));
        } else {
          paragraphs.push(blocksXml(block, emitter));
        }
      });
      if (paragraphs.length === 0) {
        paragraphs.push('<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>');
      }
      cells.push(
        `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>` +
          (header
            ? '<w:shd w:val="clear" w:fill="EDEDE8"/><w:tcBorders><w:bottom w:val="single" w:sz="12"/></w:tcBorders>'
            : "") +
          `</w:tcPr>${paragraphs.join("")}</w:tc>`,
      );
    });
    rows.push(`<w:tr>${cells.join("")}</w:tr>`);
  });

  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((edge) => `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`)
    .join("");
  return (
    "<w:tbl><w:tblPr>" +
    '<w:tblW w:w="0" w:type="auto"/>' +
    `<w:tblBorders>${borders}</w:tblBorders>` +
    "</w:tblPr>" +
    rows.join("") +
    "</w:tbl>" +
    // Pát "w:p" sau bảng theo đúng yêu cầu của chuẩn (bảng không đứng cuối).
    '<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>'
  );
}

/** Duyệt các khối cấp cao nhất (hoặc bất kỳ khối nào chứa khối con). */
function blocksXml(node: PMNode, emitter: Emitter): string {
  const parts: string[] = [];
  node.content.forEach((block) => {
    switch (block.type.name) {
      case "bullet_list":
        block.content.forEach((item) =>
          parts.push(listItemXml(item, emitter, { id: NUM_BULLET })),
        );
        break;
      case "ordered_list":
        block.content.forEach((item) =>
          parts.push(listItemXml(item, emitter, { id: NUM_ORDERED })),
        );
        break;
      case "task_list":
        block.content.forEach((item) =>
          parts.push(listItemXml(item, emitter, { id: NUM_BULLET })),
        );
        break;
      case "table":
        parts.push(tableXml(block, emitter));
        break;
      default:
        parts.push(paragraphXml(block, emitter));
        break;
    }
  });
  return parts.join("");
}

// ============================ PHẦN ĐÓNG GÓI ZIP ============================

function contentTypesXml(extensions: Set<string>): string {
  const defaults = [...extensions]
    .map(
      (extension) =>
        `<Default Extension="${extension}" ContentType="image/${extension === "jpg" ? "jpeg" : extension}"/>`,
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="http://schemas.openxmlformats.org/package/2006/relationships"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    defaults +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `</Types>`
  );
}

function rootRelsXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `</Relationships>`
  );
}

function documentRelsXml(emitter: Emitter): string {
  const entries: string[] = [];
  entries.push(
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`,
  );
  emitter.images.forEach((image, index) => {
    entries.push(
      `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.name}"/>`,
    );
  });
  emitter.links.forEach((href, index) => {
    entries.push(
      `<Relationship Id="rIdH${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(href)}" TargetMode="External"/>`,
    );
  });
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    entries.join("") +
    `</Relationships>`
  );
}

/** word/numbering.xml — hai danh sách đơn giản (gạch đầu dòng / thứ tự). */
function numberingXml(): string {
  const level = (ilvl: number, fmt: string, text: string) =>
    `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/>` +
    `<w:lvlText w:val="${escapeXml(text)}"/><w:lvlJc w:val="left"/>` +
    `<w:pPr><w:ind w:left="${INDENT_TWIPS_PER_LEVEL}" w:hanging="${INDENT_TWIPS_PER_LEVEL / 2}"/></w:pPr></w:lvl>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:abstractNum w:abstractNumId="0">` +
    level(0, "bullet", "•") +
    level(1, "bullet", "◦") +
    level(2, "bullet", "▪") +
    `</w:abstractNum>` +
    `<w:num w:numId="${NUM_BULLET}"><w:abstractNumId w:val="0"/></w:num>` +
    `<w:abstractNum w:abstractNumId="1">` +
    level(0, "decimal", "%1.") +
    level(1, "decimal", "%2.") +
    level(2, "decimal", "%3.") +
    `</w:abstractNum>` +
    `<w:num w:numId="${NUM_ORDERED}"><w:abstractNumId w:val="1"/></w:num>` +
    `</w:numbering>`
  );
}

function corePropsXml(title: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:title>${escapeXml(title)}</dc:title>` +
    `</cp:coreProperties>`
  );
}

/**
 * Dựng document.xml từ một cây ProseMirror; JSON hỏng → tài liệu trống.
 *
 * Trả về { entries: các mục ZIP, bodyXml } — thân XML lộ ra để kiểm thử.
 */
export function buildDocxParts(
  content: unknown,
  title: string,
): { entries: ZipEntryInput[]; bodyXml: string } {
  let root: PMNode | null = null;
  if (isRecord(content) && content.type === "doc") {
    try {
      root = writerSchema.nodeFromJSON(content as never);
    } catch {
      root = null;
    }
  }

  const { margins } = readPageSetup(content);

  const emitter = makeEmitter();
  const bodyXml = root && root.childCount > 0 ? blocksXml(root, emitter) : paragraphXml(
    writerSchema.node("paragraph"),
    emitter,
  );

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document` +
    ` xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"` +
    ` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"` +
    ` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"` +
    ` xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<w:body>` +
    bodyXml +
    `<w:sectPr>` +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    `<w:pgMar w:top="${Math.round(margins.top * MM_TO_TWIP)}" w:right="${Math.round(margins.right * MM_TO_TWIP)}"` +
    ` w:bottom="${Math.round(margins.bottom * MM_TO_TWIP)}" w:left="${Math.round(margins.left * MM_TO_TWIP)}"/>` +
    `</w:sectPr></w:body></w:document>`;

  const encoder = new TextEncoder();
  const extensions = new Set<string>();
  emitter.images.forEach((image) => {
    const dot = image.name.lastIndexOf(".");
    extensions.add(image.name.slice(dot + 1));
  });
  const entries: ZipEntryInput[] = [
    {
      name: "[Content_Types].xml",
      bytes: encoder.encode(contentTypesXml(extensions)),
    },
    { name: "_rels/.rels", bytes: encoder.encode(rootRelsXml()) },
    { name: "word/document.xml", bytes: encoder.encode(documentXml) },
    {
      name: "word/_rels/document.xml.rels",
      bytes: encoder.encode(documentRelsXml(emitter)),
    },
    { name: "word/numbering.xml", bytes: encoder.encode(numberingXml()) },
    { name: "docProps/core.xml", bytes: encoder.encode(corePropsXml(title)) },
  ];

  emitter.images.forEach((image) => {
    entries.push({ name: `word/media/${image.name}`, bytes: image.bytes });
  });

  return { entries, bodyXml };
}

/**
 * Đóng gói toàn bộ tài liệu thành mảng byte của tệp `.docx`.
 *
 * Đây là hàm mà "Lưu" gọi khi người dùng chọn (hoặc đang có) tệp Word.
 */
export function writerDocxBytes(content: unknown, title: string): Uint8Array {
  const { entries } = buildDocxParts(content, title);
  return createZip(entries);
}

/** true khi đường dẫn là tệp Word (.docx/.doc) — chọn cơ chế ghi tương ứng. */
export function isWordDocumentPath(path: string | null): boolean {
  return path !== null && /\.(docx|doc)$/i.test(path);
}
