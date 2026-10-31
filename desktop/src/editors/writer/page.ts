/**
 * Trang A4 theo lề NĐ30, đầu trang, chân trang và số trang.
 *
 * Mô hình trang:
 *  - Khổ giấy A4 (210 × 297 mm).
 *  - Lề NĐ30: trái 3 cm, phải 1,5 cm, trên 2 cm, dưới 2 cm — lề dùng chung
 *    cho văn bản hành chính ở Việt Nam.
 *  - Đầu trang nằm trong lề trên, chân trang nằm trong lề dưới, số trang ở
 *    góc phải của chân trang.
 *
 * Phần phân trang đo bằng DOM: chiều cao từng khối được đo trong trình
 * duyệt rồi chia vào các trang. Hàm `computePageBreaks` thuần tuý nên kiểm
 * thử được không cần trình duyệt.
 */

import { isRecord } from "@vietdesk/ipc-contract";

/** 1 mm tính bằng px theo chuẩn CSS (96 dpi). */
export const MM_TO_PX = 96 / 25.4;

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Lề NĐ30 (đơn vị mm). */
export const ND30_MARGINS: PageMargins = {
  top: 20,
  right: 15,
  bottom: 20,
  left: 30,
};

export interface PageSetup {
  /** Nội dung đầu trang. */
  header: string;
  /** Nội dung chân trang. */
  footer: string;
  /** Có hiển thị số trang ở chân trang không. */
  showPageNumbers: boolean;
  /** Lề trang (mm) — người dùng có thể kéo trên thước kẻ. */
  margins: PageMargins;
  /** Hướng trang: đứng (portrait) hoặc ngang (landscape). */
  orientation?: "portrait" | "landscape";
  /** Khổ giấy: a4 (210x297), letter (215.9x279.4), legal (215.9x355.6). */
  paperSize?: "a4" | "letter" | "legal";
}

export const DEFAULT_PAGE_SETUP: PageSetup = {
  header: "",
  footer: "",
  showPageNumbers: true,
  margins: { ...ND30_MARGINS },
};

/** Giới hạn lề (mm) để vùng nội dung luôn còn chỗ soạn thảo. */
export const MIN_MARGIN_MM = 5;
export const MAX_SIDE_MARGIN_MM = 80;
export const MAX_VERTICAL_MARGIN_MM = 60;

function clampMarginMm(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.round(Math.min(max, Math.max(min, numeric)));
}

/** Chuẩn hoá lề trang từ dữ liệu JSON; giá trị lạ thì dùng lề NĐ30. */
export function normalizePageMargins(value: unknown): PageMargins {
  if (!isRecord(value)) {
    return { ...ND30_MARGINS };
  }
  return {
    top: clampMarginMm(
      value.top,
      ND30_MARGINS.top,
      MIN_MARGIN_MM,
      MAX_VERTICAL_MARGIN_MM,
    ),
    right: clampMarginMm(
      value.right,
      ND30_MARGINS.right,
      MIN_MARGIN_MM,
      MAX_SIDE_MARGIN_MM,
    ),
    bottom: clampMarginMm(
      value.bottom,
      ND30_MARGINS.bottom,
      MIN_MARGIN_MM,
      MAX_VERTICAL_MARGIN_MM,
    ),
    left: clampMarginMm(
      value.left,
      ND30_MARGINS.left,
      MIN_MARGIN_MM,
      MAX_SIDE_MARGIN_MM,
    ),
  };
}

/** Độ dài tối đa của một dòng đầu trang/chân trang. */
const MAX_SETUP_TEXT = 500;

/** Đọc cấu hình trang từ JSON tài liệu; dữ liệu lạ thì dùng mặc định. */
export function normalizePageSetup(value: unknown): PageSetup {
  if (!isRecord(value)) {
    return { ...DEFAULT_PAGE_SETUP };
  }
  const header =
    typeof value.header === "string"
      ? value.header.slice(0, MAX_SETUP_TEXT)
      : "";
  const footer =
    typeof value.footer === "string"
      ? value.footer.slice(0, MAX_SETUP_TEXT)
      : "";
  const setup: PageSetup = {
    header,
    footer,
    showPageNumbers: value.showPageNumbers !== false,
    margins: normalizePageMargins(value.margins),
  };
  if (value.orientation === "landscape" || value.orientation === "portrait") {
    setup.orientation = value.orientation;
  }
  if (
    value.paperSize === "letter" ||
    value.paperSize === "legal" ||
    value.paperSize === "a4"
  ) {
    setup.paperSize = value.paperSize;
  }
  return setup;
}

/** Lấy cấu hình trang ra khỏi nội dung tài liệu Writer. */
export function readPageSetup(content: unknown): PageSetup {
  if (isRecord(content)) {
    return normalizePageSetup(content.pageSetup);
  }
  return { ...DEFAULT_PAGE_SETUP };
}

export function mmToPx(mm: number): number {
  return mm * MM_TO_PX;
}

/** Chiều cao vùng nội dung của một trang A4 (px), không kể lề trên/dưới. */
export function pageContentHeightPx(
  margins: PageMargins = ND30_MARGINS,
): number {
  return mmToPx(A4_HEIGHT_MM - margins.top - margins.bottom);
}

/** Bề rộng vùng nội dung của một trang A4 (px), không kể lề trái/phải. */
export function pageContentWidthPx(margins: PageMargins = ND30_MARGINS): number {
  return mmToPx(A4_WIDTH_MM - margins.left - margins.right);
}

/**
 * Tính các vị trí bắt đầu trang mới.
 *
 * @param heights chiều cao (px) của từng khối cấp cao nhất, theo thứ tự.
 * @param contentHeight chiều cao vùng nội dung một trang (px).
 * @param forced các chỉ số khối bắt buộc nằm đầu trang mới (ngắt trang tay).
 * @returns danh sách chỉ số khối mở đầu một trang mới (không kể khối đầu).
 */
export function computePageBreaks(
  heights: number[],
  contentHeight: number,
  forced: Iterable<number> = [],
): number[] {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) {
    return [];
  }

  const forcedSet = new Set(forced);
  const breaks: number[] = [];
  let used = 0;

  for (let index = 0; index < heights.length; index += 1) {
    const height = Math.max(0, heights[index] ?? 0);
    if (index > 0) {
      const forcedBreak = forcedSet.has(index);
      const overflow = used > 0 && used + height > contentHeight;
      if (forcedBreak || overflow) {
        breaks.push(index);
        used = 0;
      }
    }
    used += height;
  }

  return breaks;
}

/** Số trang của tài liệu. */
export function pageCount(
  heights: number[],
  contentHeight: number,
  forced: Iterable<number> = [],
): number {
  if (heights.length === 0) {
    return 1;
  }
  return computePageBreaks(heights, contentHeight, forced).length + 1;
}

/**
 * Trang đang chứa con trỏ.
 *
 * @param breaks danh sách chỉ số khối mở đầu trang mới.
 * @param blockIndex chỉ số khối cấp cao nhất chứa con trỏ.
 */
export function pageOfBlock(breaks: number[], blockIndex: number): number {
  let page = 1;
  for (const index of breaks) {
    if (index <= blockIndex) {
      page += 1;
    } else {
      break;
    }
  }
  return page;
}
