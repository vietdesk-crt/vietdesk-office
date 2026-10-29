import { DOCUMENT_KINDS } from "@vietdesk/ipc-contract";
import { describe, expect, it } from "vitest";
import {
  APP_IDS,
  APPS,
  HOME_CARDS,
  appDisplay,
  appForKind,
  isAppId,
} from "../src/apps";
import { normalizeSheetsContent, readCells } from "../src/editors/sheets";
import {
  createDefaultSlides,
  normalizeSlidesContent,
  readSlides,
  slideBodyLines,
} from "../src/editors/slides";
import {
  createEmptyWriterDocument,
  normalizeWriterContent,
} from "../src/editors/writer";
import { writerSchema } from "../src/editors/writer/schema";

function paragraphDoc(text = ""): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        ...(text
          ? { content: [{ type: "text", text }] }
          : {}),
      },
    ],
  };
}

describe("registry ứng dụng", () => {
  it("dùng chung danh sách loại tài liệu với ipc-contract", () => {
    expect(APP_IDS).toBe(DOCUMENT_KINDS);
    expect(Object.keys(APPS).sort()).toEqual([...DOCUMENT_KINDS].sort());
  });

  it("mỗi descriptor khớp id và có metadata đầy đủ", () => {
    for (const kind of DOCUMENT_KINDS) {
      const app = APPS[kind];
      expect(app.id).toBe(kind);
      expect(app.label.trim().length).toBeGreaterThan(0);
      expect(app.glyph.trim().length).toBeGreaterThan(0);
      expect(app.defaultName.trim().length).toBeGreaterThan(0);
      expect(app.home.title.trim().length).toBeGreaterThan(0);
      expect(app.home.description.trim().length).toBeGreaterThan(0);
      expect(app.home.formats.trim().length).toBeGreaterThan(0);
    }
  });

  it("thẻ tạo mới đi theo thứ tự ứng dụng", () => {
    expect(HOME_CARDS.map((card) => card.kind)).toEqual([...DOCUMENT_KINDS]);
  });

  it("chuẩn hoá nội dung mặc định qua đúng model của từng ứng dụng", () => {
    const writer = APPS.writer.normalizeContent(undefined);
    expect(writer).toMatchObject({ type: "doc", comments: [] });

    const sheets = APPS.sheets.normalizeContent(undefined);
    expect(sheets).toEqual({ cells: {} });

    const slides = APPS.slides.normalizeContent(undefined);
    expect(slides).toEqual({ slides: createDefaultSlides() });
  });

  it("nhận diện loại và hiển thị tệp không rõ loại", () => {
    expect(isAppId("writer")).toBe(true);
    expect(isAppId("unknown")).toBe(false);
    expect(appForKind("unknown")).toBe("writer");
    expect(appDisplay("unknown")).toEqual({
      label: "Tệp khác",
      glyph: "?",
    });
    expect(appDisplay("sheets")).toEqual({
      label: APPS.sheets.label,
      glyph: APPS.sheets.glyph,
    });
  });
});

describe("model nội dung Writer", () => {
  it("tạo văn bản trống có đủ cấu trúc lưu", () => {
    const empty = createEmptyWriterDocument() as Record<string, unknown>;
    expect(empty).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph" }],
      comments: [],
    });
    expect(empty.pageSetup).toMatchObject({
      header: "",
      footer: "",
      showPageNumbers: true,
    });
  });

  it("thay nội dung hỏng bằng văn bản trống thay vì ném lỗi", () => {
    for (const value of [
      null,
      "chuỗi",
      [],
      { type: "paragraph" },
      { type: "doc", content: [{ type: "khong-ton-tai" }] },
    ]) {
      expect(normalizeWriterContent(value)).toEqual(createEmptyWriterDocument());
    }
  });

  it("giữ nội dung hợp lệ và chuẩn hoá pageSetup/comments", () => {
    const normalized = normalizeWriterContent({
      ...paragraphDoc("Xin chào"),
      pageSetup: { header: "Đầu trang", showPageNumbers: false },
      comments: [
        null,
        { id: "", text: "bỏ" },
        { id: "c1", text: "Góp ý", author: 7, quote: "Xin chào" },
      ],
    }) as Record<string, unknown>;

    // Schema gán attrs mặc định (align/indent/lineHeight) khi khôi phục —
    // nội dung hợp lệ được giữ nguyên theo nghĩa, so bằng lượt khôi phục schema.
    const expected = writerSchema.nodeFromJSON(
      paragraphDoc("Xin chào") as Parameters<
        typeof writerSchema.nodeFromJSON
      >[0],
    ).toJSON();
    expect(normalized.content).toEqual(expected.content);
    expect(normalized.pageSetup).toEqual({
      header: "Đầu trang",
      footer: "",
      showPageNumbers: false,
      margins: { top: 20, right: 15, bottom: 20, left: 30 },
    });
    expect(normalized.comments).toHaveLength(1);
    expect(normalized.comments).toMatchObject([
      { id: "c1", text: "Góp ý", author: "Tác giả", quote: "Xin chào" },
    ]);
  });
});

describe("model nội dung Sheets", () => {
  it("trả bảng ô rỗng khi dữ liệu không hợp lệ", () => {
    expect(normalizeSheetsContent(undefined)).toEqual({ cells: {} });
    expect(normalizeSheetsContent({ cells: "không phải bản đồ" })).toEqual({
      cells: {},
    });
  });

  it("chỉ giữ giá trị chuỗi, bỏ khoá lạ", () => {
    expect(
      readCells({
        cells: {
          A1: "1",
          B2: 2,
          C3: null,
          D4: "=SUM(A1:B2)",
          E5: { value: "x" },
        },
      }),
    ).toEqual({ A1: "1", D4: "=SUM(A1:B2)" });
    expect(normalizeSheetsContent({ cells: { A1: "1" } })).toEqual({
      cells: { A1: "1" },
    });
  });
});

describe("model nội dung Slides", () => {
  it("dùng bộ slide mặc định khi dữ liệu không hợp lệ hoặc rỗng", () => {
    expect(normalizeSlidesContent(undefined)).toEqual({
      slides: createDefaultSlides(),
    });
    expect(readSlides({ slides: [] })).toEqual(createDefaultSlides());
    expect(readSlides({ slides: [{ id: 1 }, null] })).toEqual(
      createDefaultSlides(),
    );
  });

  it("bỏ slide sai cấu trúc, điền mặc định trường mở rộng", () => {
    const slides = readSlides({
      slides: [
        { id: "s1", title: "Mở đầu", body: "Nội dung", extra: true },
        null,
        { id: "s2", title: "Thiếu body" },
        "slide",
      ],
    });

    expect(slides).toEqual([
      {
        id: "s1",
        layout: "title-content",
        title: "Mở đầu",
        body: "Nội dung",
        background: null,
        notes: "",
      },
    ]);
    expect(normalizeSlidesContent({ slides })).toEqual({ slides });
  });

  it("giữ layout hợp lệ, color hex hợp lệ và loại giá trị xấu", () => {
    const slides = readSlides({
      slides: [
        {
          id: "s1",
          layout: "section",
          title: "Ngăn cách",
          body: "",
          background: "#1e1e3f",
          notes: "Ghi chú",
        },
        {
          id: "s2",
          layout: "khong-ton-tai",
          title: "X",
          body: "Y",
          background: "url(evil)",
          notes: 42,
        },
      ],
    });

    expect(slides[0]).toEqual({
      id: "s1",
      layout: "section",
      title: "Ngăn cách",
      body: "",
      background: "#1e1e3f",
      notes: "Ghi chú",
    });
    // Layout sai → mặc định; background không phải hex → null; notes sai → "".
    expect(slides[1]).toMatchObject({
      layout: "title-content",
      background: null,
      notes: "",
    });
  });

  it("tách dòng nội dung và gỡ ký hiệu đầu dòng tự gõ", () => {
    expect(slideBodyLines("• Một\n- Hai\nBa\n\n   ")).toEqual([
      "Một",
      "Hai",
      "Ba",
    ]);
    expect(slideBodyLines("")).toEqual([]);
  });
});
