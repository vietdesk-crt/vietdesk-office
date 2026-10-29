/**
 * Kiểm thử bộ xuất DOCX: tệp ZIP hợp lệ (đọc lại bằng bộ đọc ZIP chuẩn của
 * src/office) và chứa nội dung Writer đúng nghĩa.
 */
import { describe, expect, it } from "vitest";
import { ZipArchive, entryText } from "../src/office/zip";
import { createZip } from "../src/export/binary";
import {
  buildDocxParts,
  isWordDocumentPath,
  writerDocxBytes,
} from "../src/export/docx";

describe("binary — tạo ZIP tối thiểu", () => {
  it("lưu mục stored, đọc lại được bằng ZipArchive", () => {
    const bytes = createZip([
      { name: "hello.xml", bytes: new TextEncoder().encode("Xin chào Việt") },
      { name: "dir/file.txt", bytes: new TextEncoder().encode("ok") },
    ]);
    // Chữ ký ZIP "PK".
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    const zip = ZipArchive.open(bytes);
    expect(new TextDecoder().decode(zip.read("hello.xml").bytes)).toBe(
      "Xin chào Việt",
    );
    expect(zip.read("dir/file.txt").compressed).toBe(false);
  });
});

describe("export/docx — đóng gói Writer thành Word", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Quyết định của Thủ trưởng",
            marks: [{ type: "strong" }],
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Trân trọng",
            marks: [{ type: "em", attrs: {} }],
          },
          { type: "text", text: " đính kèm" },
        ],
      },
      { type: "paragraph" },
    ],
  };

  it("tạo tệp ZIP đọc được với mọi phần bắt buộc của DOCX", () => {
    const bytes = writerDocxBytes(doc, "Quyết định");
    const zip = ZipArchive.open(bytes);
    expect(zip.has("[Content_Types].xml")).toBe(true);
    expect(zip.has("_rels/.rels")).toBe(true);
    expect(zip.has("word/document.xml")).toBe(true);
    expect(zip.has("word/_rels/document.xml.rels")).toBe(true);
    expect(zip.has("word/numbering.xml")).toBe(true);
    expect(zip.has("docProps/core.xml")).toBe(true);
  });

  it("document.xml chứa thân tài liệu đúng nội dung và trang A4 lề NĐ30", () => {
    const { bodyXml } = buildDocxParts(doc, "Quyết định");
    expect(bodyXml).toContain("Quyết định của Thủ trưởng");
    expect(bodyXml).toContain("<w:b/");
    expect(bodyXml).toContain("<w:i/");
    // Đoạn trống vẫn sinh run rỗng để Word giữ dòng.
    expect(bodyXml).toContain('<w:t xml:space="preserve"></w:t>');

    const bytes = writerDocxBytes(doc, "Quyết định");
    const zip = ZipArchive.open(bytes);
    const documentXml = entryText(zip.read("word/document.xml"));
    // A4 11906×16838 twip; lề trái 3 cm = 1701 twip.
    expect(documentXml).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
    expect(documentXml).toContain('<w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701"/>');
  });

  it("ghi lề trang tuỳ chỉnh và thụt lề dòng đầu", () => {
    const custom = {
      type: "doc",
      pageSetup: {
        header: "",
        footer: "",
        showPageNumbers: true,
        margins: { top: 10, right: 20, bottom: 25, left: 40 },
      },
      content: [
        {
          type: "paragraph",
          attrs: { indent: 1, firstLineIndent: 1 },
          content: [{ type: "text", text: "Thụt lề" }],
        },
      ],
    };
    const zip = ZipArchive.open(writerDocxBytes(custom, "Lề"));
    const documentXml = entryText(zip.read("word/document.xml"));
    expect(documentXml).toContain(
      '<w:pgMar w:top="567" w:right="1134" w:bottom="1417" w:left="2268"/>',
    );
    expect(documentXml).toContain('w:left="720" w:firstLine="720"');
  });

  it("danh sách và bảng thành numPr/tbl, khối hỏng không làm sập", () => {
    const tableDoc = {
      type: "doc",
      content: [
        {
          type: "bullet_list",
          content: [
            {
              type: "list_item",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Mục một" }],
                },
              ],
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "table_row",
              content: [
                {
                  type: "table_header",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Cột A" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const { bodyXml } = buildDocxParts(tableDoc, "Bảng");
    expect(bodyXml).toContain("<w:numPr>");
    expect(bodyXml).toContain("<w:tbl>");
    expect(bodyXml).toContain("Cột A");
    expect(bodyXml).toContain('<w:shd w:val="clear" w:fill="EDEDE8"/>');

    // JSON hỏng → tài liệu trống, không ném lỗi.
    const broken = buildDocxParts({ type: "doc", content: "không phải khối" }, "hỏng");
    expect(broken.bodyXml).toContain("<w:p>");
  });

  it("liên kết ngoài nhận rIdH + TargetMode External", () => {
    const linkDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Trang chủ",
              marks: [{ type: "link", attrs: { href: "https://goviet.vn" } }],
            },
          ],
        },
      ],
    };
    const bytes = writerDocxBytes(linkDoc, "Link");
    const zip = ZipArchive.open(bytes);
    const rels = entryText(zip.read("word/_rels/document.xml.rels"));
    expect(rels).toContain('Id="rIdH1"');
    expect(rels).toContain('Target="https://goviet.vn"');
    expect(rels).toContain("TargetMode=\"External\"");
  });
});

describe("export/docx — lọc đường dẫn Word", () => {
  it("nhận .docx/.doc, bỏ .vdx", () => {
    expect(isWordDocumentPath("C:/tai-lieu/BaoCao.docx")).toBe(true);
    expect(isWordDocumentPath("BaoCao.doc")).toBe(true);
    expect(isWordDocumentPath("BaoCao.vdx")).toBe(false);
    expect(isWordDocumentPath(null)).toBe(false);
  });
});
