/**
 * Xuất tài liệu Sheets sang `.xlsx` (OpenXML SpreadsheetML) và `.csv`.
 *
 * Mở trực tiếp và tương thích chuẩn ECMA-376 / ISO/IEC 29500 (OpenXML).
 */

import { isRecord } from "@vietdesk/ipc-contract";
import { createZip, type ZipEntryInput } from "./binary";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function isExcelDocumentPath(path: string | null): boolean {
  return typeof path === "string" && /\.(xlsx|xls)$/i.test(path);
}

export function isCsvDocumentPath(path: string | null): boolean {
  return typeof path === "string" && /\.csv$/i.test(path);
}

/** Đọc các ô từ nội dung Sheets */
function extractCells(content: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (isRecord(content) && isRecord(content.cells)) {
    for (const [key, val] of Object.entries(content.cells)) {
      if (typeof val === "string" && val.trim().length > 0) {
        result[key.toUpperCase()] = val;
      }
    }
  }
  return result;
}

/** Số cột từ mã chữ: "A" -> 1, "Z" -> 26, "AA" -> 27 */
function colLettersToNumber(letters: string): number {
  let col = 0;
  for (const char of letters.toUpperCase()) {
    col = col * 26 + (char.charCodeAt(0) - 64);
  }
  return col;
}

/** Tách "B12" thành { colLetters: "B", rowNumber: 12, colNumber: 2 } */
function parseCellAddress(addr: string): { colLetters: string; rowNumber: number; colNumber: number } | null {
  const match = /^([A-Z]+)(\d+)$/i.exec(addr.trim());
  if (!match) return null;
  const colLetters = (match[1] as string).toUpperCase();
  const rowNumber = parseInt(match[2] as string, 10);
  if (isNaN(rowNumber) || rowNumber <= 0) return null;
  return { colLetters, rowNumber, colNumber: colLettersToNumber(colLetters) };
}

/**
 * Tạo byte tệp `.xlsx` chuẩn OpenXML.
 */
export function sheetsXlsxBytes(content: unknown, _title?: string): Uint8Array {
  const cells = extractCells(content);

  // Nhóm các ô theo dòng
  const rowsMap = new Map<number, Array<{ colLetters: string; colNumber: number; value: string; ref: string }>>();
  let maxCol = 1;
  let maxRow = 1;

  for (const [ref, value] of Object.entries(cells)) {
    const parsed = parseCellAddress(ref);
    if (!parsed) continue;
    const { colLetters, rowNumber, colNumber } = parsed;
    if (colNumber > maxCol) maxCol = colNumber;
    if (rowNumber > maxRow) maxRow = rowNumber;

    let rowList = rowsMap.get(rowNumber);
    if (!rowList) {
      rowList = [];
      rowsMap.set(rowNumber, rowList);
    }
    rowList.push({ colLetters, colNumber, value, ref });
  }

  // Sắp xếp các dòng theo thứ tự số tăng dần
  const sortedRowNumbers = Array.from(rowsMap.keys()).sort((a, b) => a - b);

  let sheetDataXml = "";
  for (const rowNum of sortedRowNumbers) {
    const rowCells = rowsMap.get(rowNum) ?? [];
    rowCells.sort((a, b) => a.colNumber - b.colNumber);

    let rowXml = `<row r="${rowNum}">`;
    for (const cell of rowCells) {
      const val = cell.value;
      if (val.startsWith("=")) {
        // Công thức tính
        rowXml += `<c r="${cell.ref}"><f>${escapeXml(val.slice(1))}</f></c>`;
      } else if (!isNaN(Number(val)) && val.trim() !== "") {
        // Giá trị số
        rowXml += `<c r="${cell.ref}"><v>${escapeXml(val.trim())}</v></c>`;
      } else {
        // Chuỗi văn bản inline string
        rowXml += `<c r="${cell.ref}" t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`;
      }
    }
    rowXml += `</row>`;
    sheetDataXml += rowXml;
  }

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const packageRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font><sz val="11"/><name val="Segoe UI"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
</styleSheet>`;

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetDataXml}</sheetData>
</worksheet>`;

  const entries: ZipEntryInput[] = [
    { name: "[Content_Types].xml", bytes: new TextEncoder().encode(contentTypesXml) },
    { name: "_rels/.rels", bytes: new TextEncoder().encode(packageRelsXml) },
    { name: "xl/workbook.xml", bytes: new TextEncoder().encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", bytes: new TextEncoder().encode(workbookRelsXml) },
    { name: "xl/styles.xml", bytes: new TextEncoder().encode(stylesXml) },
    { name: "xl/worksheets/sheet1.xml", bytes: new TextEncoder().encode(sheet1Xml) },
  ];

  return createZip(entries);
}

/**
 * Xuất dữ liệu bảng tính thành định dạng CSV (chuẩn RFC 4180 có UTF-8 BOM).
 */
export function sheetsCsvText(content: unknown): string {
  const cells = extractCells(content);
  let maxCol = 1;
  let maxRow = 1;

  for (const ref of Object.keys(cells)) {
    const parsed = parseCellAddress(ref);
    if (!parsed) continue;
    if (parsed.colNumber > maxCol) maxCol = parsed.colNumber;
    if (parsed.rowNumber > maxRow) maxRow = parsed.rowNumber;
  }

  const lines: string[] = [];
  for (let r = 1; r <= maxRow; r += 1) {
    const rowVals: string[] = [];
    for (let c = 1; c <= maxCol; c += 1) {
      let colName = "";
      let rem = c;
      while (rem > 0) {
        rem -= 1;
        colName = String.fromCharCode(65 + (rem % 26)) + colName;
        rem = Math.floor(rem / 26);
      }
      const ref = `${colName}${r}`;
      let val = cells[ref] ?? "";
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      rowVals.push(val);
    }
    lines.push(rowVals.join(","));
  }

  // Thêm UTF-8 BOM để các bộ đọc bảng tính hiển thị chính xác tiếng Việt
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
