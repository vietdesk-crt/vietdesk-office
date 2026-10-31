// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { convertOfficeFile } from "../src/office";
import {
  isCsvDocumentPath,
  isExcelDocumentPath,
  sheetsCsvText,
  sheetsXlsxBytes,
} from "../src/export/xlsx";
import { isPowerPointDocumentPath, slidesPptxBytes } from "../src/export/pptx";

describe("export/xlsx — Xuất Excel (.xlsx) & CSV (.csv) chuẩn OpenXML", () => {
  it("nhận diện đúng phần mở rộng tệp", () => {
    expect(isExcelDocumentPath("bang-luong.xlsx")).toBe(true);
    expect(isExcelDocumentPath("C:/data/DuToan.xls")).toBe(true);
    expect(isExcelDocumentPath("DuToan.vdx")).toBe(false);
    expect(isExcelDocumentPath(null)).toBe(false);

    expect(isCsvDocumentPath("data.csv")).toBe(true);
    expect(isCsvDocumentPath("data.xlsx")).toBe(false);
    expect(isCsvDocumentPath(null)).toBe(false);
  });

  it("tạo tệp .xlsx hợp lệ và đọc ngược lại được qua convertOfficeFile", () => {
    const content = {
      cells: {
        A1: "Mã NV",
        B1: "Họ và tên",
        C1: "Lương",
        A2: "NV001",
        B2: "Nguyễn Văn A",
        C2: "15000000",
      },
    };

    const bytes = sheetsXlsxBytes(content, "Bảng lương");
    expect(bytes.length).toBeGreaterThan(0);

    const converted = convertOfficeFile("BangLuong.xlsx", bytes);
    expect(converted.kind).toBe("sheets");
    const cells = (converted.content as { cells: Record<string, string> }).cells;
    expect(cells.A1).toBe("Mã NV");
    expect(cells.B1).toBe("Họ và tên");
    expect(cells.C1).toBe("Lương");
    expect(cells.A2).toBe("NV001");
    expect(cells.B2).toBe("Nguyễn Văn A");
    expect(cells.C2).toBe("15000000");
  });

  it("xuất tệp CSV có UTF-8 BOM chuẩn tiếng Việt", () => {
    const content = {
      cells: {
        A1: "Tên",
        B1: "Ghi chú, đặc biệt",
        A2: "Nguyễn Văn B",
        B2: "Đã duyệt",
      },
    };

    const csv = sheetsCsvText(content);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Tên");
    expect(csv).toContain('"Ghi chú, đặc biệt"');
    expect(csv).toContain("Nguyễn Văn B");
  });
});

describe("export/pptx — Xuất PowerPoint (.pptx) chuẩn OpenXML", () => {
  it("nhận diện đúng phần mở rộng tệp", () => {
    expect(isPowerPointDocumentPath("thuyet-trinh.pptx")).toBe(true);
    expect(isPowerPointDocumentPath("slide.ppt")).toBe(true);
    expect(isPowerPointDocumentPath("slide.vdx")).toBe(false);
    expect(isPowerPointDocumentPath(null)).toBe(false);
  });

  it("tạo tệp .pptx hợp lệ và đọc ngược lại được qua convertOfficeFile", () => {
    const content = {
      slides: [
        {
          id: "slide-1",
          title: "Báo cáo thường niên 2026",
          body: "Tăng trưởng doanh thu 25%\nMở rộng thị trường trong nước",
          background: "#0f172a",
        },
        {
          id: "slide-2",
          title: "Kế hoạch quý 4",
          body: "Tối ưu hóa quy trình làm việc\nỨng dụng công nghệ mới",
        },
      ],
    };

    const bytes = slidesPptxBytes(content, "Báo cáo");
    expect(bytes.length).toBeGreaterThan(0);

    const converted = convertOfficeFile("BaoCao.pptx", bytes);
    expect(converted.kind).toBe("slides");
    const slides = (converted.content as { slides: Array<{ title: string; body: string }> }).slides;
    expect(slides.length).toBe(2);
    expect(slides[0]?.title).toBe("Báo cáo thường niên 2026");
    expect(slides[0]?.body).toContain("Tăng trưởng doanh thu 25%");
    expect(slides[1]?.title).toBe("Kế hoạch quý 4");
    expect(slides[1]?.body).toContain("Tối ưu hóa quy trình làm việc");
  });
});
