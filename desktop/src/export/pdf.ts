/**
 * Xuất PDF trực tiếp từ vùng soạn thảo Writer — không mở hộp thoại in.
 *
 * Vì sao tự dựng PDF? Người dùng cần "nút Xuất PDF cho ra tệp PDF", còn trình
 * duyệt chỉ có `window.print()` (qua máy in). Chúng ta đọc lại chính khối DOM
 * đang soạn: mỗi dòng chữ đo bằng Range API nên vị trí từng từ khớp màn hình,
 * rồi vẽ lên các trang A4 lề NĐ30 bằng pdf-lib.
 *
 * Tiếng Việt: font Noto Serif (Regular/Bold/Italic/BoldItalic) được nhúng vào
 * tệp PDF — dựng lại bằng font chữ của chính bản soạn, không lo lỗi dấu.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import {
  ND30_MARGINS,
  computePageBreaks,
  type PageSetup,
} from "../editors/writer/page";
import { collectBlocks, forcedBreakIndexes } from "../editors/writer/print";
import { base64ToBytes } from "./binary";

/** 1 mm = 72/25.4 pt. */
const MM_TO_PT = 72 / 25.4;

/** Trang A4 tính bằng pt. */
export const A4_WIDTH_PT = 210 * MM_TO_PT;
export const A4_HEIGHT_PT = 297 * MM_TO_PT;

/** Lề NĐ30 tính bằng pt. */
export const MARGIN_LEFT_PT = ND30_MARGINS.left * MM_TO_PT;
export const MARGIN_RIGHT_PT = ND30_MARGINS.right * MM_TO_PT;
export const MARGIN_TOP_PT = ND30_MARGINS.top * MM_TO_PT;
export const MARGIN_BOTTOM_PT = ND30_MARGINS.bottom * MM_TO_PT;

/** Vùng nội dung của trang (pt). */
export const CONTENT_WIDTH_PT = A4_WIDTH_PT - MARGIN_LEFT_PT - MARGIN_RIGHT_PT;
export const CONTENT_HEIGHT_PT = A4_HEIGHT_PT - MARGIN_TOP_PT - MARGIN_BOTTOM_PT;

type FontKind = "regular" | "bold" | "italic" | "boldItalic";

interface EmbeddedFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

interface CssColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface WriterPdfRequest {
  /** Vùng soạn thảo đang hiển thị (.ProseMirror). */
  surface: HTMLElement;
  title: string;
  pageSetup: PageSetup;
}

export interface WriterPdfResult {
  bytes: Uint8Array;
  pageCount: number;
}

/** "rgb(12, 34, 56)" / "rgba(...)" / "#rrggbb" → Pet Components. */
export function parseCssColor(value: string): CssColor | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "transparent") {
    return null;
  }
  const rgbMatch =
    /^rgba?\((\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*([\d.]+))?\)$/.exec(
      trimmed,
    );
  if (rgbMatch) {
    return {
      red: Number(rgbMatch[1]),
      green: Number(rgbMatch[2]),
      blue: Number(rgbMatch[3]),
      alpha: rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]),
    };
  }
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (hexMatch) {
    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split("").map((c) => c + c).join("")
      : hexMatch[1];
    return {
      red: parseInt(hex.slice(0, 2), 16),
      green: parseInt(hex.slice(2, 4), 16),
      blue: parseInt(hex.slice(4, 6), 16),
      alpha: 1,
    };
  }
  return null;
}

/** Chọn bộ mặt chữ theo computed style của phần tử chứa text. */
function fontKindOf(style: CSSStyleDeclaration): FontKind {
  const weight = parseInt(style.fontWeight, 10) || 400;
  const italic = style.fontStyle === "italic";
  const bold = weight >= 600 || style.fontWeight === "bold";
  if (bold && italic) {
    return "boldItalic";
  }
  return bold ? "bold" : italic ? "italic" : "regular";
}

/** Nhúng 4 bộ mặt Noto Serif (subset, cho gọn tệp). */
async function embedNotoFonts(doc: PDFDocument): Promise<EmbeddedFonts> {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  const load = async (fileName: string) => {
    const response = await fetch(`${base}fonts/${fileName}`);
    if (!response.ok) {
      throw new Error(`Không tải được phông ${fileName}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  };
  const [regular, bold, italic, boldItalic] = await Promise.all([
    load("NotoSerif-Regular.ttf"),
    load("NotoSerif-Bold.ttf"),
    load("NotoSerif-Italic.ttf"),
    load("NotoSerif-BoldItalic.ttf"),
  ]);
  return {
    regular: await doc.embedFont(regular, { subset: true }),
    bold: await doc.embedFont(bold, { subset: true }),
    italic: await doc.embedFont(italic, { subset: true }),
    boldItalic: await doc.embedFont(boldItalic, { subset: true }),
  };
}

// ============================ ĐO LƯỜNG DOM ============================

/** Một "từ" liền mạch (không có khoảng trắng) cùng vị trí trái trên màn hình. */
interface Token {
  text: string;
  x: number; // px viewport
}

/** Một hàng của block đã gom chữ theo token — kiểu dáng áp cho cả hàng. */
interface MeasuredLine {
  topPx: number;
  bottomPx: number;
  tokens: Token[];
  /** Phần tử chứa text — dùng lấy computed style (cỡ/màu/phông). */
  element: HTMLElement;
  style: CSSStyleDeclaration;
  backgroundColor: CssColor | null;
  underline: boolean;
  strike: boolean;
}

interface ImagePlacement {
  rect: DOMRect;
  src: string;
}

interface BoxPlacement {
  rect: DOMRect;
  checked: boolean;
}

interface RuleLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  gray: boolean;
}

interface BlockGeometry {
  index: number;
  element: HTMLElement;
  rect: DOMRect;
  lines: MeasuredLine[];
  images: ImagePlacement[];
  boxes: BoxPlacement[];
  markers: { li: HTMLElement; text: string }[];
  cellBoxes: { rect: DOMRect; background: CssColor | null }[];
  rules: RuleLine[];
}

function isMeaningful(text: string): boolean {
  return /\S/.test(text);
}

/** Kiểu nền của tổ tiên: dừng khi chạm gốc block hoặc gặp màu nào đó. */
function backgroundColorOf(start: Element, blockRoot: HTMLElement): CssColor | null {
  let element: Element | null = start;
  while (element && blockRoot.contains(element)) {
    if (!element.classList.contains("vd-writer__match")) {
      const color = parseCssColor(getComputedStyle(element).backgroundColor);
      if (color && color.alpha > 0.05) {
        return color;
      }
    }
    if (element === blockRoot) {
      break;
    }
    element = element.parentElement;
  }
  return null;
}

/** Gạch chân / bỏ chéo: tìm tổ tiên gần nhất có decoration từ CSS. */
function decorationOf(
  start: Element,
  blockRoot: HTMLElement,
): { underline: boolean; strike: boolean } {
  let element: Element | null = start;
  while (element && blockRoot.contains(element)) {
    const style = getComputedStyle(element);
    if (style.textDecorationLine !== "none") {
      return {
        underline: style.textDecorationLine.includes("underline"),
        strike: style.textDecorationLine.includes("line-through"),
      };
    }
    if (element === blockRoot) {
      break;
    }
    element = element.parentElement;
  }
  return { underline: false, strike: false };
}

interface CharBucket {
  topPx: number;
  bottomPx: number;
  chars: { char: string; x: number }[];
}

/** Đo từng chữ của một text node — gom theo hàng (top làm khoá nhóm). */
function measureTextNode(
  node: Text,
  lines: MeasuredLine[],
  element: HTMLElement,
  blockRoot: HTMLElement,
): void {
  const text = node.nodeValue ?? "";
  if (!isMeaningful(text)) {
    return;
  }
  const range = document.createRange();
  const buckets = new Map<number, CharBucket>();
  for (let index = 0; index < text.length; index += 1) {
    range.setStart(node, index);
    range.setEnd(node, index + 1);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      continue;
    }
    const key = Math.round(rect.top);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { topPx: rect.top, bottomPx: rect.bottom, chars: [] };
      buckets.set(key, bucket);
    }
    bucket.chars.push({ char: text[index] as string, x: rect.left });
  }

  const style = getComputedStyle(element);
  const decoration = decorationOf(element, blockRoot);
  const background = backgroundColorOf(element, blockRoot);

  buckets.forEach((bucket) => {
    const tokens: Token[] = [];
    let current = "";
    let currentX = 0;
    for (const charInfo of bucket.chars) {
      if (/\s/.test(charInfo.char)) {
        if (current) {
          tokens.push({ text: current, x: currentX });
          current = "";
        }
        continue;
      }
      if (!current) {
        currentX = charInfo.x;
      }
      current += charInfo.char;
    }
    if (current) {
      tokens.push({ text: current, x: currentX });
    }
    if (tokens.length > 0) {
      lines.push({
        topPx: bucket.topPx,
        bottomPx: bucket.bottomPx,
        tokens,
        element,
        style,
        backgroundColor: background,
        underline: decoration.underline,
        strike: decoration.strike,
      });
    }
  });
}

/** Gom ảnh, ô tick, marker chuẩn của list, nền/viền ô bảng, đường kẻ. */
function collectExtras(
  block: HTMLElement,
  geometry: BlockGeometry,
): void {
  block.querySelectorAll("img").forEach((img) => {
    const rect = img.getBoundingClientRect();
    if (rect.width > 2 && rect.height > 2) {
      geometry.images.push({ rect, src: img.getAttribute("src") ?? "" });
    }
  });

  // Ô tick danh sách việc cần làm.
  block.querySelectorAll<HTMLElement>("li.vd-writer__task").forEach((li) => {
    const check = li.querySelector<HTMLElement>(".vd-writer__task-check");
    if (!check) {
      return;
    }
    const rect = check.getBoundingClientRect();
    if (rect.width > 2) {
      geometry.boxes.push({ rect, checked: li.dataset.checked === "true" });
    }
  });

  // Marker (•, 1.) của danh sách chuẩn — chữ ảo sinh từ ::marker.
  block.querySelectorAll("li").forEach((li) => {
    if (li.classList.contains("vd-writer__task")) {
      return;
    }
    const content = getComputedStyle(li, "::marker").content;
    if (!content || content === "none" || content === "normal") {
      return;
    }
    // Chromium/Firefox trả dạng “”• "" / "“1. ”" — bỏ ngoặc kép ngoài cùng.
    const text = content
      .replace(/^["']/, "")
      .replace(/["']$/, "")
      .trim();
    if (text) {
      geometry.markers.push({ li, text });
    }
  });

  // Nền + viền từng ô bảng.
  block.querySelectorAll("table").forEach((table) => {
    table.querySelectorAll<HTMLElement>("td, th").forEach((cell) => {
      const rect = cell.getBoundingClientRect();
      if (rect.width < 4 && rect.height < 4) {
        return;
      }
      geometry.cellBoxes.push({
        rect,
        background: backgroundColorOf(cell, block),
      });
    });
  });

  // Kẻ ngang <hr> — đường ngang giữa khối.
  block.querySelectorAll("hr").forEach((hr) => {
    const rect = hr.getBoundingClientRect();
    if (rect.height < 30) {
      geometry.rules.push({
        x1: rect.left,
        y1: rect.top + rect.height / 2,
        x2: rect.right,
        y2: rect.top + rect.height / 2,
        gray: true,
      });
    }
  });

  // Trích dẫn — viền trái.
  block.querySelectorAll("blockquote").forEach((quote) => {
    const rect = quote.getBoundingClientRect();
    geometry.rules.push({
      x1: rect.left,
      y1: rect.top,
      x2: rect.left,
      y2: rect.bottom,
      gray: false,
    });
  });
}

/** Đo một khối cấp cao nhất: hàng chữ + ảnh + ô tick + marker + bảng + kẻ. */
function measureBlock(block: HTMLElement, index: number): BlockGeometry {
  const rect = block.getBoundingClientRect();
  const geometry: BlockGeometry = {
    index,
    element: block,
    rect,
    lines: [],
    images: [],
    boxes: [],
    markers: [],
    cellBoxes: [],
    rules: [],
  };

  if (block.classList.contains("vd-page-break")) {
    return geometry; // chỉ chừa chỗ trong trang, không vẽ gì cả.
  }

  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    const parent = current.parentElement;
    if (!parent) {
      continue;
    }
    measureTextNode(current as Text, geometry.lines, parent, block);
  }

  collectExtras(block, geometry);
  return geometry;
}

// ============================ VẼ LÊN PDF ============================

interface DrawContext {
  page: PDFPage;
  fonts: EmbeddedFonts;
  /** px màn hình → pt PDF (đặt theo tỉ lệ bề rộng nội dung). */
  pxToPt: number;
  /** toạ độ viewport x của mép trái vùng nội dung. */
  surfaceLeft: number;
  /** toạ độ viewport y của mép trên khối đang vẽ. */
  blockRectTop: number;
  /** phần khối đã dịch xuống trong trang hiện tại (px). */
  topOnPagePx: number;
  images: Map<string, PDFImage | "failed">;
  /** metric phông Noto Serif (đơn vị font em). */
  fontMetrics: PdfFontMetrics;
}

/** Gốc toạ độ PDF ở góc trái dưới; y của mép trên vùng nội dung. */
const CONTENT_TOP_Y = A4_HEIGHT_PT - MARGIN_TOP_PT;

function toX(ctx: DrawContext, viewportX: number): number {
  return MARGIN_LEFT_PT + (viewportX - ctx.surfaceLeft) * ctx.pxToPt;
}

function toY(ctx: DrawContext, viewportY: number): number {
  return (
    CONTENT_TOP_Y -
    (ctx.topOnPagePx + (viewportY - ctx.blockRectTop)) * ctx.pxToPt
  );
}

function pdfColor(color: CssColor) {
  return rgb(color.red / 255, color.green / 255, color.blue / 255);
}

function pickFont(ctx: DrawContext, line: MeasuredLine): PDFFont {
  switch (fontKindOf(line.style)) {
    case "bold":
      return ctx.fonts.bold;
    case "italic":
      return ctx.fonts.italic;
    case "boldItalic":
      return ctx.fonts.boldItalic;
    default:
      return ctx.fonts.regular;
  }
}

/** Vẽ một hàng chữ: nền (nếu có) + token đúng vị trí DOM + gạch. */
function drawTextLine(ctx: DrawContext, line: MeasuredLine): void {
  const font = pickFont(ctx, line);
  const fontSizePx = parseFloat(line.style.fontSize) || 16;
  const sizePt = Math.max(1, fontSizePx * ctx.pxToPt);
  const color = pdfColor(parseCssColor(line.style.color) ?? { red: 20, green: 20, blue: 20, alpha: 1 });
  const descenderPx =
    (-ctx.fontMetrics.descender / (ctx.fontMetrics.unitsPerEm || 1000)) * fontSizePx;
  const baseline = toY(ctx, line.bottomPx - descenderPx);

  if (line.backgroundColor) {
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    for (const token of line.tokens) {
      const x = toX(ctx, token.x);
      left = Math.min(left, x);
      right = Math.max(right, x + font.widthOfTextAtSize(token.text, sizePt));
    }
    const topY = toY(ctx, line.topPx);
    const bottomY = toY(ctx, line.bottomPx);
    ctx.page.drawRectangle({
      x: left,
      y: bottomY,
      width: right - left,
      height: Math.max(2, topY - bottomY),
      color: pdfColor(line.backgroundColor),
    });
  }

  for (const token of line.tokens) {
    const x = toX(ctx, token.x);
    ctx.page.drawText(token.text, {
      x,
      y: baseline,
      size: sizePt,
      font,
      color,
    });
    const right = x + font.widthOfTextAtSize(token.text, sizePt);
    if (line.underline) {
      ctx.page.drawLine({
        start: { x, y: baseline - sizePt * 0.16 },
        end: { x: right, y: baseline - sizePt * 0.16 },
        thickness: Math.max(0.4, sizePt / 16),
        color,
      });
    }
    if (line.strike) {
      ctx.page.drawLine({
        start: { x, y: baseline - sizePt * 0.28 },
        end: { x: right, y: baseline - sizePt * 0.28 },
        thickness: Math.max(0.4, sizePt / 18),
        color,
      });
    }
  }
}

/** Chèn ảnh từ data URL; ngoài data URL → khối xám thay thế. */
function drawImagePlacement(ctx: DrawContext, placement: ImagePlacement): void {
  const x = toX(ctx, placement.rect.left);
  const yBottom = toY(ctx, placement.rect.bottom);
  const widthPt = placement.rect.width * ctx.pxToPt;
  const heightPt = placement.rect.height * ctx.pxToPt;
  const embedded = ctx.images.get(placement.src);
  if (embedded && embedded !== "failed") {
    ctx.page.drawImage(embedded, {
      x,
      y: yBottom,
      width: widthPt,
      height: heightPt,
    });
    return;
  }
  ctx.page.drawRectangle({
    x,
    y: yBottom,
    width: widthPt,
    height: heightPt,
    color: rgb(0.88, 0.86, 0.82),
    borderColor: rgb(0.7, 0.67, 0.62),
    borderWidth: 0.6,
  });
}

/** Ô tick việc cần làm — ô vuông + dấu chọn nếu đã xong. */
function drawCheckbox(ctx: DrawContext, box: BoxPlacement): void {
  const x = toX(ctx, box.rect.left);
  const yBottom = toY(ctx, box.rect.bottom);
  const size = Math.max(4, box.rect.width * ctx.pxToPt);
  const ink = rgb(0.25, 0.23, 0.2);
  ctx.page.drawRectangle({
    x,
    y: yBottom,
    width: size,
    height: size,
    borderColor: ink,
    borderWidth: box.checked ? 0.5 : 0.9,
    borderOpacity: box.checked ? 0.45 : 1,
  });
  if (box.checked) {
    ctx.page.drawLine({
      start: { x: x + size * 0.18, y: yBottom + size * 0.45 },
      end: { x: x + size * 0.45, y: yBottom + size * 0.18 },
      thickness: Math.max(0.9, size / 8),
      color: rgb(0.75, 0.25, 0.2),
    });
    ctx.page.drawLine({
      start: { x: x + size * 0.45, y: yBottom + size * 0.18 },
      end: { x: x + size * 0.85, y: yBottom + size * 0.82 },
      thickness: Math.max(0.9, size / 8),
      color: rgb(0.75, 0.25, 0.2),
    });
  }
}

/** Viền bảng: nền từng ô trước rồi vẽ khung viền. */
function drawTableCells(ctx: DrawContext, cells: BlockGeometry["cellBoxes"]): void {
  const borderColor = rgb(0.55, 0.52, 0.47);
  for (const cell of cells) {
    const x = toX(ctx, cell.rect.left);
    const yBottom = toY(ctx, cell.rect.bottom);
    const width = cell.rect.width * ctx.pxToPt;
    const height = cell.rect.height * ctx.pxToPt;
    if (cell.background) {
      ctx.page.drawRectangle({
        x,
        y: yBottom,
        width,
        height,
        color: pdfColor(cell.background),
      });
    }
    ctx.page.drawRectangle({
      x,
      y: yBottom,
      width,
      height,
      borderColor,
      borderWidth: 0.6,
    });
  }
}

/** Vẽ marker của danh sách chuẩn (• / 1.) ngay trước chữ của mục đích. */
function drawListMarkers(ctx: DrawContext, geometry: BlockGeometry): void {
  for (const marker of geometry.markers) {
    const liRect = marker.li.getBoundingClientRect();
    const line = geometry.lines
      .filter((candidate) => candidate.topPx >= liRect.top - 6)
      .sort((a, b) => a.topPx - b.topPx)[0];
    if (!line) {
      continue;
    }
    const font = ctx.fonts.regular;
    const fontSizePx = parseFloat(line.style.fontSize) || 16;
    const sizePt = fontSizePx * ctx.pxToPt;
    const textLeft = Math.min(...line.tokens.map((token) => token.x));
    const widthPt = font.widthOfTextAtSize(marker.text, sizePt);
    const descenderPx =
      (-ctx.fontMetrics.descender / (ctx.fontMetrics.unitsPerEm || 1000)) * fontSizePx;
    const baseline = toY(ctx, line.bottomPx - descenderPx);
    const x = Math.max(
      toX(ctx, geometry.rect.left),
      toX(ctx, textLeft) - widthPt - sizePt * 0.25,
    );
    ctx.page.drawText(marker.text, {
      x,
      y: baseline,
      size: sizePt,
      font,
      color: pdfColor(parseCssColor(line.style.color) ?? { red: 20, green: 20, blue: 20, alpha: 1 }),
    });
  }
}

function drawRules(ctx: DrawContext, rules: RuleLine[]): void {
  for (const rule of rules) {
    ctx.page.drawLine({
      start: { x: toX(ctx, rule.x1), y: toY(ctx, rule.y1) },
      end: { x: toX(ctx, rule.x2), y: toY(ctx, rule.y2) },
      thickness: rule.gray ? 0.75 : 1.6,
      color: rule.gray ? rgb(0.62, 0.59, 0.54) : rgb(0.72, 0.68, 0.6),
    });
  }
}

/** Vẽ một block trong trang hiện tại. */
function drawGeometry(ctx: DrawContext, geometry: BlockGeometry): void {
  drawTableCells(ctx, geometry.cellBoxes);
  for (const line of geometry.lines) {
    drawTextLine(ctx, line);
  }
  for (const placement of geometry.images) {
    drawImagePlacement(ctx, placement);
  }
  for (const box of geometry.boxes) {
    drawCheckbox(ctx, box);
  }
  drawListMarkers(ctx, geometry);
  drawRules(ctx, geometry.rules);
}

/** Đầu trang / chân trang + số trang của một trang PDF. */
function drawPageChrome(
  ctx: DrawContext,
  pageSetup: PageSetup,
  pageIndex: number,
  pageCount: number,
): void {
  const fontSizePx = 11;
  const sizePt = fontSizePx * ctx.pxToPt;
  const color = rgb(0.44, 0.42, 0.37);
  const font = ctx.fonts.regular;
  if (pageSetup.header) {
    ctx.page.drawText(pageSetup.header, {
      x: MARGIN_LEFT_PT,
      y: A4_HEIGHT_PT - 9 * MM_TO_PT - sizePt * 0.75,
      size: sizePt,
      font,
      color,
    });
  }
  const footerText = pageSetup.footer;
  if (footerText) {
    ctx.page.drawText(footerText, {
      x: MARGIN_LEFT_PT,
      y: 9 * MM_TO_PT + sizePt * 0.3,
      size: sizePt,
      font,
      color,
    });
  }
  if (pageSetup.showPageNumbers) {
    const label = `Trang ${pageIndex + 1} / ${pageCount}`;
    const widthPt = font.widthOfTextAtSize(label, sizePt);
    ctx.page.drawText(label, {
      x: MARGIN_LEFT_PT + CONTENT_WIDTH_PT - widthPt,
      y: 9 * MM_TO_PT + sizePt * 0.3,
      size: sizePt,
      font,
      color,
    });
  }
}

interface PdfFontMetrics {
  ascender: number;
  descender: number;
  unitsPerEm: number;
}

// ============================ ĐIỀU PHỐI ============================

const DATA_URL = /^data:(image\/(?:png|jpe?g));base64,(.+)$/s;

/** Chia các block vào các trang (giống logic bản in giấy). */
function paginateBlocks(
  heights: number[],
  contentHeightPx: number,
  forced: Set<number>,
): number[][] {
  if (heights.length === 0) {
    return [[]];
  }
  const breaks = computePageBreaks(heights, contentHeightPx, forced);
  const pages: number[][] = [];
  let start = 0;
  for (const endIndex of [...breaks, heights.length]) {
    const page: number[] = [];
    for (let index = start; index < endIndex && index < heights.length; index += 1) {
      page.push(index);
    }
    if (page.length > 0) {
      pages.push(page);
    }
    start = endIndex;
  }
  return pages.length > 0 ? pages : [[]];
}

/** Nhúng ảnh data URL (PNG/JPG); trả bản đồ src → ảnh PDF. */
async function embedImages(
  doc: PDFDocument,
  geometries: BlockGeometry[],
): Promise<Map<string, PDFImage | "failed">> {
  const cache = new Map<string, PDFImage | "failed">();
  for (const geometry of geometries) {
    for (const placement of geometry.images) {
      const key = placement.src;
      if (cache.has(key)) {
        continue;
      }
      const match = DATA_URL.exec(key.trim());
      if (!match) {
        cache.set(key, "failed");
        continue;
      }
      try {
        const bytes = base64ToBytes(match[2]);
        cache.set(
          key,
          match[1].includes("png")
            ? await doc.embedPng(bytes)
            : await doc.embedJpg(bytes),
        );
      } catch {
        cache.set(key, "failed");
      }
    }
  }
  return cache;
}

/**
 * Dựng tệp PDF từ vùng soạn thảo.
 *
 * Ném lỗi nếu không dựng được (phông tải không xong, v.v.) — bên gọi hiển
 * thị thông báo.
 */
export async function exportWriterPdf(
  request: WriterPdfRequest,
): Promise<WriterPdfResult> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(request.title);
  doc.setCreator("VietDesk Office — Writer");
  const fonts = await embedNotoFonts(doc);

  // Metric phông để đặt baseline hơi chuẩn — dùng instance đã nhúng.
  const embeddedFirst = fonts.regular;
  // PDFFont không lộ metric; đọc từ chính tệp phông thông qua fontkit.
  const notoMetrics = readNotoMetrics();

  const surfaceRect = request.surface.getBoundingClientRect();
  if (surfaceRect.width <= 0) {
    throw new Error("Vùng soạn thảo chưa hiển thị để xuất PDF.");
  }
  const pxToPt = CONTENT_WIDTH_PT / surfaceRect.width;
  const contentHeightPx = CONTENT_HEIGHT_PT / pxToPt;

  const blocks = collectBlocks(request.surface);
  const geometries = blocks.map((block, index) => measureBlock(block, index));
  const heights = geometries.map((geometry) => geometry.rect.height);
  const pageGroups = paginateBlocks(
    heights,
    contentHeightPx,
    new Set(forcedBreakIndexes(blocks)),
  );

  const imageCache = await embedImages(doc, geometries);

  for (const [pageIndex, group] of pageGroups.entries()) {
    const page = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    let topOnPagePx = 0;
    for (const blockIndex of group) {
      const geometry = geometries[blockIndex];
      const context: DrawContext = {
        page,
        fonts,
        pxToPt,
        surfaceLeft: surfaceRect.left,
        blockRectTop: geometry.rect.top,
        topOnPagePx,
        images: imageCache,
        fontMetrics: notoMetrics,
      };
      drawGeometry(context, geometry);
      topOnPagePx += geometry.rect.height;
    }
    drawPageChrome(
      {
        page,
        fonts,
        pxToPt,
        surfaceLeft: surfaceRect.left,
        blockRectTop: surfaceRect.top,
        topOnPagePx: 0,
        images: imageCache,
        fontMetrics: notoMetrics,
      },
      request.pageSetup,
      pageIndex,
      pageGroups.length,
    );
  }

  const bytes = await doc.save();
  void embeddedFirst;
  return { bytes, pageCount: pageGroups.length };
}

/** Metric của Noto Serif (đọc từ hằng số — tệp phông có upm = 1000). */
function readNotoMetrics(): PdfFontMetrics {
  return { ascender: 1069.3, descender: -293.1, unitsPerEm: 1000 };
}
