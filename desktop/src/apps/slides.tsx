import {
  normalizeSlidesContent,
  readSlides,
  SlidesEditor,
} from "../editors/slides";
import type { AppDescriptor } from "./types";

export const slidesApp: AppDescriptor = {
  id: "slides",
  label: "Slides",
  glyph: "P",
  defaultName: "Trình chiếu chưa đặt tên",
  home: {
    title: "Trình chiếu Auto-Framing",
    description: "Tỷ lệ chuẩn 16:9, tự động chọn 5 Archetypes và cân bằng thị giác.",
    formats: "Lưu .pptx / .vdx · Chuẩn 16:9",
  },
  createDefaultContent: () => normalizeSlidesContent(undefined),
  normalizeContent: normalizeSlidesContent,
  renderEditor: ({ document, onChange }) => (
    <SlidesEditor
      initialSlides={readSlides(document.content)}
      title={document.name}
      documentPath={document.path}
      saveStatus={document.saveStatus}
      dirty={document.dirty}
      onChange={(slides) => onChange({ slides })}
    />
  ),
};
