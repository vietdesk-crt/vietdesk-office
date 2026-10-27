/**
 * Bộ đọc ZIP tối thiểu — đủ cho tệp Office (một tệp ZIP theo APPNOTE).
 *
 * Chỉ hỗ trợ hai kiểu entry phổ biến: lưu thô (method 0) và DEFLATE (method 8).
 * Không hỗ trợ ZIP64, mã hoá, hay đĩa nhiều tệp — gặp sẽ ném lỗi tiếng Việt
 * thay vì đọc sai lặng lẽ. Đường dẫn entry được chuẩn hoá về dạng POSIX
 * (`/`) và giữ nguyên dạng chữ thường để tra cứu không phân biệt hoa/thường.
 */

import { inflateRaw } from "./inflate";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
/** Khoảng quét tìm EOCD: bình luận tối đa 64 KB của ZIP + phần đầu bản ghi. */
const EOCD_SEARCH_LIMIT = 64 * 1024 + EOCD_MIN_SIZE;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

export interface ZipEntry {
  /** Dữ liệu đã giải nén. */
  bytes: Uint8Array;
  /** true nếu entry nén bằng DEFLATE (method 8). */
  compressed: boolean;
}

function view(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

/** Tìm bản ghi kết thúc trung tâm (EOCD) — nằm ở cuối tệp, có thể kèm bình luận. */
function findEndOfCentralDirectory(data: Uint8Array): number {
  const start = Math.max(0, data.length - EOCD_SEARCH_LIMIT);
  for (let offset = data.length - EOCD_MIN_SIZE; offset >= start; offset -= 1) {
    if (view(data).getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new ZipError("Không tìm thấy cấu trúc kết thúc của tệp ZIP.");
}

export class ZipArchive {
  private readonly entries = new Map<string, ZipEntry>();

  private constructor() {}

  /** true nếu entry tồn tại (đường dẫn không phân biệt hoa/thường). */
  has(path: string): boolean {
    return this.entries.has(normalizePath(path));
  }

  /** Đọc một entry; ném lỗi nếu không có. */
  read(path: string): ZipEntry {
    const entry = this.entries.get(normalizePath(path));
    if (!entry) {
      throw new ZipError(`Tệp nén thiếu phần "${path}".`);
    }
    return entry;
  }

  /** Đọc entry nếu có, không thì trả null (dùng cho các phần tuỳ chọn). */
  readOptional(path: string): ZipEntry | null {
    return this.entries.get(normalizePath(path)) ?? null;
  }

  /** Danh sách đường dẫn — dùng để tìm các phần theo tiền tố (media…). */
  list(prefix: string): string[] {
    const needle = normalizePath(prefix);
    return [...this.entries.keys()].filter((path) => path.startsWith(needle));
  }

  /** Mở một tệp ZIP từ bytes nguyên bản. */
  static open(data: Uint8Array): ZipArchive {
    const archive = new ZipArchive();
    const bytes = view(data);
    const eocd = findEndOfCentralDirectory(data);
    const entryCount = bytes.getUint16(eocd + 10, true);
    let offset = bytes.getUint32(eocd + 16, true);

    for (let index = 0; index < entryCount; index += 1) {
      if (
        offset + 46 > data.length ||
        bytes.getUint32(offset, true) !== CENTRAL_SIGNATURE
      ) {
        throw new ZipError("Danh mục trung tâm của tệp ZIP bị hỏng.");
      }
      const method = bytes.getUint16(offset + 10, true);
      const compressedSize = bytes.getUint32(offset + 20, true);
      const nameLength = bytes.getUint16(offset + 28, true);
      const extraLength = bytes.getUint16(offset + 30, true);
      const commentLength = bytes.getUint16(offset + 32, true);
      const localOffset = bytes.getUint32(offset + 42, true);
      const nameBytes = data.slice(offset + 46, offset + 46 + nameLength);
      const path = normalizePath(decodeUtf8(nameBytes));

      if (
        compressedSize === 0xffffffff ||
        bytes.getUint32(offset + 24, true) === 0xffffffff ||
        localOffset === 0xffffffff
      ) {
        throw new ZipError("Tệp ZIP dùng ZIP64 chưa được hỗ trợ.");
      }

      archive.entries.set(path, {
        bytes: readEntry(data, method, compressedSize, localOffset),
        compressed: method === 8,
      });

      offset += 46 + nameLength + extraLength + commentLength;
    }

    if (archive.entries.size === 0) {
      throw new ZipError("Tệp ZIP không chứa dữ liệu nào.");
    }
    return archive;
  }
}

function readEntry(
  data: Uint8Array,
  method: number,
  compressedSize: number,
  localOffset: number,
): Uint8Array {
  const bytes = view(data);
  if (localOffset + 30 > data.length || bytes.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
    throw new ZipError("Đầu entry của tệp ZIP bị hỏng.");
  }
  const nameLength = bytes.getUint16(localOffset + 26, true);
  const extraLength = bytes.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + nameLength + extraLength;
  if (dataStart + compressedSize > data.length) {
    throw new ZipError("Dữ liệu entry bị cắt ngắn.");
  }
  const raw = data.slice(dataStart, dataStart + compressedSize);

  if (method === 0) {
    return raw;
  }
  if (method === 8) {
    return inflateRaw(raw);
  }
  throw new ZipError(`Tệp ZIP dùng kiểu nén ${method} chưa được hỗ trợ.`);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** Chuỗi UTF-8 từ bytes của một entry. */
export function entryText(entry: ZipEntry): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(entry.bytes);
}
