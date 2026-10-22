import { createEmptyWriterDocument, normalizeWriterContent, WriterEditor } from "../editors/writer";
import type { AppDescriptor } from "./types";

export const writerApp: AppDescriptor = {
  id: "writer",
  label: "Writer",
  glyph: "W",
  defaultName: "Văn bản chưa đặt tên",
  printable: true,
  home: {
    title: "Văn bản",
    description: "Công văn, quyết định, biên bản — chuẩn NĐ30.",
    formats: "Lưu .vdx · DOCX đang phát triển",
  },
  createDefaultContent: createEmptyWriterDocument,
  normalizeContent: normalizeWriterContent,
  renderEditor: ({ document, printSignal, onChange }) => (
    <WriterEditor
      initialContent={document.content}
      title={document.name}
      printSignal={printSignal}
      onChange={({ doc }) => onChange(doc)}
    />
  ),
};
