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
  printable: false,
  home: {
    title: "Trình chiếu",
    description: "Bài giảng, báo cáo, khung 16:9.",
    formats: "Lưu .vdx · PPTX đang phát triển",
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
