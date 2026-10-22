/**
 * Dựng bản in (in giấy / xuất PDF) cho Writer.
 *
 * Trình duyệt chỉ in những gì đang hiển thị, nên ta dựng riêng một cây DOM
 * chỉ chứa nội dung tài liệu — chia thành các khung trang A4, mỗi khung mang
 * đầu trang, chân trang và số trang riêng — rồi mới gọi `window.print()`.
 * Hộp thoại in của hệ điều hành có tuỳ chọn “Lưu thành PDF”, nên một đường đi
 * này phục vụ cả in giấy lẫn xuất PDF.
 *
 * Vì sao sao chép DOM chứ không dựng lại từ JSON? DOM đã mang sẵn kết quả của
 * mọi lệnh định dạng (màu chữ, cỡ chữ, thụt lề, viền bảng…), nên bản in khớp
 * với màn hình. Dựng lại từ JSON sẽ phải lặp lại toàn bộ quy tắc hiển thị ở
 * một chỗ khác và rất dễ lệch với bản đang soạn.
 */

import { computePageBreaks, pageContentHeightPx } from "./page";

/** Lớp CSS của khối “ngắt trang” do schema sinh ra. */
const PAGE_BREAK_CLASS = "vd-page-break";

/** Lớp CSS của vùng tô sáng kết quả tìm kiếm — không in ra giấy. */
const MATCH_CLASSES = ["vd-writer__match", "vd-writer__match--active"];

export interface PrintOptions {
  /** Nội dung đầu trang, in trên mọi trang. */
  header: string;
  /** Nội dung chân trang, in trên mọi trang. */
  footer: string;
  /** Có in số trang ở góc phải chân trang không. */
  showPageNumbers: boolean;
  /** Tên tài liệu — dùng làm tên tệp khi người dùng chọn “Lưu thành PDF”. */
  title?: string;
}

export interface PrintRequest extends PrintOptions {
  /** Phần tử chứa nội dung ProseMirror (`.ProseMirror`). */
  surface: HTMLElement;
  /** Hàm in — mặc định là `window.print()`, ghi đè được để kiểm thử. */
  print?: () => void;
}

/**
 * Chia danh sách khối thành các trang.
 *
 * @param heights chiều cao (px) của từng khối cấp cao nhất.
 * @param contentHeight chiều cao vùng nội dung một trang (px).
 * @param forced các chỉ số khối bắt buộc mở đầu trang mới (ngắt trang tay).
 * @returns mỗi phần tử là danh sách chỉ số khối của một trang.
 */
export function planPages(
  heights: number[],
  contentHeight: number,
  forced: Iterable<number> = [],
): number[][] {
  const breaks = computePageBreaks(heights, contentHeight, forced);
  const pages: number[][] = [];
  let start = 0;
  for (const end of [...breaks, heights.length]) {
    const page: number[] = [];
    for (let index = start; index < end; index += 1) {
      page.push(index);
    }
    pages.push(page);
    start = end;
  }
  // Tài liệu trống vẫn in ra một trang trắng — đúng như Word.
  return pages.length > 0 ? pages : [[]];
}

/** Các khối cấp cao nhất của vùng soạn thảo. */
export function collectBlocks(surface: HTMLElement): HTMLElement[] {
  return Array.from(surface.children) as HTMLElement[];
}

/** Chỉ số các khối là “ngắt trang” — những khối này mở đầu trang mới. */
export function forcedBreakIndexes(blocks: HTMLElement[]): number[] {
  const forced: number[] = [];
  blocks.forEach((block, index) => {
    if (block.classList.contains(PAGE_BREAK_CLASS)) {
      forced.push(index);
    }
  });
  return forced;
}

/** Sao chép một khối, bỏ các lớp trang trí chỉ có ý nghĩa trên màn hình. */
function cloneBlock(block: HTMLElement): HTMLElement {
  const clone = block.cloneNode(true) as HTMLElement;
  const strip = (element: Element) => {
    for (const className of MATCH_CLASSES) {
      element.classList.remove(className);
    }
  };
  strip(clone);
  clone.querySelectorAll(`.${MATCH_CLASSES[0]}`).forEach(strip);
  // Ô tick trong danh sách việc cần làm: giữ trạng thái đã tick nhưng không
  // cho bấm được trong bản in.
  clone.querySelectorAll("input").forEach((input) => {
    input.setAttribute("disabled", "true");
  });
  return clone;
}

/**
 * Dựng cây DOM của bản in.
 *
 * Mỗi trang là một khung `.vd-writer__page` — dùng lại đúng class của trang
 * đang hiển thị nên lề, đầu trang và chân trang khớp với màn hình.
 */
export function buildPrintRoot(
  blocks: HTMLElement[],
  pages: number[][],
  options: PrintOptions,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "vd-print-root";
  root.setAttribute("aria-hidden", "true");

  pages.forEach((pageBlocks, pageIndex) => {
    const page = document.createElement("div");
    page.className = "vd-writer__page vd-print-page";

    const header = document.createElement("div");
    header.className = "vd-writer__page-header";
    header.textContent = options.header;

    const body = document.createElement("div");
    body.className = "vd-writer__page-body vd-writer__surface";
    for (const index of pageBlocks) {
      const block = blocks[index];
      if (block) {
        body.appendChild(cloneBlock(block));
      }
    }

    const footer = document.createElement("div");
    footer.className = "vd-writer__page-footer";
    const footerText = document.createElement("span");
    footerText.className = "vd-writer__page-footer-text";
    footerText.textContent = options.footer;
    footer.appendChild(footerText);
    if (options.showPageNumbers) {
      const number = document.createElement("span");
      number.className = "vd-writer__page-number";
      number.textContent = `Trang ${pageIndex + 1} / ${pages.length}`;
      footer.appendChild(number);
    }

    page.append(header, body, footer);
    root.appendChild(page);
  });

  return root;
}

/**
 * In tài liệu (hoặc xuất PDF qua hộp thoại in của hệ điều hành).
 *
 * @returns số trang đã dựng; 0 nếu không in được.
 */
export function printDocument(request: PrintRequest): number {
  const { surface } = request;
  const blocks = collectBlocks(surface);
  const heights = blocks.map((block) => block.getBoundingClientRect().height);
  const pages = planPages(
    heights,
    pageContentHeightPx(),
    forcedBreakIndexes(blocks),
  );

  const root = buildPrintRoot(blocks, pages, request);
  document.body.appendChild(root);

  const previousTitle = document.title;
  if (request.title) {
    document.title = request.title;
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    root.remove();
    document.title = previousTitle;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  try {
    (request.print ?? (() => window.print()))();
  } catch {
    cleanup();
    return 0;
  }

  return pages.length;
}
