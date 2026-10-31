import { createEmptyWriterDocument, normalizeWriterContent, WriterEditor } from "../editors/writer";
import type { AppDescriptor } from "./types";

export const writerApp: AppDescriptor = {
  id: "writer",
  label: "Writer",
  glyph: "W",
  defaultName: "Văn bản chưa đặt tên",
  home: {
    title: "Văn bản",
    description: "Công văn, quyết định, biên bản — chuẩn NĐ30.",
    formats: "Lưu .docx / .vdx · Xuất PDF",
  },
  createDefaultContent: createEmptyWriterDocument,
  normalizeContent: normalizeWriterContent,
  renderEditor: ({ document, onChange }) => (
    <WriterEditor
      initialContent={document.content}
      title={document.name}
      documentPath={document.path}
      saveStatus={document.saveStatus}
      dirty={document.dirty}
      onChange={({ doc }) => onChange(doc)}
    />
  ),
};
