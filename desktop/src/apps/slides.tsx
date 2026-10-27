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
    formats: "Lưu .vdx · Chuẩn HC-Office 16:9",
  },
  createDefaultContent: () => normalizeSlidesContent(undefined),
  normalizeContent: normalizeSlidesContent,
  renderEditor: ({ document, onChange }) => (
    <SlidesEditor
      initialSlides={readSlides(document.content)}
      onChange={(slides) => onChange({ slides })}
    />
  ),
};
