/**
 * Mô hình nội dung của Slides.
 *
 * Nội dung lưu trong `.vdx` có dạng `{ slides: Slide[] }`. Một slide nay gồm
 * kiểu trình bày (layout), màu nền (background) và ghi chú diễn giả (notes) —
 * lấy cảm hứng từ Google Slides và WPS Presentation nhưng giữ mô hình phẳng để
 * không phụ thuộc engine OOXML. Việc kiểm tra dữ liệu đọc từ đĩa nằm ở đây để
 * editor và vỏ ứng dụng không phải tự lọc lại.
 */

/** Các kiểu trình bày có sẵn (map gần đúng layout master của PowerPoint). */
export const SLIDE_LAYOUTS = [
  "title",
  "title-content",
  "section",
  "title-only",
  "blank",
] as const;

export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

export interface Slide {
  id: string;
  layout: SlideLayout;
  title: string;
  body: string;
  /** Màu hex CSS ("#rrggbb") hoặc null = nền mặc định. */
  background: string | null;
  /** Ghi chú chỉ người thuyết trình thấy, không hiện khi trình chiếu. */
  notes: string;
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isSlideLayout(value: unknown): value is SlideLayout {
  return (
    typeof value === "string" &&
    (SLIDE_LAYOUTS as readonly string[]).includes(value)
  );
}

/** Chỉ nhận màu hex hợp lệ để không chèn tuỳ ý CSS từ tệp đọc vào. */
function normalizeBackground(value: unknown): string | null {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : null;
}

const INITIAL_SLIDES: Slide[] = [
  {
    id: "slide-1",
    layout: "title",
    title: "VietDesk Office",
    body: "Bộ ứng dụng văn phòng cho người Việt\nSoạn thảo · Bảng tính · Trình chiếu",
    background: null,
    notes: "Chào mừng — giới thiệu ngắn về bộ ứng dụng.",
  },
  {
    id: "slide-2",
    layout: "title-content",
    title: "Vì sao VietDesk?",
    body: "Chuẩn văn bản hành chính NĐ30\nHỗ trợ đầy đủ dấu tiếng Việt\nKý số và cộng tác thời gian thực",
    background: null,
    notes: "",
  },
];

/** Bộ slide mặc định cho tài liệu mới (bản sao, không chia sẻ object gốc). */
export function createDefaultSlides(): Slide[] {
  return INITIAL_SLIDES.map((slide) => ({ ...slide }));
}

let slideSequence = 0;

/** Id duy nhất giữa các phiên (không đụng `slide-1`, `slide-2` đã lưu). */
export function createSlideId(): string {
  slideSequence += 1;
  return `slide-${Date.now().toString(36)}-${slideSequence}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSlideShape(value: unknown): value is Record<string, unknown> & {
  id: string;
  title: string;
  body: string;
} {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string"
  );
}

/**
 * Tách `body` thành từng dòng, gỡ ký hiệu đầu dòng người dùng tự gõ để tránh
 * nhân đôi bullet khi render. Dùng cho khung xem và chế độ trình chiếu.
 */
export function slideBodyLines(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.replace(/^\s*[•\u2022\-–*]\s+/, "").trimEnd())
    .filter((line) => line.length > 0);
}

/**
 * Đọc danh sách slide từ nội dung tài liệu.
 *
 * Slide thiếu trường mở rộng (layout/background/notes) được điền mặc định để
 * tệp cũ và tệp nhập từ Office vẫn mở được. Slide sai cấu trúc bị bỏ qua; nếu
 * không còn slide hợp lệ nào thì dùng bộ mặc định.
 */
export function readSlides(value: unknown): Slide[] {
  if (isRecord(value) && Array.isArray(value.slides)) {
    const slides = value.slides.filter(isSlideShape).map((slide) => ({
      id: slide.id,
      layout: isSlideLayout(slide.layout) ? slide.layout : "title-content",
      title: slide.title,
      body: slide.body,
      background: normalizeBackground(slide.background),
      notes: typeof slide.notes === "string" ? slide.notes : "",
    }));
    if (slides.length > 0) {
      return slides;
    }
  }
  return createDefaultSlides();
}

/** Chuẩn hoá nội dung Slides về đúng dạng lưu trong `.vdx`. */
export function normalizeSlidesContent(value: unknown): { slides: Slide[] } {
  return { slides: readSlides(value) };
}
