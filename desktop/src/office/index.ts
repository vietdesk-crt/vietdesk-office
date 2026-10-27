/**
 * Điểm vào duy nhất để đọc tệp Office.
 *
 * Hỗ trợ các định dạng đóng gói ZIP (OOXML và OpenDocument) mà VietDesk có thể
 * tự giải mã: .docx/.xlsx/.pptx và .odt/.ods/.odp. Định dạng nhị phân cũ
 * (.doc/.xls/.ppt) và RTF/CSV chưa có engine đọc — `isOfficeDocument` trả về
 * false để App giữ luồng "chưa đọc được" như trước.
 */
import type { DocumentType } from "@vietdesk/ipc-contract";
import { convertDocx } from "./docx";
import { convertOdp, convertOds, convertOdt } from "./odf";
import { convertPptx } from "./pptx";
import { convertXlsx } from "./xlsx";
import { ZipArchive } from "./zip";

export interface OfficeConversion {
  kind: DocumentType;
  content: unknown;
}

/** Chuyển số thứ tự cột 0-indexed sang ký tự Excel (0 -> A, 1 -> B, 25 -> Z, 26 -> AA). */
function colToLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = "";
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/** Chuyển nội dung CSV/TSV thành mô hình ô tính của Sheets. */
function parseDelimitedText(text: string, delimiter: string): { cells: Record<string, string> } {
  const cells: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (let r = 0; r < lines.length; r++) {
    const line = lines[r];
    if (!line && r === lines.length - 1) continue;
    const parts = line.split(delimiter);
    for (let c = 0; c < parts.length; c++) {
      const val = parts[c]?.trim().replace(/^"|"$/g, "");
      if (val) {
        cells[`${colToLetter(c)}${r + 1}`] = val;
      }
    }
  }
  return { cells };
}

/** Chuyển nội dung văn bản thô / Markdown thành tài liệu đoạn văn cho Writer. */
function parsePlainText(text: string): { type: string; content: unknown[] } {
  const lines = text.split(/\r?\n/);
  const content = lines.map((line) => {
    if (!line) {
      return { type: "paragraph" };
    }
    return {
      type: "paragraph",
      content: [{ type: "text", text: line }],
    };
  });
  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

/** Phần mở rộng đọc được → loại tài liệu. */
const SUPPORTED_EXTENSIONS = new Set([
  "docx",
  "odt",
  "txt",
  "md",
  "xlsx",
  "ods",
  "csv",
  "tsv",
  "pptx",
  "odp",
]);

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/** Tệp này VietDesk có tự đọc nội dung được không? */
export function isOfficeDocument(fileName: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extensionOf(fileName));
}

/**
 * Đọc bytes của một tệp Office/Văn bản thành nội dung mô hình nội bộ.
 * Ném lỗi có thông báo tiếng Việt khi tệp hỏng hoặc không hỗ trợ.
 */
export function convertOfficeFile(
  fileName: string,
  bytes: Uint8Array,
): OfficeConversion {
  const ext = extensionOf(fileName);
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error("Định dạng này chưa được hỗ trợ để đọc nội dung.");
  }

  // 1. Các định dạng văn bản thuần & bảng tính phân tách (TXT, MD, CSV, TSV)
  if (ext === "txt" || ext === "md") {
    const text = new TextDecoder("utf-8").decode(bytes);
    return { kind: "writer", content: parsePlainText(text) };
  }
  if (ext === "csv") {
    const text = new TextDecoder("utf-8").decode(bytes);
    return { kind: "sheets", content: parseDelimitedText(text, ",") };
  }
  if (ext === "tsv") {
    const text = new TextDecoder("utf-8").decode(bytes);
    return { kind: "sheets", content: parseDelimitedText(text, "\t") };
  }

  // 2. Các định dạng đóng gói ZIP chuẩn quốc tế (OOXML và ODF)
  const zip = ZipArchive.open(bytes);
  if (ext === "docx") {
    return { kind: "writer", content: convertDocx(zip) };
  }
  if (ext === "odt") {
    return { kind: "writer", content: convertOdt(zip) };
  }
  if (ext === "xlsx") {
    return { kind: "sheets", content: convertXlsx(zip) };
  }
  if (ext === "ods") {
    return { kind: "sheets", content: convertOds(zip) };
  }
  if (ext === "pptx") {
    return { kind: "slides", content: convertPptx(zip) };
  }
  if (ext === "odp") {
    return { kind: "slides", content: convertOdp(zip) };
  }

  throw new Error(`Định dạng .${ext} chưa được hỗ trợ.`);
}
