/**
 * Tiện ích tiếng Việt thuần TypeScript, chạy được cả trên trình duyệt.
 *
 * Chỉ dùng cho tác vụ tức thời (gõ phím, lọc danh sách, tô sáng tìm kiếm).
 * Việc nặng (chuẩn hóa cả tài liệu, chuyển bảng mã) phải gọi lõi C++ qua
 * `@vietdesk/ipc-contract` để giữ một nguồn logic duy nhất.
 */

const TONE_MARKS = /[\u0300\u0301\u0303\u0309\u0323]/g;
const ALL_MARKS = /[\u0300-\u036f]/g;

/** Bỏ dấu thanh nhưng giữ dấu cấu tạo chữ: "Tiếng" → "Tiêng". */
export function stripTones(value: string): string {
  return value.normalize("NFD").replace(TONE_MARKS, "").normalize("NFC");
}

/** Bỏ toàn bộ dấu: "Đường phố" → "Duong pho". */
export function removeDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(ALL_MARKS, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Chuẩn hóa để so khớp tìm kiếm không dấu, không phân biệt hoa/thường.
 * "  Đường   Phố " → "duong pho"
 */
export function normalizeForSearch(value: string): string {
  return removeDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Kiểm tra chuỗi có chứa ký tự tiếng Việt có dấu hay không. */
export function hasVietnameseMarks(value: string): boolean {
  return /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/u.test(
    value,
  );
}

/**
 * Đếm từ theo quy ước tiếng Việt: tách theo khoảng trắng, giữ nguyên từ ghép
 * có gạch nối. Không dùng cho văn bản tiếng Anh có apostrophe.
 */
export function countWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}
