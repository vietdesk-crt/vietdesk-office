import { describe, expect, it } from "vitest";
import {
  createDocumentEnvelope,
  DOCUMENT_FORMAT,
  DOCUMENT_VERSION,
  documentFileName,
  DocumentFormatError,
  documentTitleFromFileName,
  isVietDeskDocument,
  parseDocument,
  serializeDocument,
} from "@vietdesk/ipc-contract";

describe("định dạng tài liệu .vdx", () => {
  it("tạo và đọc lại nguyên vẹn", () => {
    const envelope = createDocumentEnvelope(
      "writer",
      "Báo cáo tháng 10",
      { type: "doc", content: [] },
      1_000,
    );

    const parsed = parseDocument(serializeDocument(envelope), 2_000);

    expect(parsed.format).toBe(DOCUMENT_FORMAT);
    expect(parsed.version).toBe(DOCUMENT_VERSION);
    expect(parsed.kind).toBe("writer");
    expect(parsed.meta).toEqual({
      title: "Báo cáo tháng 10",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    expect(parsed.content).toEqual({ type: "doc", content: [] });
  });

  it("bỏ qua trường lạ để tương thích về sau", () => {
    const envelope = createDocumentEnvelope("sheets", "Lương", { cells: {} });
    const raw = JSON.parse(serializeDocument(envelope));
    raw.futureField = 42;

    const parsed = parseDocument(JSON.stringify(raw));

    expect(parsed.kind).toBe("sheets");
    expect(parsed.content).toEqual({ cells: {} });
  });

  it("báo lỗi tiếng Việt khi JSON hỏng", () => {
    expect(() => parseDocument("{")).toThrowError(DocumentFormatError);
    expect(() => parseDocument("{")).toThrow("JSON hợp lệ");
  });

  it("từ chối tệp không phải VietDesk", () => {
    expect(() =>
      parseDocument(JSON.stringify({ format: "other", version: 1 })),
    ).toThrow("không phải tài liệu VietDesk");
  });

  it("từ chối phiên bản mới hơn", () => {
    const envelope = createDocumentEnvelope("writer", "X", { type: "doc" });
    const raw = { ...envelope, version: DOCUMENT_VERSION + 1 };

    expect(() => parseDocument(JSON.stringify(raw))).toThrow(
      "phiên bản VietDesk mới hơn",
    );
  });

  it("từ chối loại tài liệu lạ và nội dung thiếu", () => {
    const base = createDocumentEnvelope("writer", "X", { type: "doc" });

    expect(() =>
      parseDocument(JSON.stringify({ ...base, kind: "pdf" })),
    ).toThrow("Loại tài liệu không được hỗ trợ");

    expect(() =>
      parseDocument(JSON.stringify({ ...base, content: null })),
    ).toThrow("không có nội dung");
  });

  it("điền meta thiếu thay vì làm hỏng tài liệu", () => {
    const parsed = parseDocument(
      JSON.stringify({
        format: DOCUMENT_FORMAT,
        version: DOCUMENT_VERSION,
        kind: "slides",
        content: { slides: [] },
      }),
      5_000,
    );

    expect(parsed.meta).toEqual({
      title: "Tài liệu không tên",
      createdAt: 5_000,
      updatedAt: 5_000,
    });
  });
});

describe("tên tệp .vdx", () => {
  it("nhận diện đuôi tệp, không phân biệt hoa thường", () => {
    expect(isVietDeskDocument("Bao-cao.VDX")).toBe(true);
    expect(isVietDeskDocument("Bao-cao.docx")).toBe(false);
  });

  it("thay ký tự cấm và thêm đuôi", () => {
    expect(documentFileName("Báo cáo/Q3: 2026")).toBe("Báo cáo-Q3- 2026.vdx");
    expect(documentFileName("đã có.vdx")).toBe("đã có.vdx");
    expect(documentFileName("   ")).toBe("Tài liệu.vdx");
  });

  it("bỏ đuôi khi hiển thị", () => {
    expect(documentTitleFromFileName("/tmp/Báo cáo.VDX")).toBe("Báo cáo");
    expect(documentTitleFromFileName("windows\\tệp.vdx")).toBe("tệp");
  });
});
