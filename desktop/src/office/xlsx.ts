/**
 * Chuyển `.xlsx` (chuẩn OpenXML SpreadsheetML) sang nội dung
 * Sheets `{ cells: { A1: "..." } }`.
 *
 * Sheets của VietDesk hiện chỉ có một vùng ô phẳng nên chỉ đọc **trang tính
 * đầu tiên**; các trang còn lại bị bỏ qua. Giá trị dùng công thức: lấy kết quả
 * đã lưu (`v`), không tính lại. Số định dạng ngày tháng được giữ nguyên số
 * thô thay vì quy đổi lịch.
 */

import { entryText, type ZipArchive } from "./zip";
import { attr, child, children, parseXml, textOf } from "./xml";

const MAX_CELLS = 50_000;

/** sharedStrings.xml → mảng chuỗi dùng chung (chỉ tính trang đầu). */
function readSharedStrings(zip: ZipArchive): string[] {
  const entry = zip.readOptional("xl/sharedStrings.xml");
  if (!entry) return [];
  const root = parseXml(entryText(entry), "xl/sharedStrings.xml");
  return children(root, "si").map((si) => {
    // si có thể chứa nhiều đoạn (rth/t) — nối tất cả văn bản con.
    const texts = [...si.getElementsByTagNameNS("*", "t")];
    return texts.map((node) => node.textContent ?? "").join("");
  });
}

/** workbook.xml + rels → đường dẫn worksheet đầu tiên. */
function firstSheetPath(zip: ZipArchive): string {
  const root = parseXml(
    entryText(zip.read("xl/workbook.xml")),
    "xl/workbook.xml",
  );
  const sheets = child(root, "sheets");
  const firstSheet = sheets ? child(sheets, "sheet") : null;
  const relationshipId = firstSheet ? firstSheet.getAttribute("r:id") : null;

  if (relationshipId) {
    const relsEntry = zip.readOptional("xl/_rels/workbook.xml.rels");
    if (relsEntry) {
      const relsRoot = parseXml(entryText(relsEntry), "workbook.xml.rels");
      for (const rel of [...relsRoot.getElementsByTagNameNS("*", "Relationship")]) {
        if (rel.getAttribute("Id") === relationshipId) {
          const target = rel.getAttribute("Target") ?? "";
          const path = target.startsWith("/")
            ? target.slice(1)
            : `xl/${target}`;
          if (zip.has(path)) return path;
        }
      }
    }
  }

  const fallback = "xl/worksheets/sheet1.xml";
  if (zip.has(fallback)) return fallback;

  const listed = zip.list("xl/worksheets/");
  if (listed.length > 0) {
    // Sắp xếp theo số trong tên tệp — sheet1, sheet2…
    listed.sort((a, b) => {
      const number = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0);
      return number(a) - number(b);
    });
    return listed[0];
  }
  throw new Error("Tệp bảng tính không có trang tính nào.");
}

/** Giá trị một ô theo kiểu `t`: s (chuỗi dùng chung), inlineStr, b, str, số. */
function cellValue(cell: Element, shared: string[]): string | null {
  const type = attr(cell, "t");
  if (type === "inlineStr") {
    const texts = [...cell.getElementsByTagNameNS("*", "t")];
    const joined = texts.map((node) => node.textContent ?? "").join("");
    return joined || null;
  }
  const value = child(cell, "v");
  const raw = value ? textOf(value) : "";
  if (!raw) return null;

  if (type === "s") {
    const index = Number(raw);
    return Number.isInteger(index) && index >= 0 && index < shared.length
      ? shared[index]
      : null;
  }
  if (type === "b") {
    return raw === "1" ? "TRUE" : "FALSE";
  }
  if (type === "e") {
    // Lỗi tính sẵn (#DIV/0!…) — giữ nguyên mã lỗi.
    return raw;
  }
  return raw;
}

/** Chuyển nội dung .xlsx thành `{ cells }` của Sheets. */
export function convertXlsx(zip: ZipArchive): { cells: Record<string, string> } {
  const shared = readSharedStrings(zip);
  const sheetPath = firstSheetPath(zip);
  const root = parseXml(entryText(zip.read(sheetPath)), sheetPath);

  const cells: Record<string, string> = {};
  const sheetData = child(root, "sheetData");
  if (!sheetData) return { cells };

  let produced = 0;
  for (const row of children(sheetData, "row")) {
    const rowNumber = attr(row, "r") ?? "";
    let nextColumn = 0;
    for (const cell of children(row, "c")) {
      if (produced >= MAX_CELLS) break;
      const reference = attr(cell, "r");
      let column: number;
      if (reference) {
        column = columnLetters(reference);
      } else {
        column = nextColumn;
      }
      nextColumn = column + 1;
      const cellReference = `${columnName(column)}${rowNumber}`;
      const value = cellValue(cell, shared);
      if (value !== null && value !== "") {
        cells[reference ?? cellReference] = value;
        produced += 1;
      }
    }
    if (produced >= MAX_CELLS) break;
  }
  return { cells };
}

/** Số cột (0-based) lấy từ tham chiếu ô: "B12" → 1. */
function columnLetters(reference: string): number {
  const letters = /^[A-Za-z]+/.exec(reference)?.[0] ?? "A";
  let column = 0;
  for (const character of letters.toUpperCase()) {
    column = column * 26 + (character.charCodeAt(0) - 64);
  }
  return column - 1;
}

/** Tên cột từ số 0-based: 0 → "A", 26 → "AA". */
function columnName(index: number): string {
  let name = "";
  let remaining = index + 1;
  while (remaining > 0) {
    remaining -= 1;
    name = String.fromCharCode(65 + (remaining % 26)) + name;
    remaining = Math.floor(remaining / 26);
  }
  return name;
}
