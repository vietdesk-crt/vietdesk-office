// @vitest-environment jsdom
/**
 * Kiểm thử bộ đọc tệp Office: dựng ZIP thật (kể cả entry DEFLATE để chạy qua
 * inflate), rồi kiểm tra .docx/.xlsx/.pptx/.odt → mô hình nội bộ.
 */
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { convertOfficeFile, isOfficeDocument } from "../src/office";

const encoder = new TextEncoder();

class ByteWriter {
  private readonly bytes: number[] = [];

  u16(value: number): void {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff);
  }

  u32(value: number): void {
    this.bytes.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    );
  }

  raw(data: Uint8Array): void {
    for (const byte of data) this.bytes.push(byte);
  }

  size(): number {
    return this.bytes.length;
  }

  toUint8(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipInput {
  name: string;
  data: Uint8Array;
  /** true → nén DEFLATE (method 8), không thì lưu thô (method 0). */
  deflate?: boolean;
}

/** Dựng tệp ZIP hợp lệ đủ để ZipArchive đọc lại. */
function buildZip(inputs: ZipInput[]): Uint8Array {
  const file = new ByteWriter();
  const central = new ByteWriter();

  for (const input of inputs) {
    const method = input.deflate ? 8 : 0;
    const payload = input.deflate ? deflateRawSync(input.data) : input.data;
    const crc = crc32(input.data);
    const nameBytes = encoder.encode(input.name);

    const localOffset = file.size();
    file.u32(0x04034b50);
    file.u16(20); // version cần thiết
    file.u16(0); // cờ
    file.u16(method);
    file.u16(0); // giờ
    file.u16(0); // ngày
    file.u32(crc);
    file.u32(payload.length);
    file.u32(input.data.length);
    file.u16(nameBytes.length);
    file.u16(0); // extra
    file.raw(nameBytes);
    file.raw(payload);

    central.u32(0x02014b50);
    central.u16(20); // version tạo
    central.u16(20); // version cần
    central.u16(0); // cờ
    central.u16(method);
    central.u16(0); // giờ
    central.u16(0); // ngày
    central.u32(crc);
    central.u32(payload.length);
    central.u32(input.data.length);
    central.u16(nameBytes.length);
    central.u16(0); // extra
    central.u16(0); // bình luận
    central.u16(0); // đĩa
    central.u16(0); // thuộc tính trong
    central.u32(0); // thuộc tính ngoài
    central.u32(localOffset);
    central.raw(nameBytes);
  }

  const centralBytes = central.toUint8();
  const centralOffset = file.size();
  file.raw(centralBytes);

  file.u32(0x06054b50);
  file.u16(0); // đĩa
  file.u16(0); // đĩa bắt đầu trung tâm
  file.u16(inputs.length);
  file.u16(inputs.length);
  file.u32(centralBytes.length);
  file.u32(centralOffset);
  file.u16(0); // độ dài bình luận

  return file.toUint8();
}

function xml(input: string): Uint8Array {
  return encoder.encode(input);
}

describe("đọc .docx → Writer", () => {
  const documentXml = xml(
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Tiêu đề</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Đậm nghiêng</w:t></w:r><w:r><w:t> thường</w:t></w:r></w:p>` +
      `</w:body></w:document>`,
  );

  it("parser heading, đoạn và mark bold/italic", () => {
    const bytes = buildZip([
      // entry DEFLATE để chắc chắn inflate chạy đúng.
      { name: "word/document.xml", data: documentXml, deflate: true },
      { name: "[Content_Types].xml", data: xml("<Types/>") },
    ]);
    const result = convertOfficeFile("tai-lieu.docx", bytes);
    expect(result.kind).toBe("writer");

    const doc = result.content as {
      type: string;
      content: {
        type: string;
        attrs?: { level?: number };
        content?: { type: string; text?: string; marks?: { type: string }[] }[];
      }[];
    };
    expect(doc.type).toBe("doc");

    const heading = doc.content.find((block) => block.type === "heading");
    expect(heading?.attrs?.level).toBe(1);
    expect(heading?.content?.[0]?.text).toBe("Tiêu đề");

    const paragraph = doc.content.find((block) => block.type === "paragraph");
    const styled = paragraph?.content?.find((node) => node.marks?.length);
    expect(styled?.text).toBe("Đậm nghiêng");
    expect(styled?.marks?.map((mark) => mark.type)).toContain("strong");
    expect(styled?.marks?.map((mark) => mark.type)).toContain("em");
  });

  it("trả về một đoạn trống khi văn bản rỗng", () => {
    const bytes = buildZip([
      {
        name: "word/document.xml",
        data: xml(
          `<w:document xmlns:w="x"><w:body></w:body></w:document>`,
        ),
      },
    ]);
    const doc = convertOfficeFile("rong.docx", bytes).content as {
      content: { type: string }[];
    };
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe("paragraph");
  });
});

describe("đọc .xlsx → Sheets", () => {
  it("đọc sharedStrings, số và inlineStr từ trang tính đầu", () => {
    const bytes = buildZip([
      {
        name: "xl/workbook.xml",
        data: xml(
          `<workbook xmlns="x" xmlns:r="r"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        ),
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data: xml(
          `<Relationships xmlns="r"><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/></Relationships>`,
        ),
      },
      {
        name: "xl/sharedStrings.xml",
        data: xml(
          `<sst><si><t>Tên</t></si><si><t>Địa chỉ</t></si></sst>`,
        ),
        deflate: true,
      },
      {
        name: "xl/worksheets/sheet1.xml",
        data: xml(
          `<worksheet xmlns="x"><sheetData>` +
            `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>123</v></c></row>` +
            `<row r="2"><c r="A2" t="inlineStr"><is><t>inline</t></is></c></row>` +
            `</sheetData></worksheet>`,
        ),
      },
    ]);
    const result = convertOfficeFile("bang.xlsx", bytes);
    expect(result.kind).toBe("sheets");
    expect(result.content).toEqual({
      cells: { A1: "Tên", B1: "123", A2: "inline" },
    });
  });
});

describe("đọc .pptx → Slides", () => {
  it("tách tiêu đề và nội dung theo placeholder", () => {
    const bytes = buildZip([
      {
        name: "ppt/presentation.xml",
        data: xml(
          `<p:presentation xmlns:p="x" xmlns:r="r"><p:sldIdLst><p:sldId id="1" r:id="rId1"/></p:sldIdLst></p:presentation>`,
        ),
      },
      {
        name: "ppt/_rels/presentation.xml.rels",
        data: xml(
          `<Relationships xmlns="r"><Relationship Id="rId1" Type="t" Target="slides/slide1.xml"/></Relationships>`,
        ),
      },
      {
        name: "ppt/slides/slide1.xml",
        data: xml(
          `<p:sld xmlns:a="a" xmlns:p="x"><p:cSld><p:spTree>` +
            `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Giới thiệu</a:t></a:r></a:p></p:txBody></p:sp>` +
            `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Gạch đầu dòng 1</a:t></a:r></a:p><a:p><a:r><a:t>Gạch đầu dòng 2</a:t></a:r></a:p></p:txBody></p:sp>` +
            `</p:spTree></p:cSld></p:sld>`,
        ),
        deflate: true,
      },
    ]);
    const result = convertOfficeFile("bai-giang.pptx", bytes);
    expect(result.kind).toBe("slides");
    const { slides } = result.content as {
      slides: { id: string; title: string; body: string }[];
    };
    expect(slides).toHaveLength(1);
    expect(slides[0].title).toBe("Giới thiệu");
    expect(slides[0].body).toBe("Gạch đầu dòng 1\nGạch đầu dòng 2");
  });
});

describe("đọc .odt → Writer", () => {
  it("đọc tiêu đề và đoạn từ office:text", () => {
    const bytes = buildZip([
      {
        name: "content.xml",
        data: xml(
          `<office:document-content xmlns:office="o" xmlns:text="t">` +
            `<office:body><office:text>` +
            `<text:h text:outline-level="1">Mở đầu</text:h>` +
            `<text:p>Nội dung chính.</text:p>` +
            `</office:text></office:body></office:document-content>`,
        ),
        deflate: true,
      },
    ]);
    const result = convertOfficeFile("van-ban.odt", bytes);
    expect(result.kind).toBe("writer");
    const doc = result.content as {
      content: { type: string; content?: { text?: string }[] }[];
    };
    expect(doc.content[0].type).toBe("heading");
    expect(doc.content[0].content?.[0]?.text).toBe("Mở đầu");
    expect(doc.content[1].content?.[0]?.text).toBe("Nội dung chính.");
  });
});

describe("luồng mở tệp Office", () => {
  it("nhận diện đúng phần mở rộng hỗ trợ", () => {
    expect(isOfficeDocument("a.docx")).toBe(true);
    expect(isOfficeDocument("a.xlsx")).toBe(true);
    expect(isOfficeDocument("a.pptx")).toBe(true);
    expect(isOfficeDocument("a.odt")).toBe(true);
    expect(isOfficeDocument("A.DOCX")).toBe(true);
    expect(isOfficeDocument("a.doc")).toBe(false);
    expect(isOfficeDocument("a.pdf")).toBe(false);
    expect(isOfficeDocument("a.vdx")).toBe(false);
  });

  it("ném lỗi có thông báo khi phần mở rộng không hỗ trợ", () => {
    expect(() => convertOfficeFile("a.rtf", new Uint8Array([1, 2, 3]))).toThrow(
      /chưa được hỗ trợ/,
    );
  });

  it("ném lỗi ZIP khi bytes không phải tệp ZIP hợp lệ", () => {
    expect(() => convertOfficeFile("a.docx", xml("đây không phải zip"))).toThrow(
      /ZIP/,
    );
  });
});
