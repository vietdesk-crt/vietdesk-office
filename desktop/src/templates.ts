/**
 * Danh mục biểu mẫu và mẫu tài liệu chuẩn Việt Nam dùng chung trên Trang chủ.
 *
 * Cho phép người dùng khởi tạo ngay tài liệu chuyên nghiệp (Công văn NĐ30,
 * Bảng lương VND, Báo cáo trình chiếu Bản sắc Việt) chỉ với 1 cú click.
 */

import type { AppId } from "./apps";
import { ADMINISTRATIVE_TEMPLATES } from "./editors/writer/templates";
import type { CellStyleMap } from "./editors/sheets/model";
import type { Slide } from "./editors/slides/model";
import { autoFrameLayoutFromMarkdown, slideFromFrameLayout } from "./editors/slides";

export interface HomeTemplate {
  id: string;
  appId: AppId;
  title: string;
  badge: string;
  description: string;
  documentName: string;
  getContent: () => unknown;
}

export const HOME_TEMPLATES: HomeTemplate[] = [
  // 1. Writer: Công văn hành chính chuẩn NĐ 30/2020/NĐ-CP
  {
    id: "writer-cong-van",
    appId: "writer",
    title: "Công văn hành chính (NĐ30)",
    badge: "Chuẩn NĐ 30",
    description: "Thể thức Quốc hiệu, Tiêu ngữ, số hiệu, trích yếu, chữ ký và nơi nhận chuẩn chỉnh.",
    documentName: "Công văn hành chính",
    getContent: () => ({
      type: "doc",
      content: (ADMINISTRATIVE_TEMPLATES[0]?.content as { content?: unknown[] })?.content ?? [],
    }),
  },

  // 2. Writer: Quyết định ban hành chuẩn NĐ 30
  {
    id: "writer-quyet-dinh",
    appId: "writer",
    title: "Quyết định ban hành (NĐ30)",
    badge: "Chuẩn NĐ 30",
    description: "Mẫu quyết định quy định chức năng, nhiệm vụ hoặc ban hành quy chế nội bộ.",
    documentName: "Quyết định ban hành",
    getContent: () => ({
      type: "doc",
      content: (ADMINISTRATIVE_TEMPLATES[1]?.content as { content?: unknown[] })?.content ?? [],
    }),
  },

  // 3. Writer: Biên bản cuộc họp
  {
    id: "writer-bien-ban",
    appId: "writer",
    title: "Biên bản cuộc họp",
    badge: "Hành chính",
    description: "Ghi chép diễn biến, thành phần tham gia, nội dung thảo luận và kết luận biểu quyết.",
    documentName: "Biên bản cuộc họp",
    getContent: () => ({
      type: "doc",
      content: (ADMINISTRATIVE_TEMPLATES[2]?.content as { content?: unknown[] })?.content ?? [],
    }),
  },

  // 4. Sheets: Bảng thanh toán lương & phụ cấp VND
  {
    id: "sheets-bang-luong",
    appId: "sheets",
    title: "Bảng thanh toán lương & phụ cấp",
    badge: "Tài chính · VND",
    description: "Tự động tính lương, phụ cấp, tạm ứng và thực lĩnh với công thức =SUM() và format VND.",
    documentName: "Bảng thanh toán tiền lương",
    getContent: () => ({
      cells: {
        A1: "BẢNG THANH TOÁN TIỀN LƯƠNG & PHỤ CẤP THÁNG",
        A3: "MÃ NV",
        B3: "HỌ VÀ TÊN",
        C3: "CHỨC VỤ",
        D3: "LƯƠNG CƠ BẢN",
        E3: "NGÀY CÔNG",
        F3: "PHỤ CẤP",
        G3: "TẠM ỨNG",
        H3: "THỰC LĨNH",
        A4: "NV01",
        B4: "Nguyễn Văn An",
        C4: "Trưởng phòng",
        D4: "18000000",
        E4: "22",
        F4: "2000000",
        G4: "3000000",
        H4: "=D4+F4-G4",
        A5: "NV02",
        B5: "Trần Thị Bình",
        C5: "Chuyên viên",
        D5: "12500000",
        E5: "22",
        F5: "1500000",
        G5: "2000000",
        H5: "=D5+F5-G5",
        A6: "NV03",
        B6: "Lê Hoàng Cường",
        C6: "Kế toán viên",
        D6: "10500000",
        E6: "21",
        F6: "1000000",
        G6: "0",
        H6: "=D6+F6-G6",
        B7: "TỔNG CỘNG",
        D7: "=SUM(D4:D6)",
        F7: "=SUM(F4:F6)",
        G7: "=SUM(G4:G6)",
        H7: "=SUM(H4:H6)",
      },
      styles: {
        A1: { bold: true, align: "center" },
        A3: { bold: true, align: "center" },
        B3: { bold: true, align: "center" },
        C3: { bold: true, align: "center" },
        D3: { bold: true, align: "center" },
        E3: { bold: true, align: "center" },
        F3: { bold: true, align: "center" },
        G3: { bold: true, align: "center" },
        H3: { bold: true, align: "center" },
        B7: { bold: true, align: "right" },
        D7: { bold: true, format: "currency" },
        F7: { bold: true, format: "currency" },
        G7: { bold: true, format: "currency" },
        H7: { bold: true, format: "currency" },
        D4: { format: "currency" },
        D5: { format: "currency" },
        D6: { format: "currency" },
        F4: { format: "currency" },
        F5: { format: "currency" },
        F6: { format: "currency" },
        G4: { format: "currency" },
        G5: { format: "currency" },
        G6: { format: "currency" },
        H4: { format: "currency", bold: true },
        H5: { format: "currency", bold: true },
        H6: { format: "currency", bold: true },
      } as CellStyleMap,
    }),
  },

  // 5. Sheets: Bảng theo dõi chấm công tháng
  {
    id: "sheets-cham-cong",
    appId: "sheets",
    title: "Bảng theo dõi chấm công tháng",
    badge: "Nhân sự",
    description: "Theo dõi số ngày công thực tế của nhân sự trong kỳ làm việc với công thức =COUNT().",
    documentName: "Bảng chấm công",
    getContent: () => ({
      cells: {
        A1: "BẢNG CHẤM CÔNG THÁNG",
        A3: "MÃ NV",
        B3: "HỌ VÀ TÊN",
        C3: "TUẦN 1",
        D3: "TUẦN 2",
        E3: "TUẦN 3",
        F3: "TUẦN 4",
        G3: "TỔNG NGÀY CÔNG",
        A4: "NV01",
        B4: "Nguyễn Văn An",
        C4: "5",
        D4: "5",
        E4: "5",
        F4: "5",
        G4: "=SUM(C4:F4)",
        A5: "NV02",
        B5: "Trần Thị Bình",
        C5: "5",
        D5: "4",
        E5: "5",
        F5: "5",
        G5: "=SUM(C5:F5)",
        A6: "NV03",
        B6: "Lê Hoàng Cường",
        C6: "5",
        D6: "5",
        E6: "5",
        F6: "4",
        G6: "=SUM(C6:F6)",
        B7: "TRUNG BÌNH CÔNG",
        G7: "=ROUND(SUM(G4:G6)/3, 1)",
      },
      styles: {
        A1: { bold: true, align: "center" },
        A3: { bold: true, align: "center" },
        B3: { bold: true, align: "center" },
        C3: { bold: true, align: "center" },
        D3: { bold: true, align: "center" },
        E3: { bold: true, align: "center" },
        F3: { bold: true, align: "center" },
        G3: { bold: true, align: "center" },
        B7: { bold: true, align: "right" },
        G7: { bold: true, align: "center" },
        G4: { bold: true, align: "center" },
        G5: { bold: true, align: "center" },
        G6: { bold: true, align: "center" },
      } as CellStyleMap,
    }),
  },

  // 6. Slides: Thuyết trình Auto-Framing 16:9 (Chuẩn HC-Office)
  {
    id: "slides-autoframing",
    appId: "slides",
    title: "Thuyết trình Auto-Framing 16:9 (Chuẩn HC-Office)",
    badge: "Auto-Framing 16:9",
    description: "Bộ slide mẫu chuẩn áp dụng trọn vẹn 5 Archetype hình học: Hero Statement, Metric Callout, Card Grid, Split Two-Column và Classic Stack.",
    documentName: "Thuyet-trinh-Auto-Framing-16-9",
    getContent: () => {
      const markdown = `# VIETDESK OFFICE 2026
Đột phá công nghệ Canvas văn phòng thế hệ mới cho người Việt

---

## Chỉ số Tăng trưởng & Hiệu năng
[Metric: 99.8% | Độ ổn định hệ thống]

---

## 3 Trụ cột Kiến trúc Đột phá
- Khối Độc lập AST (Block Architecture)
- Đồ thị Phụ thuộc DAG (Formula Computation)
- Dàn trang Tự động 16:9 (Auto-Framing CSP)

---

## Báo cáo Doanh thu & Tăng trưởng
Hệ sinh thái VietDesk Office tiếp tục mở rộng quy mô với các giải pháp chuẩn thể thức hành chính NĐ30 và nghiệp vụ kế toán Việt Nam.

| Phân hệ | Quý 1 | Quý 2 | Tăng trưởng |
|---|---|---|---|
| Writer | 12.5 Tỷ | 18.2 Tỷ | +45.6% |
| Sheets | 15.0 Tỷ | 22.8 Tỷ | +52.0% |
| Slides | 8.4 Tỷ | 14.1 Tỷ | +67.8% |

---

## Định hướng Phát triển Giai đoạn 2026–2030
VietDesk Office hướng tới việc hoàn thiện nền tảng văn phòng hợp nhất HyperCanvas, xóa bỏ ranh giới giữa 3 ứng dụng riêng lẻ, mang lại trải nghiệm làm việc mượt mà chuẩn macOS và tương thích tối đa với các tiêu chuẩn mở quốc tế ISO/IEC 29500.`;
      const deck = autoFrameLayoutFromMarkdown(markdown, "Thuyết trình HC-Office");
      return {
        slides: deck.slides.map((res, i) => slideFromFrameLayout(res, `slide-af-${i + 1}`)),
      };
    },
  },

  // 7. Slides: Báo cáo tổng kết quý (Theme Bản sắc Trống Đồng)
  {
    id: "slides-bao-cao",
    appId: "slides",
    title: "Báo cáo tổng kết quý (Bản sắc Việt)",
    badge: "Thuyết trình",
    description: "Bộ slide thuyết trình phong cách Trống Đồng Đông Sơn sang trọng với hiệu ứng chuyển trang.",
    documentName: "Báo cáo tổng kết công tác",
    getContent: () => ({
      slides: [
        {
          id: "slide-1",
          layout: "title",
          title: "BÁO CÁO TỔNG KẾT KẾT QUẢ CÔNG TÁC",
          body: "Đơn vị: Ban Quản lý Dự án & Chuyển đổi số\nKỳ báo cáo: Quý III / Năm 2026",
          background: "#1c140e",
          notes: "Kính chào quý vị đại biểu, sau đây tôi xin trình bày báo cáo tổng kết.",
          transition: "fade",
        },
        {
          id: "slide-2",
          layout: "title-content",
          title: "1. Các thành tựu trọng điểm đã hoàn thành",
          body: "Chuẩn hóa 100% thể thức văn bản hành chính theo Nghị định 30/2020/NĐ-CP\nTriển khai hệ thống bảng tính quản trị ngân sách và nhân sự tự động\nĐảm bảo an toàn thông tin và chủ quyền dữ liệu số cơ quan",
          background: "#1c140e",
          notes: "Điểm qua 3 mục tiêu then chốt đạt được trong quý.",
          transition: "slide",
        },
        {
          id: "slide-3",
          layout: "section",
          title: "2. Phương hướng và Kế hoạch Quý IV",
          body: "Tối ưu hóa quy trình phối hợp liên đơn vị\nĐẩy mạnh ứng dụng công nghệ số toàn diện",
          background: "#1c140e",
          notes: "Chuyển sang phần phương hướng hành động tiếp theo.",
          transition: "zoom",
        },
      ] as Slide[],
    }),
  },

  // 7. Slides: Giới thiệu dự án & sản phẩm (Theme Doanh nghiệp Navy)
  {
    id: "slides-du-an",
    appId: "slides",
    title: "Kế hoạch triển khai dự án (Navy)",
    badge: "Doanh nghiệp",
    description: "Trình bày giải pháp, mục tiêu và lộ trình thực hiện 4 giai đoạn hiện đại.",
    documentName: "Kế hoạch triển khai dự án",
    getContent: () => ({
      slides: [
        {
          id: "slide-1",
          layout: "title",
          title: "KẾ HOẠCH TRIỂN KHAI DỰ ÁN 2026",
          body: "Giải pháp văn phòng số độc lập & tối ưu hóa quy trình làm việc\nVietDesk Enterprise Solutions",
          background: "#0f172a",
          notes: "Giới thiệu tổng quan đề án triển khai hệ thống.",
          transition: "fade",
        },
        {
          id: "slide-2",
          layout: "title-content",
          title: "Lộ trình thực hiện 4 giai đoạn",
          body: "Giai đoạn 1: Khảo sát quy trình và hạ tầng hiện hữu\nGiai đoạn 2: Cài đặt và tích hợp chuẩn Nghị định 30\nGiai đoạn 3: Đào tạo cán bộ chuyên trách và người dùng\nGiai đoạn 4: Nghiệm thu và đưa vào vận hành chính thức",
          background: "#0f172a",
          notes: "Nêu rõ các mốc thời gian và phân công trách nhiệm.",
          transition: "slide",
        },
      ] as Slide[],
    }),
  },
];
