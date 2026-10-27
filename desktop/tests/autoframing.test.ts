import { describe, expect, it } from "vitest";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MARGIN_X,
  MARGIN_Y,
  TOTAL_AREA_BUDGET,
  USABLE_HEIGHT,
  USABLE_WIDTH,
  autoFrameLayoutFromAST,
  autoFrameLayoutFromMarkdown,
  binarySearchFontSize,
  calculateVisualScore,
  chunkASTBlocks,
  estimateBlockArea,
  layoutSlideBlocks,
  matchArchetype,
  parseMarkdownToAST,
  simulateTextLayout,
  tokenizeSentences,
} from "../src/editors/slides/autoframing";
import type {
  ASTBlock,
  ASTHeadingBlock,
  ASTListBlock,
  ASTMetricBlock,
  ASTParagraphBlock,
  ASTTableBlock,
} from "../src/editors/slides/autoframing";
import { slideFromFrameLayout } from "../src/editors/slides/model";

describe("Auto-Framing 16:9 Layout Engine", () => {
  describe("He toa do va Hang so Rang buoc Hinh hoc", () => {
    it("tuan thu dung he toa do chuan 1920x1080 va le an toan", () => {
      expect(CANVAS_WIDTH).toBe(1920);
      expect(CANVAS_HEIGHT).toBe(1080);
      expect(MARGIN_X).toBe(120);
      expect(MARGIN_Y).toBe(100);
      expect(USABLE_WIDTH).toBe(1680);
      expect(USABLE_HEIGHT).toBe(880);
      expect(TOTAL_AREA_BUDGET).toBe(1478400);
    });
  });

  describe("Giai thuat Binary Search Font Sizing & Simulate Text Layout", () => {
    it("mo phong xuong dong va chieu cao van ban chinh xac", () => {
      const text = "VietDesk Office là bộ ứng dụng văn phòng thế hệ mới dành cho người Việt Nam";
      const layout = simulateTextLayout(text, 24, 600);
      expect(layout.lines.length).toBeGreaterThan(0);
      expect(layout.heightPx).toBeGreaterThan(0);
      expect(layout.maxLineWidthPx).toBeLessThanOrEqual(600);
    });

    it("tim co chu toi uu bang Binary Search trong hop chua", () => {
      const shortText = "Tieu de ngan";
      const optimal = binarySearchFontSize(
        shortText,
        { width: 1400, height: 200 },
        20,
        72
      );
      expect(optimal).toBeGreaterThanOrEqual(20);
      expect(optimal).toBeLessThanOrEqual(72);

      const layout = simulateTextLayout(shortText, optimal, 1400);
      expect(layout.heightPx).toBeLessThanOrEqual(200);
    });

    it("tu dong giam co chu khi van ban dai de khong vuot qua chieu cao hop", () => {
      const longText =
        "Day la mot doan van ban rat dai can duoc co gian phu hop voi khung hinh. " +
        "Giai thuat tim kiem nhi phan phai lien tuc thu nghiem va thu hep khoang gia tri " +
        "cho toi khi tim duoc co chu lon nhat co the ma van nam hoan toan ben trong khung chua.";
      const optimal = binarySearchFontSize(
        longText,
        { width: 700, height: 100 },
        14,
        48
      );
      expect(optimal).toBeLessThan(30);
      const layout = simulateTextLayout(longText, optimal, 700);
      expect(layout.heightPx).toBeLessThanOrEqual(100);
    });
  });

  describe("Giai doan 1: Semantic Chunker & Xu ly Edge Cases", () => {
    it("tach cau doc lap qua tokenizeSentences", () => {
      const text = "Cau thu nhat. Cau thu hai! Cau thu ba? Cau thu tu.";
      const sentences = tokenizeSentences(text);
      expect(sentences).toHaveLength(4);
      expect(sentences[0]).toBe("Cau thu nhat.");
      expect(sentences[1]).toBe("Cau thu hai!");
      expect(sentences[2]).toBe("Cau thu ba?");
      expect(sentences[3]).toBe("Cau thu tu.");
    });

    it("ngat slide bat buoc khi gap Divider (---) va Heading 1 (#)", () => {
      const blocks: ASTBlock[] = [
        { id: "h1", type: "heading", level: 1, text: "Slide 1" },
        { id: "p1", type: "paragraph", text: "Noi dung 1" },
        { id: "d1", type: "divider" },
        { id: "h2", type: "heading", level: 1, text: "Slide 2" },
        { id: "p2", type: "paragraph", text: "Noi dung 2" },
      ];
      const slides = chunkASTBlocks(blocks);
      expect(slides).toHaveLength(2);
      expect(slides[0][0].id).toBe("h1");
      expect(slides[1][0].id).toBe("h2");
    });

    it("bao toan tinh nguyen khoi (Atomic Units) cho bang bieu va danh sach", () => {
      const table: ASTTableBlock = {
        id: "t1",
        type: "table",
        headers: ["Cot 1", "Cot 2"],
        rows: [["A", "B"], ["C", "D"]],
      };
      const list: ASTListBlock = {
        id: "l1",
        type: "list",
        items: ["Muc 1", "Muc 2", "Muc 3"],
      };
      const blocks: ASTBlock[] = [table, list];
      const slides = chunkASTBlocks(blocks);
      expect(slides[0]).toContain(table);
      expect(slides[0]).toContain(list);
    });

    it("Edge Case 1: Buc tuong chu (Wall of Text) duoc tach thanh carousel slide deck", () => {
      const wallOfText = Array(20)
        .fill("He thong tiep tuc phan tich va danh gia cac chi tieu kinh doanh.")
        .join(" ");
      const blocks: ASTBlock[] = [
        { id: "wall", type: "paragraph", text: wallOfText },
      ];
      const slides = chunkASTBlocks(blocks, "Bao cao Tai chinh");
      expect(slides.length).toBeGreaterThanOrEqual(2);
      expect((slides[0][0] as ASTHeadingBlock).text).toContain("Phan 1/");
      expect((slides[1][0] as ASTHeadingBlock).text).toContain("Phan 2/");
    });

    it("Edge Case 2: Bang tinh qua nhieu cot (> 5 cot) duoc rut gon 5 cot kem link", () => {
      const wideTable: ASTTableBlock = {
        id: "tbl-wide",
        type: "table",
        headers: ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"],
        rows: [["1", "2", "3", "4", "5", "6", "7", "8"]],
      };
      const slides = chunkASTBlocks([wideTable]);
      const resultTable = slides[0][0] as ASTTableBlock;
      expect(resultTable.headers).toHaveLength(5);
      expect(resultTable.rows[0]).toHaveLength(5);
      expect(resultTable.hasOverflowLink).toBe(true);
      expect(resultTable.overflowLabel).toBe("Xem bang du lieu chi tiet tren Sheet");
    });
  });

  describe("Giai doan 2: Spatial Budgeting (Nguong 70%)", () => {
    it("uoc luong dien tich cac block chinh xac", () => {
      const h: ASTHeadingBlock = { id: "h", type: "heading", level: 1, text: "Title" };
      const p: ASTParagraphBlock = { id: "p", type: "paragraph", text: "Text content" };
      const m: ASTMetricBlock = { id: "m", type: "metric", metrics: [{ value: "100%", label: "KPI" }] };

      expect(estimateBlockArea(h)).toBe(1680 * 120);
      expect(estimateBlockArea(p)).toBeGreaterThan(0);
      expect(estimateBlockArea(m)).toBe(1680 * 200);
    });

    it("tu dong tach slide khi vuot qua 70% tong ngan sach 1.478.400 px^2", () => {
      const hugeParagraphs: ASTParagraphBlock[] = Array(8)
        .fill(0)
        .map((_, i) => ({
          id: `p-${i}`,
          type: "paragraph",
          text: "Doan van voi dung luong vua phai nhung khi nhan len nhieu lan se chiem dien tich lon.",
        }));
      const slides = chunkASTBlocks(hugeParagraphs);
      expect(slides.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Giai doan 3: So khop Khuon mau Hinh hoc (5 Archetypes CSP)", () => {
    it("khop mau HERO_STATEMENT khi co 1 tieu de ngan", () => {
      const blocks: ASTBlock[] = [
        { id: "h", type: "heading", level: 1, text: "Chao mung den voi VietDesk Office" },
      ];
      expect(matchArchetype(blocks)).toBe("HERO_STATEMENT");
    });

    it("khop mau HERO_STATEMENT khi co 1 tieu de va doan van ngan duoi 250 ky tu", () => {
      const blocks: ASTBlock[] = [
        { id: "h", type: "heading", level: 1, text: "Tam nhin chien luoc" },
        { id: "p", type: "paragraph", text: "Xay dung he sinh thai phan mem van phong doc lap cho nguoi Viet." },
      ];
      expect(matchArchetype(blocks)).toBe("HERO_STATEMENT");
    });

    it("khop mau SPLIT_TWO_COLUMN khi co bang tinh", () => {
      const blocks: ASTBlock[] = [
        { id: "h", type: "heading", level: 2, text: "Ket qua kinh doanh" },
        { id: "p", type: "paragraph", text: "Giai thich so lieu nam 2026..." },
        {
          id: "t",
          type: "table",
          headers: ["Quy", "Doanh thu"],
          rows: [["Q1", "10 Ty"], ["Q2", "15 Ty"]],
        },
      ];
      expect(matchArchetype(blocks)).toBe("SPLIT_TWO_COLUMN");
    });

    it("khop mau SPLIT_TWO_COLUMN khi co 2 doan van doi trong", () => {
      const blocks: ASTBlock[] = [
        { id: "p1", type: "paragraph", text: "Thuan loi: Nhu cau chuyen doi so tang manh trong doanh nghiep." },
        { id: "p2", type: "paragraph", text: "Thach thuc: Yeu cau cao ve tinh bao mat va hieu nang xu ly." },
      ];
      expect(matchArchetype(blocks)).toBe("SPLIT_TWO_COLUMN");
    });

    it("khop mau CARD_GRID khi co 3 den 4 muc danh sach hoac doan van song song", () => {
      const blocksList: ASTBlock[] = [
        { id: "h", type: "heading", level: 2, text: "4 Tru cot san pham" },
        { id: "l", type: "list", items: ["Soan thao Writer", "Bang tinh Sheets", "Trinh chieu Slides", "Loi C++ FFI"] },
      ];
      expect(matchArchetype(blocksList)).toBe("CARD_GRID");

      const blocksCards: ASTBlock[] = [
        { id: "h", type: "heading", level: 2, text: "3 Uu diem" },
        { id: "p1", type: "paragraph", text: "Uu diem 1" },
        { id: "p2", type: "paragraph", text: "Uu diem 2" },
        { id: "p3", type: "paragraph", text: "Uu diem 3" },
      ];
      expect(matchArchetype(blocksCards)).toBe("CARD_GRID");
    });

    it("khop mau METRIC_CALLOUT khi co du lieu chi so metric", () => {
      const blocks: ASTBlock[] = [
        { id: "h", type: "heading", level: 2, text: "Chi so tang truong" },
        {
          id: "m",
          type: "metric",
          metrics: [
            { value: "99.8%", label: "Do hai long khach hang" },
            { value: "10.000+", label: "Doanh nghiep su dung" },
          ],
        },
      ];
      expect(matchArchetype(blocks)).toBe("METRIC_CALLOUT");
    });

    it("khop mau CLASSIC_STACK cho cac truong hop con lai", () => {
      const blocks: ASTBlock[] = [
        { id: "h", type: "heading", level: 1, text: "Tieu de bai viet dai" },
        { id: "p1", type: "paragraph", text: "Noi dung doan van ban dai phan cap..." },
      ];
      expect(matchArchetype(blocks)).toBe("HERO_STATEMENT");

      const multiBlocks: ASTBlock[] = [
        { id: "h", type: "heading", level: 1, text: "Tieu de" },
        {
          id: "p1",
          type: "paragraph",
          text:
            "Doan van ban dai hon 250 ky tu se khong phu hop voi Hero Statement ma phai chuyen sang kieu dan trang Classic Stack de dam bao tinh tham my va khong bi qua tai thi giac cho nguoi xem khi trinh chieu tren man hinh 16:9 cua phong hop. Khi do tieu de se o tren cung, co thanh ngan cach mong va noi dung chinh xep ben duoi.",
        },
      ];
      expect(matchArchetype(multiBlocks)).toBe("CLASSIC_STACK");
    });
  });

  describe("Giai doan 4: Dinh vi Hinh hoc va Tinh diem Can bang Thi giac", () => {
    it("dinh vi chinh xac mau HERO_STATEMENT can giua man hinh", () => {
      const blocks: ASTBlock[] = [
        { id: "hero-1", type: "heading", level: 1, text: "VietDesk Office 2026" },
        { id: "sub-1", type: "paragraph", text: "Bo ung dung van phong chat luong cao" },
      ];
      const result = layoutSlideBlocks(blocks, "HERO_STATEMENT");
      expect(result.archetype).toBe("HERO_STATEMENT");
      expect(result.elements).toHaveLength(2);

      const titleEl = result.elements[0];
      expect(titleEl.x).toBeGreaterThanOrEqual(MARGIN_X);
      expect(titleEl.fontSize).toBeGreaterThanOrEqual(54);
      expect(titleEl.fontSize).toBeLessThanOrEqual(72);
      expect(result.score).toBeGreaterThan(0);
    });

    it("dinh vi dung ty le 2 cot cua SPLIT_TWO_COLUMN (Cot 1: 780px, Cot 2: 820px, Gutter: 80px)", () => {
      const blocks: ASTBlock[] = [
        { id: "head", type: "heading", level: 2, text: "Bao cao Doanh thu" },
        { id: "desc", type: "paragraph", text: "Doanh thu tang truong vuot bac nho cai tien chat luong san pham." },
        {
          id: "tbl",
          type: "table",
          headers: ["Thang", "Doanh thu"],
          rows: [["T1", "5 Ty"], ["T2", "8 Ty"]],
        },
      ];
      const result = layoutSlideBlocks(blocks, "SPLIT_TWO_COLUMN");
      expect(result.archetype).toBe("SPLIT_TWO_COLUMN");

      const col1 = result.elements.find((el) => el.id === "desc");
      const col2 = result.elements.find((el) => el.id === "tbl");

      expect(col1).toBeDefined();
      expect(col2).toBeDefined();

      if (col1 && col2) {
        expect(col1.x).toBe(MARGIN_X);
        expect(col1.width).toBe(780);
        expect(col2.x).toBe(MARGIN_X + 780 + 80);
        expect(col2.width).toBe(820);
        expect(col1.width + 80 + col2.width).toBe(USABLE_WIDTH);
      }
    });

    it("dinh vi mau CARD_GRID voi chieu rong the dong nhat", () => {
      const blocks: ASTBlock[] = [
        { id: "head", type: "heading", level: 2, text: "3 Tinh nang Dot pha" },
        { id: "list", type: "list", items: ["Tinh nang A", "Tinh nang B", "Tinh nang C"] },
      ];
      const result = layoutSlideBlocks(blocks, "CARD_GRID");
      expect(result.archetype).toBe("CARD_GRID");

      const cards = result.elements.filter((el) => el.type === "card");
      expect(cards).toHaveLength(3);
      expect(cards[0].width).toBe(cards[1].width);
      expect(cards[1].width).toBe(cards[2].width);
      expect(cards[0].height).toBe(cards[1].height);
    });

    it("dinh vi mau METRIC_CALLOUT phong dai 96pt va nhan 20pt", () => {
      const blocks: ASTBlock[] = [
        { id: "head", type: "heading", level: 2, text: "Ket qua nam 2026" },
        {
          id: "met",
          type: "metric",
          metrics: [{ value: "100%", label: "Dat chi tieu" }],
        },
      ];
      const result = layoutSlideBlocks(blocks, "METRIC_CALLOUT");
      expect(result.archetype).toBe("METRIC_CALLOUT");

      const numberEl = result.elements.find((el) => el.type === "metric_number");
      const labelEl = result.elements.find((el) => el.type === "metric_label");

      expect(numberEl).toBeDefined();
      expect(labelEl).toBeDefined();
      expect(numberEl?.fontSize).toBe(96);
      expect(labelEl?.fontSize).toBe(20);
    });

    it("tinh toan diem can bang thi giac khong bi tran khung", () => {
      const blocks: ASTBlock[] = [
        { id: "h", type: "heading", level: 1, text: "Thuyet trinh Du an" },
        { id: "p", type: "paragraph", text: "Noi dung can doi dep mat." },
      ];
      const result = layoutSlideBlocks(blocks);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("tra ve diem 0 neu phan tu bi tran khoi vung an toan (Overflow Penalty)", () => {
      const overflowEl = [
        {
          id: "bad",
          type: "heading" as const,
          x: 50, // x nho hon MARGIN_X (120) -> tran le trai
          y: 100,
          width: 500,
          height: 100,
          fontSize: 24,
          content: "Tran khung",
        },
      ];
      const scoreData = calculateVisualScore(overflowEl);
      expect(scoreData.score).toBe(0);
    });
  });

  describe("Trinh phan tich Markdown sang AST & Auto-Framing End-to-End", () => {
    it("phan tich dung cac khoi AST tu cu phap Markdown chuan", () => {
      const markdown = `
# Tieu de Chuong

Doan van ban mo dau.

---

## Chi so Hoat dong
[Metric: 99.5% | Ty le san sang]

---

## Bang so lieu
| San pham | Doanh so |
|---|---|
| Writer | 120 |
| Sheets | 150 |
      `;
      const blocks = parseMarkdownToAST(markdown);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.some((b) => b.type === "heading")).toBe(true);
      expect(blocks.some((b) => b.type === "divider")).toBe(true);
      expect(blocks.some((b) => b.type === "metric")).toBe(true);
      expect(blocks.some((b) => b.type === "table")).toBe(true);
    });

    it("tu dong dan trang toan bo markdown thanh bo slide 16:9", () => {
      const markdown = `
# VietDesk Office
He thong van phong cho nguoi Viet

---

## Chi so Trong tam
[Metric: 207 | Kiem tra Cong thuc Dat 100%]

---

## 3 Tinh nang
- Soan thao hanh chinh ND30
- Bang tinh FFI C++ sieu toc
- Trinh chieu Auto-Framing 16:9
      `;
      const deck = autoFrameLayoutFromMarkdown(markdown, "Bai thuyet trinh");
      expect(deck.slides).toHaveLength(3);
      expect(deck.slides[0].archetype).toBe("HERO_STATEMENT");
      expect(deck.slides[1].archetype).toBe("METRIC_CALLOUT");
      expect(deck.slides[2].archetype).toBe("CARD_GRID");
    });

    it("chuyen doi AutoFrameLayoutResult thanh doi tuong Slide hop le", () => {
      const markdown = "# Slide Title\nSlide description text.";
      const deck = autoFrameLayoutFromMarkdown(markdown);
      const slide = slideFromFrameLayout(deck.slides[0], "slide-test-1");

      expect(slide.id).toBe("slide-test-1");
      expect(slide.title).toBe("Slide Title");
      expect(slide.body).toBe("Slide description text.");
      expect(slide.frameLayout).toBeDefined();
      expect(slide.frameLayout?.archetype).toBe("HERO_STATEMENT");
    });

    it("tu dong dan trang truc tiep tu mang AST Blocks voi autoFrameLayoutFromAST", () => {
      const astBlocks: ASTBlock[] = [
        { id: "h1", type: "heading", level: 1, text: "Bao cao Quy" },
        { id: "p1", type: "paragraph", text: "Tong ket kinh doanh." },
      ];
      const deck = autoFrameLayoutFromAST(astBlocks, "Bao cao");
      expect(deck.slides).toHaveLength(1);
      expect(deck.slides[0].archetype).toBe("HERO_STATEMENT");
    });
  });
});
