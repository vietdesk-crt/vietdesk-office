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
    formats: "Lưu .xlsx / .vdx / .csv",
  },
  createDefaultContent: () => normalizeSheetsContent(undefined),
  normalizeContent: normalizeSheetsContent,
  renderEditor: ({ document, onChange }) => (
    <SheetsEditor
      initialCells={readCells(document.content)}
      initialStyles={readStyles(document.content)}
      title={document.name}
      documentPath={document.path}
      saveStatus={document.saveStatus}
      dirty={document.dirty}
      onChange={onChange}
    />
  ),
};
