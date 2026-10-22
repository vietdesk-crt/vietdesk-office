/** Định dạng hiển thị cho trang chủ (thời gian tương đối, dung lượng, tên tệp). */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "vừa xong", "5 phút trước", "2 giờ trước", hoặc ngày tuyệt đối nếu lâu hơn. */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < MINUTE) {
    return "vừa xong";
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} phút trước`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} giờ trước`;
  }
  if (elapsed < 7 * DAY) {
    return `${Math.floor(elapsed / DAY)} ngày trước`;
  }
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp));
}

/** "1,2 MB" — trả null nếu không có số đo. */
export function formatFileSize(size: number | null): string | null {
  if (size === null) {
    return null;
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(size / 1024)} KB`;
  }
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
    size / (1024 * 1024),
  )} MB`;
}

/** Lấy tên tệp từ đường dẫn Windows hoặc POSIX. */
export function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
