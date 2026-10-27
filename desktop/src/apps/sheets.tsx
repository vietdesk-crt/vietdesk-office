import {
  normalizeSheetsContent,
  readCells,
  readStyles,
  SheetsEditor,
} from "../editors/sheets";
import type { AppDescriptor } from "./types";

export const sheetsApp: AppDescriptor = {
  id: "sheets",
  label: "Sheets",
  glyph: "S",
  defaultName: "Bảng tính chưa đặt tên",
  home: {
    title: "Bảng tính",
    description: "Bảng lương, dự toán, công thức và số tiền VND.",
    formats: "Lưu .vdx · XLSX đang phát triển",
  },
  createDefaultContent: () => normalizeSheetsContent(undefined),
  normalizeContent: normalizeSheetsContent,
  renderEditor: ({ document, onChange }) => (
    <SheetsEditor
      initialCells={readCells(document.content)}
      initialStyles={readStyles(document.content)}
      onChange={onChange}
    />
  ),
};
