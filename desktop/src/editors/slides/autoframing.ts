/**
 * Auto-Framing & Layout Engine cho VietDesk Office (HyperCanvas Unified Office)
 *
 * Chuyen doi cay AST Block (Heading, Paragraph, Table, Metric, List) thanh bo cuc
 * Slide 16:9 toi uu hinh hoc tuan thu nghiem ngat cac rang buoc:
 * - He toa do chuan: 1920 x 1080 px (16:9).
 * - Le an toan (Safe Margin): X = 120px moi ben, Y = 100px moi ben (vung kha dung: 1680 x 880 px).
 * - 5 Archetypes: HERO_STATEMENT, SPLIT_TWO_COLUMN, CARD_GRID, METRIC_CALLOUT, CLASSIC_STACK.
 * - Binary Search Font Sizing: O(log(Max - Min)).
 * - Diem can bang thi giac (Visual Balance Score): 0 - 100.
 */

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const MARGIN_X = 120;
export const MARGIN_Y = 100;
export const USABLE_WIDTH = CANVAS_WIDTH - 2 * MARGIN_X; // 1680px
export const USABLE_HEIGHT = CANVAS_HEIGHT - 2 * MARGIN_Y; // 880px
export const TOTAL_AREA_BUDGET = USABLE_WIDTH * USABLE_HEIGHT; // 1,478,400 px^2
export const AREA_SPLIT_THRESHOLD = 0.7; // 70% of total budget = 1,034,880 px^2

export type SlideArchetype =
  | "HERO_STATEMENT"
  | "SPLIT_TWO_COLUMN"
  | "CARD_GRID"
  | "METRIC_CALLOUT"
  | "CLASSIC_STACK";

export type ASTBlockType =
  | "heading"
  | "paragraph"
  | "table"
  | "metric"
  | "list"
  | "divider";

export interface ASTHeadingBlock {
  id: string;
  type: "heading";
  level: 1 | 2 | 3;
  text: string;
}

export interface ASTParagraphBlock {
  id: string;
  type: "paragraph";
  text: string;
}

export interface ASTTableBlock {
  id: string;
  type: "table";
  headers: string[];
  rows: string[][];
  totalColumns?: number;
  hasOverflowLink?: boolean;
  overflowLabel?: string;
}

export interface ASTMetricItem {
  value: string;
  label: string;
}

export interface ASTMetricBlock {
  id: string;
  type: "metric";
  metrics: ASTMetricItem[];
}

export interface ASTListBlock {
  id: string;
  type: "list";
  items: string[];
}

export interface ASTDividerBlock {
  id: string;
  type: "divider";
}

export type ASTBlock =
  | ASTHeadingBlock
  | ASTParagraphBlock
  | ASTTableBlock
  | ASTMetricBlock
  | ASTListBlock
  | ASTDividerBlock;

export interface AutoFrameElement {
  id: string;
  type: "heading" | "text" | "table" | "card" | "metric_number" | "metric_label" | "divider";
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AutoFrameLayoutResult {
  archetype: SlideArchetype;
  score: number;
  elements: AutoFrameElement[];
  meta?: {
    usableWidth: number;
    usableHeight: number;
    contentArea: number;
    densityRatio: number;
    whitespaceRatio: number;
  };
}

export interface AutoFrameDeck {
  slides: AutoFrameLayoutResult[];
}

/**
 * Mo phong do dai dong va chieu cao doan van ban dua tren phong chu ti le.
 */
export function simulateTextLayout(
  text: string,
  fontSizePt: number,
  boxWidthPx: number,
  lineHeightRatio: number = 1.35
): { lines: string[]; heightPx: number; maxLineWidthPx: number } {
  if (!text || boxWidthPx <= 0) {
    return { lines: [], heightPx: 0, maxLineWidthPx: 0 };
  }

  // He so uoc tinh do rong trung binh cua ky tu Latin va chu tieng Viet
  const avgCharWidth = fontSizePt * 0.54;
  const maxCharsPerLine = Math.max(1, Math.floor(boxWidthPx / avgCharWidth));

  const paragraphs = text.split("\n");
  const lines: string[] = [];
  let maxLineWidthPx = 0;

  for (const para of paragraphs) {
    if (para.trim().length === 0) {
      lines.push("");
      continue;
    }

    const words = para.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine.length === 0 ? word : currentLine + " " + word;
      if (testLine.length <= maxCharsPerLine) {
        currentLine = testLine;
      } else {
        if (currentLine.length > 0) {
          lines.push(currentLine);
          const measuredWidth = currentLine.length * avgCharWidth;
          if (measuredWidth > maxLineWidthPx) {
            maxLineWidthPx = measuredWidth;
          }
        }
        currentLine = word;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
      const measuredWidth = currentLine.length * avgCharWidth;
      if (measuredWidth > maxLineWidthPx) {
        maxLineWidthPx = measuredWidth;
      }
    }
  }

  const lineHeightPx = fontSizePt * lineHeightRatio;
  const heightPx = Math.ceil(lines.length * lineHeightPx);

  return { lines, heightPx, maxLineWidthPx: Math.min(boxWidthPx, maxLineWidthPx) };
}

/**
 * Giai thuat tim kiem nhi phan co chu (Binary Search Font Sizing) O(log(Max - Min)).
 * Dam bao chu vua khit hop chua ma khong tran (overflow) hoac qua nho.
 */
export function binarySearchFontSize(
  text: string,
  targetBox: { width: number; height: number },
  minFont: number = 16,
  maxFont: number = 48,
  lineHeightRatio: number = 1.35
): number {
  let low = minFont;
  let high = maxFont;
  let optimal = minFont;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const layout = simulateTextLayout(text, mid, targetBox.width, lineHeightRatio);

    if (layout.heightPx <= targetBox.height) {
      optimal = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return optimal;
}

/**
 * Tach doan van thanh danh sach cac cau doc lap de xu ly "Buc tuong chu" (Wall of Text).
 */
export function tokenizeSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Uoc luong dien tich truc quan (Visual Area) cua tung block.
 */
export function estimateBlockArea(block: ASTBlock): number {
  switch (block.type) {
    case "heading":
      return USABLE_WIDTH * (block.level === 1 ? 120 : 90);
    case "paragraph": {
      const estimatedLines = Math.max(1, Math.ceil(block.text.length / 100));
      return USABLE_WIDTH * (estimatedLines * 36);
    }
    case "table": {
      const cols = block.headers.length || 1;
      const rows = block.rows.length + 1;
      return (cols * 220) * (rows * 48);
    }
    case "metric":
      return USABLE_WIDTH * 200;
    case "list":
      return USABLE_WIDTH * (block.items.length * 44);
    case "divider":
      return 0;
  }
}

/**
 * Giai doan 1: Semantic Chunker va giai quyet cac Edge Cases:
 * 1. Hard breaks: Divider (---), Heading 1 bat buoc ngat slide.
 * 2. Atomic units: Table, List < 4 muc giu nguyen khoi, khong ngat doi.
 * 3. Edge Case 1 (Wall of text): Doan van dai duoc tach cau thanh 3-4 cau/card tren deck slide.
 * 4. Edge Case 2 (Wide table): Bang > 5 cot duoc rut gon 5 cot chinh va tao link ve Sheet.
 */
export function chunkASTBlocks(blocks: ASTBlock[], documentTitle: string = "Tai lieu"): ASTBlock[][] {
  const slides: ASTBlock[][] = [];
  let currentGroup: ASTBlock[] = [];
  let currentArea = 0;

  function commitSlide() {
    if (currentGroup.length > 0) {
      slides.push(currentGroup);
      currentGroup = [];
      currentArea = 0;
    }
  }

  for (const block of blocks) {
    // Hard break 1: Divider
    if (block.type === "divider") {
      commitSlide();
      continue;
    }

    // Hard break 2: Heading 1
    if (block.type === "heading" && block.level === 1) {
      commitSlide();
      currentGroup.push(block);
      currentArea += estimateBlockArea(block);
      continue;
    }

    // Edge Case 1: Wall of Text (> 120 tu hoac > 500 ky tu khong co tieu de ngat)
    if (block.type === "paragraph") {
      const wordCount = block.text.split(/\s+/).filter(Boolean).length;
      if (wordCount > 120 || block.text.length > 500) {
        const sentences = tokenizeSentences(block.text);
        if (sentences.length >= 4) {
          // Chia thanh cac nhom 3 cau moi slide
          const chunkSize = 3;
          const totalChunks = Math.ceil(sentences.length / chunkSize);

          for (let i = 0; i < totalChunks; i++) {
            commitSlide();
            const chunkSentences = sentences.slice(i * chunkSize, (i + 1) * chunkSize);
            const partHeading: ASTHeadingBlock = {
              id: `${block.id}-head-${i + 1}`,
              type: "heading",
              level: 2,
              text: `${documentTitle} - Phan ${i + 1}/${totalChunks}`,
            };
            const partParagraph: ASTParagraphBlock = {
              id: `${block.id}-part-${i + 1}`,
              type: "paragraph",
              text: chunkSentences.join(" "),
            };
            slides.push([partHeading, partParagraph]);
          }
          continue;
        }
      }
    }

    // Edge Case 2: Bang tinh qua nhieu cot (> 5 cot)
    let processedBlock = block;
    if (block.type === "table" && block.headers.length > 5) {
      const topHeaders = block.headers.slice(0, 5);
      const topRows = block.rows.map((row) => row.slice(0, 5));
      processedBlock = {
        ...block,
        headers: topHeaders,
        rows: topRows,
        totalColumns: block.headers.length,
        hasOverflowLink: true,
        overflowLabel: "Xem bang du lieu chi tiet tren Sheet",
      };
    }

    const blockArea = estimateBlockArea(processedBlock);

    // Kiem tra nguong 70% dien tich (Slide Splitting)
    if (currentGroup.length > 0 && currentArea + blockArea > TOTAL_AREA_BUDGET * AREA_SPLIT_THRESHOLD) {
      commitSlide();
    }

    currentGroup.push(processedBlock);
    currentArea += blockArea;
  }

  commitSlide();

  return slides.length > 0 ? slides : [[]];
}

/**
 * Giai doan 3: Layout Template Matching (Constraint Satisfaction Problem - CSP)
 * So khop noi dung vao dung 1 trong 5 Archetype chuan 16:9.
 */
export function matchArchetype(blocks: ASTBlock[]): SlideArchetype {
  const headings = blocks.filter((b): b is ASTHeadingBlock => b.type === "heading");
  const paragraphs = blocks.filter((b): b is ASTParagraphBlock => b.type === "paragraph");
  const tables = blocks.filter((b): b is ASTTableBlock => b.type === "table");
  const metrics = blocks.filter((b): b is ASTMetricBlock => b.type === "metric");
  const lists = blocks.filter((b): b is ASTListBlock => b.type === "list");

  // Mau 4: METRIC_CALLOUT (Co cap so lieu - nhan)
  if (metrics.length > 0 && metrics[0].metrics.length > 0) {
    return "METRIC_CALLOUT";
  }

  // Mau 1: HERO_STATEMENT (1 Tieu de ngan < 150 ky tu, khong co bang bieu, toi da 1 doan van rat ngan hoac khong co)
  if (
    headings.length === 1 &&
    paragraphs.length <= 1 &&
    tables.length === 0 &&
    metrics.length === 0 &&
    lists.length === 0
  ) {
    const headingText = headings[0].text;
    const paraText = paragraphs.length === 1 ? paragraphs[0].text : "";
    if (headingText.length < 150 && paraText.length < 250) {
      return "HERO_STATEMENT";
    }
  }

  // Mau 3: CARD_GRID (Co tu 3 den 4 y song song hoac danh sach 3-4 muc)
  if (lists.length > 0) {
    const totalItems = lists[0].items.length;
    if (totalItems >= 3 && totalItems <= 4) {
      return "CARD_GRID";
    }
  }
  if (paragraphs.length >= 3 && paragraphs.length <= 4) {
    return "CARD_GRID";
  }

  // Mau 2: SPLIT_TWO_COLUMN (Co 1 bang tinh nhung hoac 2 y doi trong dai)
  if (tables.length > 0) {
    return "SPLIT_TWO_COLUMN";
  }
  if (paragraphs.length === 2) {
    return "SPLIT_TWO_COLUMN";
  }

  // Mau 5: CLASSIC_STACK (Bo cuc du phong an toan)
  return "CLASSIC_STACK";
}

/**
 * Tinh toan diem can bang thi giac (Visual Balance Score: 0 - 100).
 * Danh gia mat do dien tich noi dung (ly tuong: 60% - 75%) va khoang tho trang (25% - 40%).
 */
export function calculateVisualScore(
  elements: AutoFrameElement[],
  usableWidth: number = USABLE_WIDTH,
  usableHeight: number = USABLE_HEIGHT
): { score: number; contentArea: number; densityRatio: number; whitespaceRatio: number } {
  let contentArea = 0;
  let hasOverflow = false;

  for (const el of elements) {
    // Kiem tra tran khung khoi vung kha dung
    if (
      el.x < MARGIN_X ||
      el.y < MARGIN_Y ||
      el.x + el.width > CANVAS_WIDTH - MARGIN_X + 1 ||
      el.y + el.height > CANVAS_HEIGHT - MARGIN_Y + 1
    ) {
      hasOverflow = true;
    }
    contentArea += el.width * el.height;
  }

  if (hasOverflow) {
    return { score: 0, contentArea, densityRatio: 1, whitespaceRatio: 0 };
  }

  const totalArea = usableWidth * usableHeight;
  const densityRatio = Math.min(1, Math.max(0, contentArea / totalArea));
  const whitespaceRatio = 1 - densityRatio;

  // Ly tuong: Density 60% - 75% (0.60 - 0.75), Whitespace 25% - 40% (0.25 - 0.40)
  let score = 100;

  if (densityRatio < 0.6) {
    // Thieu noi dung: tru diem tuy theo khoang cach toi 0.6
    const underfillPenalty = ((0.6 - densityRatio) / 0.6) * 40;
    score -= underfillPenalty;
  } else if (densityRatio > 0.75) {
    // Qua chat: tru diem tuy theo khoang vuot qua 0.75
    const overfillPenalty = ((densityRatio - 0.75) / 0.25) * 50;
    score -= overfillPenalty;
  }

  // Tinh do can bang trong tam phuong ngang (Horizontal Center of Mass)
  let weightedCenterX = 0;
  for (const el of elements) {
    weightedCenterX += (el.x + el.width / 2) * (el.width * el.height);
  }
  if (contentArea > 0) {
    const comX = weightedCenterX / contentArea;
    const targetCenterX = CANVAS_WIDTH / 2;
    const offsetRatio = Math.abs(comX - targetCenterX) / (USABLE_WIDTH / 2);
    score -= offsetRatio * 15;
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  return { score: finalScore, contentArea, densityRatio, whitespaceRatio };
}

/**
 * Giai doan 4: Dinh vi toa do hinh hoc va Typographic Fitting theo tung Archetype.
 */
export function layoutSlideBlocks(blocks: ASTBlock[], archetypeOverride?: SlideArchetype): AutoFrameLayoutResult {
  const archetype = archetypeOverride ?? matchArchetype(blocks);
  const elements: AutoFrameElement[] = [];

  const headings = blocks.filter((b): b is ASTHeadingBlock => b.type === "heading");
  const paragraphs = blocks.filter((b): b is ASTParagraphBlock => b.type === "paragraph");
  const tables = blocks.filter((b): b is ASTTableBlock => b.type === "table");
  const metrics = blocks.filter((b): b is ASTMetricBlock => b.type === "metric");
  const lists = blocks.filter((b): b is ASTListBlock => b.type === "list");

  switch (archetype) {
    case "HERO_STATEMENT": {
      const heading = headings[0] ?? { id: "hero-title", text: "Tieu de trong tam" };
      const subtitle = paragraphs[0]?.text ?? "";

      const boxWidth = 1500;
      const boxX = MARGIN_X + Math.floor((USABLE_WIDTH - boxWidth) / 2);

      // Binary search font size trong khoang 54pt - 72pt
      const titleFont = binarySearchFontSize(
        heading.text,
        { width: boxWidth, height: 320 },
        54,
        72
      );

      const titleLayout = simulateTextLayout(heading.text, titleFont, boxWidth, 1.25);
      const titleHeight = Math.max(80, titleLayout.heightPx);

      let subFont = 24;
      let subHeight = 0;
      if (subtitle.length > 0) {
        subFont = binarySearchFontSize(subtitle, { width: boxWidth, height: 160 }, 22, 32);
        const subLayout = simulateTextLayout(subtitle, subFont, boxWidth, 1.35);
        subHeight = subLayout.heightPx + 32;
      }

      const totalGroupHeight = titleHeight + subHeight;
      const startY = MARGIN_Y + Math.max(0, Math.floor((USABLE_HEIGHT - totalGroupHeight) / 2));

      elements.push({
        id: heading.id || "hero-heading",
        type: "heading",
        x: boxX,
        y: startY,
        width: boxWidth,
        height: titleHeight,
        fontSize: titleFont,
        content: heading.text,
      });

      if (subtitle.length > 0) {
        elements.push({
          id: paragraphs[0]?.id || "hero-subtitle",
          type: "text",
          x: boxX,
          y: startY + titleHeight + 32,
          width: boxWidth,
          height: subHeight,
          fontSize: subFont,
          content: subtitle,
        });
      }
      break;
    }

    case "SPLIT_TWO_COLUMN": {
      // Cot 1: W = 780px, Cot 2: W = 820px, Khoang ho = 80px (780 + 80 + 820 = 1680px)
      const col1Width = 780;
      const col2Width = 820;
      const gutter = 80;
      const col1X = MARGIN_X;
      const col2X = MARGIN_X + col1Width + gutter;

      let contentStartY = MARGIN_Y;
      let availableHeight = USABLE_HEIGHT;

      // Neu co Heading chung o tren
      if (headings.length > 0) {
        const head = headings[0];
        const headFont = binarySearchFontSize(head.text, { width: USABLE_WIDTH, height: 90 }, 36, 44);
        const headHeight = 90;
        elements.push({
          id: head.id,
          type: "heading",
          x: MARGIN_X,
          y: MARGIN_Y,
          width: USABLE_WIDTH,
          height: headHeight,
          fontSize: headFont,
          content: head.text,
        });
        contentStartY = MARGIN_Y + headHeight + 40;
        availableHeight = USABLE_HEIGHT - headHeight - 40;
      }

      // Cot 1: Van ban giai thich
      const textBlock = paragraphs[0] ?? { id: "col1-text", text: "" };
      if (textBlock.text.length > 0) {
        const textFont = binarySearchFontSize(
          textBlock.text,
          { width: col1Width - 40, height: availableHeight - 60 },
          20,
          28
        );
        const textLayout = simulateTextLayout(textBlock.text, textFont, col1Width - 40);
        elements.push({
          id: textBlock.id,
          type: "text",
          x: col1X,
          y: contentStartY,
          width: col1Width,
          height: Math.min(availableHeight, textLayout.heightPx + 40),
          fontSize: textFont,
          content: textBlock.text,
        });
      }

      // Cot 2: Bang tinh hoac Khoi du lieu
      if (tables.length > 0) {
        const table = tables[0];
        const tableHeight = Math.min(availableHeight, (table.rows.length + 1) * 56 + 40);
        elements.push({
          id: table.id,
          type: "table",
          x: col2X,
          y: contentStartY,
          width: col2Width,
          height: tableHeight,
          fontSize: 18,
          content: JSON.stringify({
            headers: table.headers,
            rows: table.rows,
            hasOverflowLink: table.hasOverflowLink,
            overflowLabel: table.overflowLabel,
          }),
          metadata: {
            headers: table.headers,
            rows: table.rows,
            hasOverflowLink: table.hasOverflowLink,
            overflowLabel: table.overflowLabel,
          },
        });
      } else if (paragraphs.length > 1) {
        const secondText = paragraphs[1];
        const textFont = binarySearchFontSize(
          secondText.text,
          { width: col2Width - 40, height: availableHeight - 60 },
          20,
          28
        );
        const textLayout = simulateTextLayout(secondText.text, textFont, col2Width - 40);
        elements.push({
          id: secondText.id,
          type: "text",
          x: col2X,
          y: contentStartY,
          width: col2Width,
          height: Math.min(availableHeight, textLayout.heightPx + 40),
          fontSize: textFont,
          content: secondText.text,
        });
      }
      break;
    }

    case "CARD_GRID": {
      let contentStartY = MARGIN_Y;
      let availableHeight = USABLE_HEIGHT;

      if (headings.length > 0) {
        const head = headings[0];
        const headFont = binarySearchFontSize(head.text, { width: USABLE_WIDTH, height: 90 }, 36, 44);
        const headHeight = 90;
        elements.push({
          id: head.id,
          type: "heading",
          x: MARGIN_X,
          y: MARGIN_Y,
          width: USABLE_WIDTH,
          height: headHeight,
          fontSize: headFont,
          content: head.text,
        });
        contentStartY = MARGIN_Y + headHeight + 40;
        availableHeight = USABLE_HEIGHT - headHeight - 40;
      }

      // Lay danh sach cac the
      const cardContents: string[] = [];
      if (lists.length > 0) {
        cardContents.push(...lists[0].items);
      } else {
        cardContents.push(...paragraphs.map((p) => p.text));
      }

      const cardCount = Math.min(4, Math.max(3, cardContents.length));
      const gutter = cardCount === 3 ? 40 : 32;
      const totalGutters = (cardCount - 1) * gutter;
      const cardWidth = Math.floor((USABLE_WIDTH - totalGutters) / cardCount);
      const cardHeight = Math.min(availableHeight, 520);

      for (let i = 0; i < cardCount; i++) {
        const itemText = cardContents[i] ?? `Muc ${i + 1}`;
        const cardX = MARGIN_X + i * (cardWidth + gutter);
        const cardFont = binarySearchFontSize(
          itemText,
          { width: cardWidth - 48, height: cardHeight - 80 },
          18,
          26
        );

        elements.push({
          id: `card-${i + 1}`,
          type: "card",
          x: cardX,
          y: contentStartY,
          width: cardWidth,
          height: cardHeight,
          fontSize: cardFont,
          content: itemText,
        });
      }
      break;
    }

    case "METRIC_CALLOUT": {
      let contentStartY = MARGIN_Y;

      if (headings.length > 0) {
        const head = headings[0];
        const headFont = binarySearchFontSize(head.text, { width: USABLE_WIDTH, height: 90 }, 36, 44);
        const headHeight = 90;
        elements.push({
          id: head.id,
          type: "heading",
          x: MARGIN_X,
          y: MARGIN_Y,
          width: USABLE_WIDTH,
          height: headHeight,
          fontSize: headFont,
          content: head.text,
        });
        contentStartY = MARGIN_Y + headHeight + 60;
      }

      const metricItems = metrics[0]?.metrics ?? [];
      const count = Math.min(4, Math.max(1, metricItems.length));
      const colWidth = Math.floor(USABLE_WIDTH / count);

      for (let i = 0; i < count; i++) {
        const metric = metricItems[i];
        const itemX = MARGIN_X + i * colWidth;

        // So lieu trong tam phong dai 96pt in dam
        const numberHeight = 120;
        elements.push({
          id: `metric-num-${i + 1}`,
          type: "metric_number",
          x: itemX,
          y: contentStartY + 60,
          width: colWidth,
          height: numberHeight,
          fontSize: 96,
          content: metric.value,
        });

        // Nhan mo ta dat phia duoi 20pt
        elements.push({
          id: `metric-lbl-${i + 1}`,
          type: "metric_label",
          x: itemX,
          y: contentStartY + 60 + numberHeight + 20,
          width: colWidth,
          height: 60,
          fontSize: 20,
          content: metric.label,
        });
      }
      break;
    }

    case "CLASSIC_STACK":
    default: {
      let currentY = MARGIN_Y;

      if (headings.length > 0) {
        const head = headings[0];
        const headFont = binarySearchFontSize(head.text, { width: USABLE_WIDTH, height: 80 }, 36, 44);
        const headHeight = 80;
        elements.push({
          id: head.id,
          type: "heading",
          x: MARGIN_X,
          y: currentY,
          width: USABLE_WIDTH,
          height: headHeight,
          fontSize: headFont,
          content: head.text,
        });
        currentY += headHeight + 15;

        // Duong ke phan cach mong
        elements.push({
          id: "stack-divider",
          type: "divider",
          x: MARGIN_X,
          y: currentY,
          width: USABLE_WIDTH,
          height: 2,
          fontSize: 0,
          content: "",
        });
        currentY += 25;
      }

      const remainingHeight = CANVAS_HEIGHT - MARGIN_Y - currentY;
      const combinedBody = paragraphs.map((p) => p.text).join("\n\n");

      if (combinedBody.length > 0) {
        // Co gian co chu tu 18 - 24pt
        const bodyFont = binarySearchFontSize(
          combinedBody,
          { width: USABLE_WIDTH - 60, height: remainingHeight - 40 },
          18,
          24
        );
        const layout = simulateTextLayout(combinedBody, bodyFont, USABLE_WIDTH - 60);

        elements.push({
          id: paragraphs[0]?.id || "stack-body",
          type: "text",
          x: MARGIN_X,
          y: currentY,
          width: USABLE_WIDTH,
          height: Math.min(remainingHeight, layout.heightPx + 30),
          fontSize: bodyFont,
          content: combinedBody,
        });
      }
      break;
    }
  }

  const { score, contentArea, densityRatio, whitespaceRatio } = calculateVisualScore(elements);

  return {
    archetype,
    score,
    elements,
    meta: {
      usableWidth: USABLE_WIDTH,
      usableHeight: USABLE_HEIGHT,
      contentArea,
      densityRatio,
      whitespaceRatio,
    },
  };
}

/**
 * Trinh phan tich Markdown thanh cay AST Blocks de san sang cho Auto-Framing.
 */
export function parseMarkdownToAST(markdown: string): ASTBlock[] {
  const lines = markdown.split("\n");
  const blocks: ASTBlock[] = [];
  let currentParagraphLines: string[] = [];
  let tableHeaderLines: string[] = [];
  let tableRowLines: string[][] = [];
  let inTable = false;
  let currentListItems: string[] = [];
  let idCounter = 1;

  function flushParagraph() {
    if (currentParagraphLines.length > 0) {
      const text = currentParagraphLines.join("\n").trim();
      if (text.length > 0) {
        blocks.push({
          id: `para-${idCounter++}`,
          type: "paragraph",
          text,
        });
      }
      currentParagraphLines = [];
    }
  }

  function flushTable() {
    if (inTable && tableHeaderLines.length > 0) {
      blocks.push({
        id: `table-${idCounter++}`,
        type: "table",
        headers: tableHeaderLines,
        rows: tableRowLines,
      });
      tableHeaderLines = [];
      tableRowLines = [];
      inTable = false;
    }
  }

  function flushList() {
    if (currentListItems.length > 0) {
      blocks.push({
        id: `list-${idCounter++}`,
        type: "list",
        items: [...currentListItems],
      });
      currentListItems = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Ranh gioi Divider (--- hoac ***)
    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      flushParagraph();
      flushTable();
      flushList();
      blocks.push({ id: `div-${idCounter++}`, type: "divider" });
      continue;
    }

    // Bang bieu Markdown (| cot 1 | cot 2 |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushParagraph();
      flushList();
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());

      // Kiem tra dong phan cach (|---|---|)
      const isDivider = cells.every((c) => /^:?-+:?$/.test(c));
      if (isDivider) {
        inTable = true;
        continue;
      }

      if (!inTable) {
        tableHeaderLines = cells;
        inTable = true;
      } else {
        tableRowLines.push(cells);
      }
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Danh sach gach dau dong
    if (/^[-*+]\s+/.test(trimmed)) {
      flushParagraph();
      flushTable();
      currentListItems.push(trimmed.replace(/^[-*+]\s+/, ""));
      continue;
    } else if (currentListItems.length > 0) {
      flushList();
    }

    // Tieu de Markdown (# Heading)
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushTable();
      flushList();
      const level = headingMatch[1].length as 1 | 2 | 3;
      blocks.push({
        id: `head-${idCounter++}`,
        type: "heading",
        level,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    // Nhan dien chi so Metric dac thu (vd: [Metric: 99.8% | Doanh thu] hoac **99.8%** - Doanh thu)
    const metricMatch = trimmed.match(/^\[Metric:\s*([^|]+)\|\s*([^\]]+)\]$/i) ||
      trimmed.match(/^\*\*([0-9.,%]+[kMGBđ₫\w\s]*)\*\*\s*[:-]\s*(.+)$/);
    if (metricMatch) {
      flushParagraph();
      flushTable();
      flushList();
      blocks.push({
        id: `metric-${idCounter++}`,
        type: "metric",
        metrics: [
          {
            value: metricMatch[1].trim(),
            label: metricMatch[2].trim(),
          },
        ],
      });
      continue;
    }

    if (trimmed.length === 0) {
      flushParagraph();
    } else {
      currentParagraphLines.push(rawLine);
    }
  }

  flushParagraph();
  flushTable();
  flushList();

  return blocks;
}

/**
 * Tu dong dan trang toan bo tai lieu Markdown thanh bo slide 16:9 hoan chinh.
 */
export function autoFrameLayoutFromMarkdown(markdown: string, documentTitle?: string): AutoFrameDeck {
  const blocks = parseMarkdownToAST(markdown);
  const slideGroups = chunkASTBlocks(blocks, documentTitle);
  const slides = slideGroups.map((group) => layoutSlideBlocks(group));
  return { slides };
}

/**
 * Tu dong dan trang tu danh sach AST Blocks co san.
 */
export function autoFrameLayoutFromAST(blocks: ASTBlock[], documentTitle?: string): AutoFrameDeck {
  const slideGroups = chunkASTBlocks(blocks, documentTitle);
  const slides = slideGroups.map((group) => layoutSlideBlocks(group));
  return { slides };
}
