/**
 * Tiện ích nhị phân dùng chung cho xuất DOCX/PDF.
 *
 * DOCX là một tệp ZIP; chúng ta không cần nén — ZIP cho phép lưu các mục ở
 * chế độ "stored" (không nén) và mọi bộ đọc đều chấp
 * nhận. Nên viết riêng bộ tạo ZIP tối thiểu này thay vì thêm thư viện.
 */

/** CRC32 (chuẩn IEEE) — bắt buộc trong từng mục của ZIP. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index] as number;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = (crc & 1) !== 0 ? 0xedb88320 : 0;
      crc = (crc >>> 1) ^ mask;
    }
  }
  // Đảo bit cuối để được giá trị đúng chuẩn của ZIP.
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  name: string;
  bytes: Uint8Array;
}

/** Dịch chuyển thời gian về tuple (year, month, day, hour, minute, second). */
function dosDateTime(timestamp: number): { date: number; time: number } {
  const date = new Date(timestamp);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { date: dosDate & 0xffff, time: dosTime & 0xffff };
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/**
 * Ghi danh sách thành phần thành tệp ZIP hoàn chỉnh (mục stored, không nén).
 * Cấu trúc: từng "local file header + dữ liệu" rồi "central directory" + EOCD.
 */
export function createZip(entries: ZipEntryInput[], timestamp = Date.now()): Uint8Array {
  const { date, time } = dosDateTime(timestamp);
  const encodedName = (entry: ZipEntryInput) => new TextEncoder().encode(entry.name);
  const nameLength = (entry: ZipEntryInput) => encodedName(entry).length;

  // Tổng chiều dài của phần dữ liệu trước trung tâm bảng mục.
  let dataOffset = 0;
  for (const entry of entries) {
    dataOffset += 30 + nameLength(entry) + entry.bytes.length;
  }

  const centralSize = entries.length * 46 + entries.reduce((total, entry) => total + nameLength(entry), 0);
  const buffer = new Uint8Array(dataOffset + centralSize + 22);
  const view = new DataView(buffer.buffer);

  type CentralRecord = {
    name: string;
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  };
  const records: CentralRecord[] = [];

  let cursor = 0;
  for (const entry of entries) {
    const nameBytes = encodedName(entry);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;
    const offset = cursor;

    // Local file header (signature 0x04034b50).
    view.setUint32(cursor, 0x04034b50, true);
    writeUint16(view, cursor + 4, 20); // version cần để giải nén
    writeUint16(view, cursor + 6, 0); // flags (không nén)
    writeUint16(view, cursor + 8, 0);
    writeUint16(view, cursor + 10, time);
    writeUint16(view, cursor + 12, date);
    writeUint32(view, cursor + 14, crc);
    writeUint32(view, cursor + 18, size);
    writeUint32(view, cursor + 22, size);
    writeUint16(view, cursor + 26, nameBytes.length);
    writeUint16(view, cursor + 28, 0);
    cursor += 30;

    buffer.set(nameBytes, cursor);
    cursor += nameBytes.length;
    buffer.set(entry.bytes, cursor);
    cursor += size;

    records.push({ name: entry.name, nameBytes, crc, size, offset });
  }

  // Central directory (signature 0x02014b50).
  const centralStart = cursor;
  for (const record of records) {
    view.setUint32(cursor, 0x02014b50, true);
    writeUint16(view, cursor + 4, 20); // version tạo
    writeUint16(view, cursor + 6, 20); // version cần
    writeUint16(view, cursor + 8, 0); // flags
    writeUint16(view, cursor + 10, 0); // phương pháp: stored
    writeUint16(view, cursor + 12, time);
    writeUint16(view, cursor + 14, date);
    writeUint32(view, cursor + 16, record.crc);
    writeUint32(view, cursor + 20, record.size);
    writeUint32(view, cursor + 24, record.size);
    writeUint16(view, cursor + 28, record.nameBytes.length);
    writeUint16(view, cursor + 30, 0); // extra
    writeUint16(view, cursor + 32, 0); // comment
    writeUint16(view, cursor + 34, 0); // đĩa bắt đầu
    writeUint16(view, cursor + 36, 0); // thuộc tính nội bộ
    writeUint32(view, cursor + 38, 0); // thuộc tính ngoài
    writeUint32(view, cursor + 42, record.offset);
    cursor += 46;
    buffer.set(record.nameBytes, cursor);
    cursor += record.nameBytes.length;
  }
  const centralEnd = cursor;

  // End of central directory (signature 0x06054b50).
  writeUint32(view, cursor, 0x06054b50);
  writeUint16(view, cursor + 4, 0); // số đĩa
  writeUint16(view, cursor + 6, 0); // đĩa bắt đầu directory
  writeUint16(view, cursor + 8, records.length);
  writeUint16(view, cursor + 10, records.length);
  writeUint32(view, cursor + 12, centralEnd - centralStart);
  writeUint32(view, cursor + 16, centralStart);
  writeUint16(view, cursor + 20, 0);

  return buffer;
}

/** Encode mảng byte thành chuỗi base64 (dùng cho lệnh ghi tệp của Tauri). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

/** Giải mã base64 thành mảng byte (dùng khi chèn ảnh từ base64). */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
