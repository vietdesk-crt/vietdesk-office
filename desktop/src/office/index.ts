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

/** Phần mở rộng đọc được → (loại tài liệu, hàm chuyển đổi). */
const CONVERTERS: Record<
  string,
  { kind: DocumentType; convert: (zip: ZipArchive) => unknown }
> = {
  docx: { kind: "writer", convert: convertDocx },
  odt: { kind: "writer", convert: convertOdt },
  xlsx: { kind: "sheets", convert: convertXlsx },
  ods: { kind: "sheets", convert: convertOds },
  pptx: { kind: "slides", convert: convertPptx },
  odp: { kind: "slides", convert: convertOdp },
};

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/** Tệp này VietDesk có tự đọc nội dung được không? */
export function isOfficeDocument(fileName: string): boolean {
  return extensionOf(fileName) in CONVERTERS;
}

/**
 * Đọc bytes của một tệp Office thành nội dung mô hình nội bộ.
 * Ném lỗi có thông báo tiếng Việt khi tệp hỏng hoặc không hỗ trợ.
 */
export function convertOfficeFile(
  fileName: string,
  bytes: Uint8Array,
): OfficeConversion {
  const converter = CONVERTERS[extensionOf(fileName)];
  if (!converter) {
    throw new Error("Định dạng này chưa được hỗ trợ để đọc nội dung.");
  }
  const zip = ZipArchive.open(bytes);
  return { kind: converter.kind, content: converter.convert(zip) };
}
