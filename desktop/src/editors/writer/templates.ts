/**
 * Kho biểu mẫu văn bản hành chính Việt Nam chuẩn Nghị định 30/2020/NĐ-CP.
 *
 * Tích hợp sẵn cho Writer để người dùng cơ quan, doanh nghiệp tạo nhanh
 * chỉ với 1 cú click chuột mà không cần định dạng thủ công từ đầu.
 */

export interface AdministrativeTemplate {
  id: string;
  title: string;
  description: string;
  category: "Hành chính" | "Doanh nghiệp" | "Nội bộ";
  content: Record<string, unknown>;
}

export const ADMINISTRATIVE_TEMPLATES: AdministrativeTemplate[] = [
  {
    id: "cong-van-nd30",
    title: "Công văn hành chính (NĐ30)",
    description: "Mẫu công văn gửi cơ quan, đơn vị chuẩn thể thức Nghị định 30/2020/NĐ-CP",
    category: "Hành chính",
    content: {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "table_row",
              content: [
                {
                  type: "table_cell",
                  content: [
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [
                        { type: "text", marks: [{ type: "strong" }], text: "BỘ / CƠ QUAN CHỦ QUẢN" },
                      ],
                    },
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [
                        { type: "text", marks: [{ type: "strong" }], text: "CƠ QUAN BAN HÀNH" },
                      ],
                    },
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [
                        { type: "text", text: "Số:       /CV-VP" },
                      ],
                    },
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [
                        { type: "text", marks: [{ type: "em" }], text: "V/v triển khai công tác văn thư số" },
                      ],
                    },
                  ],
                },
                {
                  type: "table_cell",
                  content: [
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [
                        { type: "text", marks: [{ type: "strong" }], text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" },
                      ],
                    },
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [
                        { type: "text", marks: [{ type: "strong" }, { type: "underline" }], text: "Độc lập - Tự do - Hạnh phúc" },
                      ],
                    },
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [
                        { type: "text", marks: [{ type: "em" }], text: "Hà Nội, ngày      tháng      năm 202..." },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "center", lineHeight: "1.5" },
          content: [
            { type: "text", text: " " },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "center", lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "strong" }], text: "Kính gửi: " },
            { type: "text", text: "Các phòng ban, đơn vị trực thuộc." },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            {
              type: "text",
              text: "Thực hiện chỉ đạo của Lãnh đạo cơ quan về việc nâng cao chất lượng công tác quản lý văn thư và chuyển đổi số văn phòng theo tinh thần Nghị định số 30/2020/NĐ-CP của Chính phủ;",
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            {
              type: "text",
              text: "Cơ quan đề nghị các đơn vị khẩn trương phối hợp và triển khai thực hiện các nội dung trọng tâm sau:",
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            {
              type: "text",
              text: "1. Rà soát, chuẩn hóa thể thức và kỹ thuật trình bày toàn bộ văn bản hành chính theo đúng quy định chuẩn khổ A4, căn lề và sử dụng phông chữ Unicode tiếng Việt.",
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            {
              type: "text",
              text: "2. Đẩy mạnh việc ứng dụng phần mềm văn phòng độc lập để lập, lưu trữ và luân chuyển tài liệu điện tử an toàn, bảo mật thông tin nội bộ.",
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            {
              type: "text",
              text: "3. Tổng hợp kết quả triển khai và gửi báo cáo về Văn phòng trước ngày 25 hàng tháng để tổng hợp trình Lãnh đạo xem xét.",
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            {
              type: "text",
              text: "Nhận được công văn này, yêu cầu Thủ trưởng các đơn vị nghiêm túc chỉ đạo thực hiện./.",
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "left" },
          content: [{ type: "text", text: " " }],
        },
        {
          type: "table",
          content: [
            {
              type: "table_row",
              content: [
                {
                  type: "table_cell",
                  content: [
                    {
                      type: "paragraph",
                      attrs: { align: "left", lineHeight: "1.2" },
                      content: [
                        { type: "text", marks: [{ type: "strong" }, { type: "em" }], text: "Nơi nhận:" },
                      ],
                    },
                    {
                      type: "paragraph",
                      attrs: { align: "left", lineHeight: "1.2" },
                      content: [
                        { type: "text", text: "- Như trên;\n- Lãnh đạo cơ quan (để b/c);\n- Lưu: VT, TH." },
                      ],
                    },
                  ],
                },
                {
                  type: "table_cell",
                  content: [
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [
                        { type: "text", marks: [{ type: "strong" }], text: "THỦ TRƯỞNG CƠ QUAN" },
                      ],
                    },
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [
                        { type: "text", marks: [{ type: "em" }], text: "(Ký, đóng dấu và ghi rõ họ tên)" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "quyet-dinh-nd30",
    title: "Quyết định (Ban hành / Quy định)",
    description: "Mẫu Quyết định cá biệt hoặc ban hành quy chế theo quy định chuẩn",
    category: "Hành chính",
    content: {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "table_row",
              content: [
                {
                  type: "table_cell",
                  content: [
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [{ type: "text", marks: [{ type: "strong" }], text: "TÊN CƠ QUAN BAN HÀNH" }],
                    },
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [{ type: "text", text: "Số:       /QĐ-..." }],
                    },
                  ],
                },
                {
                  type: "table_cell",
                  content: [
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [{ type: "text", marks: [{ type: "strong" }], text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" }],
                    },
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [{ type: "text", marks: [{ type: "strong" }, { type: "underline" }], text: "Độc lập - Tự do - Hạnh phúc" }],
                    },
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [{ type: "text", marks: [{ type: "em" }], text: "..., ngày      tháng      năm 202..." }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "center", lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "strong" }, { type: "fontSize", attrs: { size: "16pt" } }], text: "QUYẾT ĐỊNH" },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "center", lineHeight: "1.4" },
          content: [
            { type: "text", marks: [{ type: "strong" }], text: "Về việc ban hành Quy chế bảo mật và an toàn tài liệu số" },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "center", lineHeight: "1.4" },
          content: [
            { type: "text", marks: [{ type: "strong" }], text: "THỦ TRƯỞNG CƠ QUAN / GIÁM ĐỐC ĐƠN VỊ" },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "em" }], text: "Căn cứ chức năng, nhiệm vụ và quyền hạn của Cơ quan/Đơn vị;" },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "em" }], text: "Căn cứ Nghị định số 30/2020/NĐ-CP ngày 05 tháng 3 năm 2020 của Chính phủ về công tác văn thư;" },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "em" }], text: "Theo đề nghị của Trưởng phòng Hành chính - Quản trị." },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "center", lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "strong" }], text: "QUYẾT ĐỊNH:" },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "strong" }], text: "Điều 1. " },
            { type: "text", text: "Ban hành kèm theo Quyết định này Quy chế an toàn thông tin và bảo mật tài liệu số trong toàn cơ quan." },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "strong" }], text: "Điều 2. " },
            { type: "text", text: "Quyết định này có hiệu lực thi hành kể từ ngày ký. Các quy định trước đây trái với Quyết định này đều bãi bỏ." },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "strong" }], text: "Điều 3. " },
            { type: "text", text: "Chánh Văn phòng, Trưởng các phòng ban, đơn vị trực thuộc và các cá nhân liên quan chịu trách nhiệm thi hành Quyết định này./." },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "table_row",
              content: [
                {
                  type: "table_cell",
                  content: [
                    {
                      type: "paragraph",
                      attrs: { align: "left", lineHeight: "1.2" },
                      content: [{ type: "text", marks: [{ type: "strong" }, { type: "em" }], text: "Nơi nhận:\n" }, { type: "text", text: "- Như Điều 3;\n- Ban Lãnh đạo;\n- Lưu: VT, HS." }],
                    },
                  ],
                },
                {
                  type: "table_cell",
                  content: [
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [{ type: "text", marks: [{ type: "strong" }], text: "THỦ TRƯỞNG ĐƠN VỊ" }],
                    },
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [{ type: "text", marks: [{ type: "em" }], text: "(Ký tên và đóng dấu)" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "bien-ban-hop",
    title: "Biên bản cuộc họp",
    description: "Mẫu ghi chép nội dung, diễn biến và kết luận cuộc họp cơ quan/doanh nghiệp",
    category: "Nội bộ",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { align: "center", lineHeight: "1.2" },
          content: [{ type: "text", marks: [{ type: "strong" }], text: "TÊN ĐƠN VỊ / DOANH NGHIỆP" }],
        },
        {
          type: "paragraph",
          attrs: { align: "center", lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "strong" }, { type: "fontSize", attrs: { size: "15pt" } }], text: "BIÊN BẢN CUỘC HỌP" },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "center", lineHeight: "1.3" },
          content: [{ type: "text", marks: [{ type: "em" }], text: "Về việc: Họp triển khai kế hoạch công tác quý" }],
        },
        {
          type: "paragraph",
          attrs: { align: "left", lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "strong" }], text: "1. Thời gian, địa điểm:" },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "left", indent: 1, lineHeight: "1.5" },
          content: [
            { type: "text", text: "- Thời gian: ... giờ ... ngày ... tháng ... năm 202...\n- Địa điểm: Phòng họp tầng ..." },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "left", lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "strong" }], text: "2. Thành phần tham dự:" },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "left", indent: 1, lineHeight: "1.5" },
          content: [
            { type: "text", text: "- Chủ tọa: Ông/Bà .................... - Chức vụ: ....................\n- Thư ký: Ông/Bà .................... - Chức vụ: ....................\n- Cùng các thành viên tham dự đầy đủ." },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "left", lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "strong" }], text: "3. Nội dung cuộc họp:" },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            { type: "text", text: "Chủ tọa quán triệt mục đích, yêu cầu và nội dung trọng tâm của cuộc họp. Đại diện các bộ phận báo cáo tình hình thực hiện nhiệm vụ và nêu các vướng mắc cần giải quyết." },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "left", lineHeight: "1.5" },
          content: [
            { type: "text", marks: [{ type: "strong" }], text: "4. Kết luận của Chủ tọa:" },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            { type: "text", text: "Sau khi thảo luận và thống nhất ý kiến, Chủ tọa kết luận: Toàn thể đơn vị tập trung hoàn thành các chỉ tiêu trọng yếu đúng thời hạn cam kết." },
          ],
        },
        {
          type: "paragraph",
          attrs: { align: "justify", indent: 1, lineHeight: "1.5" },
          content: [
            { type: "text", text: "Cuộc họp kết thúc vào lúc ... giờ cùng ngày. Biên bản được đọc lại cho mọi người cùng nghe và nhất trí ký tên./." },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "table_row",
              content: [
                {
                  type: "table_cell",
                  content: [
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [{ type: "text", marks: [{ type: "strong" }], text: "THƯ KÝ CUỘC HỌP" }, { type: "text", text: "\n(Ký và ghi rõ họ tên)" }],
                    },
                  ],
                },
                {
                  type: "table_cell",
                  content: [
                    {
                      type: "paragraph",
                      attrs: { align: "center", lineHeight: "1.2" },
                      content: [{ type: "text", marks: [{ type: "strong" }], text: "CHỦ TỌA CUỘC HỌP" }, { type: "text", text: "\n(Ký và ghi rõ họ tên)" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
];
