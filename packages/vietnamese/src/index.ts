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

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function readThreeDigits(n: number, showZeroHundred: boolean): string {
  const hundred = Math.floor(n / 100);
  const ten = Math.floor((n % 100) / 10);
  const unit = n % 10;
  const parts: string[] = [];

  if (hundred > 0 || showZeroHundred) {
    parts.push(`${DIGITS[hundred]} trăm`);
  }

  if (ten > 1) {
    parts.push(`${DIGITS[ten]} mươi`);
    if (unit === 1) parts.push("mốt");
    else if (unit === 5) parts.push("lăm");
    else if (unit > 0) parts.push(DIGITS[unit]);
  } else if (ten === 1) {
    parts.push("mười");
    if (unit === 5) parts.push("lăm");
    else if (unit > 0) parts.push(DIGITS[unit]);
  } else {
    if ((hundred > 0 || showZeroHundred) && unit > 0) {
      parts.push("lẻ");
      parts.push(DIGITS[unit]);
    } else if (unit > 0) {
      parts.push(DIGITS[unit]);
    }
  }

  return parts.join(" ");
}

/**
 * Đọc số thành chữ tiếng Việt chuẩn ngữ pháp và kế toán, phục vụ hợp đồng & hoá đơn.
 * Ví dụ: 15000000 -> "Mười lăm triệu đồng chẵn"
 */
export function numberToVietnameseWords(value: number): string {
  if (isNaN(value) || !Number.isFinite(value)) return "Không hợp lệ";
  if (value === 0) return "Không đồng";
  const isNegative = value < 0;
  let absVal = Math.floor(Math.abs(value));
  if (absVal === 0) return "Không đồng";

  const GROUPS = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  const chunks: number[] = [];
  while (absVal > 0) {
    chunks.push(absVal % 1000);
    absVal = Math.floor(absVal / 1000);
  }

  const words: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    if (chunk > 0) {
      const showZero = i < chunks.length - 1;
      const text = readThreeDigits(chunk, showZero);
      const unit = GROUPS[i];
      words.push(unit ? `${text} ${unit}` : text);
    }
  }

  let result = words.join(" ").trim();
  result = result.charAt(0).toUpperCase() + result.slice(1) + " đồng chẵn";
  return isNegative ? `Âm ${result.toLowerCase()}` : result;
}

/**
 * Định dạng tiền tệ Việt Nam (VND) theo chuẩn kế toán.
 * Ví dụ: 12500000 -> "12.500.000 ₫"
 */
export function formatVietnameseCurrency(value: number): string {
  if (isNaN(value) || !Number.isFinite(value)) return "0 ₫";
  const parts = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${parts} ₫`;
}

