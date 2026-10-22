/**
 * Mô hình nội dung của Slides.
 *
 * Nội dung lưu trong `.vdx` có dạng `{ slides: Slide[] }`. Việc kiểm tra dữ
 * liệu đọc từ đĩa nằm ở đây để editor và vỏ ứng dụng không phải tự lọc lại.
 */

export interface Slide {
  id: string;
  title: string;
  body: string;
}

const INITIAL_SLIDES: Slide[] = [
  {
    id: "slide-1",
    title: "VietDesk Office",
    body: "Bộ ứng dụng văn phòng cho người Việt\nSoạn thảo · Bảng tính · Trình chiếu",
  },
  {
    id: "slide-2",
    title: "Vì sao VietDesk?",
    body: "• Chuẩn văn bản hành chính NĐ30\n• Hỗ trợ đầy đủ dấu tiếng Việt\n• Ký số và cộng tác thời gian thực",
  },
];

/** Bộ slide mặc định cho tài liệu mới (bản sao, không chia sẻ mảng gốc). */
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

function isSlide(value: unknown): value is Slide {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string"
  );
}

/**
 * Đọc danh sách slide từ nội dung tài liệu.
 *
 * Slide sai cấu trúc bị bỏ qua; nếu không còn slide hợp lệ nào thì dùng bộ
 * mặc định để người dùng vẫn có chỗ làm việc.
 */
export function readSlides(value: unknown): Slide[] {
  if (isRecord(value) && Array.isArray(value.slides)) {
    const slides = value.slides.filter(isSlide).map((slide) => ({ ...slide }));
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
