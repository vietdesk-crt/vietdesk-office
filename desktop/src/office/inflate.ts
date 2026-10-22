/**
 * Bộ giải nén DEFLATE thuần (RFC 1951) — không nén, chỉ inflate.
 *
 * Tệp Office (.docx/.xlsx/.pptx/.odt…) là ZIP, các entry bên trong nén bằng
 * DEFLATE. WebView của Tauri và trình duyệt đều không có API giải nén dạng
 * "raw deflate" (DecompressionStream dùng định dạng zlib có đầu trường), nên
 * cần một bộ giải nén nhỏ viết tay. Thuật toán theo cấu trúc chuẩn
 * (kiểu `puff.c`): Huffman canonical, đọc bit từ thấp đến cao, mã Huffman đọc
 * từ bit cao của mã.
 */

const MAX_BITS = 15;

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
  769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
  11, 12, 12, 13, 13,
];
const CODE_LENGTH_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

export class InflateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InflateError";
  }
}

/** Bảng Huffman canonical: số lượng mã theo độ dài + bảng ký hiệu đã sắp. */
interface Huffman {
  count: number[];
  symbol: number[];
}

function buildHuffman(lengths: number[]): Huffman {
  const count = new Array<number>(MAX_BITS + 1).fill(0);
  for (const length of lengths) {
    if (length < 0 || length > MAX_BITS) {
      throw new InflateError("Độ dài mã Huffman không hợp lệ.");
    }
    count[length] += 1;
  }
  count[0] = 0;

  const offsets = new Array<number>(MAX_BITS + 1).fill(0);
  for (let bit = 1; bit <= MAX_BITS; bit += 1) {
    offsets[bit] = offsets[bit - 1] + count[bit - 1];
  }
  const symbol = new Array<number>(lengths.length).fill(0);
  lengths.forEach((length, index) => {
    if (length !== 0) {
      symbol[offsets[length]] = index;
      offsets[length] += 1;
    }
  });
  return { count, symbol };
}

class BitReader {
  private position = 0;
  private bitBuffer = 0;
  private bitCount = 0;

  constructor(private readonly data: Uint8Array) {}

  /** Đọc `count` bit, bit đầu tiên nằm ở vị trí thấp nhất của kết quả. */
  bits(count: number): number {
    let value = 0;
    let filled = 0;
    while (filled < count) {
      if (this.bitCount === 0) {
        if (this.position >= this.data.length) {
          throw new InflateError("Dữ liệu nén bị cắt ngắn.");
        }
        this.bitBuffer = this.data[this.position];
        this.position += 1;
        this.bitCount = 8;
      }
      const take = Math.min(count - filled, this.bitCount);
      value |= (this.bitBuffer & ((1 << take) - 1)) << filled;
      this.bitBuffer >>= take;
      this.bitCount -= take;
      filled += take;
    }
    return value;
  }

  /** Nhảy tới ranh giới byte kế tiếp (khối "stored"). */
  alignToByte(): void {
    this.bitCount = 0;
  }

  get byteOffset(): number {
    return this.position - (this.bitCount > 0 ? 1 : 0);
  }

  readBytes(count: number): Uint8Array {
    this.alignToByte();
    if (this.position + count > this.data.length) {
      throw new InflateError("Dữ liệu nén bị cắt ngắn.");
    }
    const slice = this.data.slice(this.position, this.position + count);
    this.position += count;
    return slice;
  }
}

function decodeSymbol(reader: BitReader, table: Huffman): number {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let length = 1; length <= MAX_BITS; length += 1) {
    code |= reader.bits(1);
    const count = table.count[length];
    if (code - count < first) {
      return table.symbol[index + (code - first)];
    }
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }
  throw new InflateError("Mã Huffman không hợp lệ.");
}

/** Bảng Huffman cố định của RFC 1951 mục 3.2.6. */
function fixedTables(): [Huffman, Huffman] {
  const lengths = new Array<number>(288).fill(8);
  for (let index = 144; index < 256; index += 1) lengths[index] = 9;
  for (let index = 256; index < 280; index += 1) lengths[index] = 7;
  const distances = new Array<number>(30).fill(5);
  return [buildHuffman(lengths), buildHuffman(distances)];
}

/** Đọc bảng Huffman động theo mô tả ở đầu khối nén. */
function dynamicTables(reader: BitReader): [Huffman, Huffman] {
  const literalCount = reader.bits(5) + 257;
  const distanceCount = reader.bits(5) + 1;
  const codeLengthCount = reader.bits(4) + 4;

  const codeLengths = new Array<number>(19).fill(0);
  for (let index = 0; index < codeLengthCount; index += 1) {
    codeLengths[CODE_LENGTH_ORDER[index]] = reader.bits(3);
  }
  const codeTable = buildHuffman(codeLengths);

  const lengths = new Array<number>(literalCount + distanceCount).fill(0);
  let index = 0;
  while (index < lengths.length) {
    const symbol = decodeSymbol(reader, codeTable);
    if (symbol < 16) {
      lengths[index] = symbol;
      index += 1;
      continue;
    }
    if (symbol === 16) {
      if (index === 0) {
        throw new InflateError("Lặp mã trước khi có mã nào.");
      }
      const repeat = 3 + reader.bits(2);
      const previous = lengths[index - 1];
      for (let step = 0; step < repeat && index < lengths.length; step += 1) {
        lengths[index] = previous;
        index += 1;
      }
      continue;
    }
    const repeat =
      symbol === 17 ? 3 + reader.bits(3) : symbol === 18 ? 11 + reader.bits(7) : 0;
    if (repeat === 0) {
      throw new InflateError("Mã độ dài không hợp lệ.");
    }
    index += Math.min(repeat, lengths.length - index);
  }

  return [
    buildHuffman(lengths.slice(0, literalCount)),
    buildHuffman(lengths.slice(literalCount)),
  ];
}

/** Giải nén một luồng DEFLATE thô (không có đầu zlib) thành bytes gốc. */
export function inflateRaw(data: Uint8Array): Uint8Array {
  const reader = new BitReader(data);
  const output: number[] = [];

  for (;;) {
    const isFinal = reader.bits(1) === 1;
    const type = reader.bits(2);
    if (type === 0) {
      const stored = reader.readBytes(4);
      const length = stored[0] | (stored[1] << 8);
      const complement = stored[2] | (stored[3] << 8);
      if (length !== (~complement & 0xffff)) {
        throw new InflateError("Khối nén không nén bị hỏng (LEN/NLEN).");
      }
      output.push(...reader.readBytes(length));
    } else if (type === 1 || type === 2) {
      const [literalTable, distanceTable] =
        type === 1 ? fixedTables() : dynamicTables(reader);
      for (;;) {
        const symbol = decodeSymbol(reader, literalTable);
        if (symbol < 256) {
          output.push(symbol);
          continue;
        }
        if (symbol === 256) {
          break;
        }
        const lengthIndex = symbol - 257;
        if (lengthIndex >= LENGTH_BASE.length) {
          throw new InflateError("Mã độ dài vượt quá bảng quy định.");
        }
        const length =
          LENGTH_BASE[lengthIndex] + reader.bits(LENGTH_EXTRA[lengthIndex]);
        const distanceSymbol = decodeSymbol(reader, distanceTable);
        if (distanceSymbol >= DIST_BASE.length) {
          throw new InflateError("Mã khoảng cách vượt quá bảng quy định.");
        }
        const distance =
          DIST_BASE[distanceSymbol] + reader.bits(DIST_EXTRA[distanceSymbol]);
        if (distance > output.length) {
          throw new InflateError("Khoảng cách lặp vượt quá dữ liệu đã giải nén.");
        }
        for (let step = 0; step < length; step += 1) {
          output.push(output[output.length - distance]);
        }
      }
    } else {
      throw new InflateError("Khối nén có kiểu không hợp lệ.");
    }
    if (isFinal) {
      break;
    }
  }

  return Uint8Array.from(output);
}
