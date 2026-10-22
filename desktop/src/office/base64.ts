/**
 * Mã hoá byte → base64 và ngược lại, dùng chung cho luồng đọc tệp nhị phân
 * (ảnh nhúng trong .docx, dữ liệu tệp Office gửi từ Rust sang WebView).
 *
 * `btoa`/`atob` có sẵn ở cả WebView và Node 20+, nhưng xử lý theo chunk để
 * tránh nối chuỗi từng ký tự trên ảnh vài MB.
 */

const CHUNK = 8192;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + CHUNK, bytes.length)),
    );
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
