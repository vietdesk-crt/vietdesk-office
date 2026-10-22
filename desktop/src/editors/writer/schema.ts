/**
 * Schema ProseMirror cho Writer.
 *
 * Mở rộng schema cơ bản của ProseMirror bằng:
 *  - canh lề và giãn dòng cho đoạn văn/tiêu đề,
 *  - gạch chân, gạch ngang,
 *  - kiểu chữ, cỡ chữ, màu chữ, tô sáng,
 *  - danh sách gạch đầu dòng / đánh số,
 *  - bảng (bảng, hàng, ô, ô tiêu đề),
 *  - liên kết an toàn và ngắt trang.
 *
 * Giữ tương thích với tài liệu `.vdx` cũ: các node/mark cơ bản không đổi,
 * chỉ thêm thuộc tính mới với giá trị mặc định null.
 */
import { Schema } from "prosemirror-model";
import type { MarkSpec, NodeSpec } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { tableNodes } from "prosemirror-tables";

export type Alignment = "left" | "center" | "right" | "justify";

export const ALIGNMENTS: readonly Alignment[] = [
  "left",
  "center",
  "right",
  "justify",
];

export function normalizeAlign(value: unknown): Alignment | null {
  return value === "left" ||
    value === "center" ||
    value === "right" ||
    value === "justify"
    ? value
    : null;
}

/** Chỉ chấp nhận số không đơn vị trong khoảng hợp lý để tránh CSS lạ. */
export function normalizeLineHeight(value: unknown): string | null {
  if (typeof value === "number") {
    value = String(value);
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "normal") {
    return "normal";
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= 0.8 && numeric <= 3
    ? String(numeric)
    : null;
}

/** Loại bỏ ký tự có thể phá vỡ khai báo CSS khi ghi ra DOM. */
export function normalizeFontFamily(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/[;{}<>]/g, "").trim();
  return cleaned ? cleaned.slice(0, 120) : null;
}

export function normalizeFontSize(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d+(?:\.\d+)?)(pt|px|em|rem|%)?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 400
    ? match[0]
    : null;
}

export function normalizeColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  const hex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const functional =
    /^(?:rgb|rgba|hsl|hsla)\([0-9\s.,%]+\)$/i;
  return hex.test(trimmed) || functional.test(trimmed) ? trimmed : null;
}

/**
 * Chỉ chấp nhận liên kết an toàn: http(s), mailto, tel hoặc đường dẫn nội bộ.
 * Chặn `javascript:` và `data:` để không mở được mã độc từ tài liệu.
 */
export function normalizeHref(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }
  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function alignFromDOM(dom: HTMLElement): Alignment | null {
  return normalizeAlign(dom.style.textAlign || dom.getAttribute("align"));
}

function blockStyleAttrs(attrs: Record<string, unknown>): { style?: string } {
  const styles: string[] = [];
  const align = normalizeAlign(attrs.align);
  if (align) {
    styles.push(`text-align: ${align}`);
  }
  const lineHeight = normalizeLineHeight(attrs.lineHeight);
  if (lineHeight) {
    styles.push(`line-height: ${lineHeight}`);
  }
  return styles.length ? { style: styles.join("; ") } : {};
}

function blockAttrsFromDOM(dom: HTMLElement) {
  return {
    align: alignFromDOM(dom),
    lineHeight: normalizeLineHeight(dom.style.lineHeight),
  };
}

function nodeSpec(name: string): NodeSpec {
  const spec = basicSchema.spec.nodes.get(name);
  if (!spec) {
    throw new Error(`Schema cơ bản thiếu node "${name}"`);
  }
  return spec;
}

const paragraphSpec: NodeSpec = {
  ...nodeSpec("paragraph"),
  attrs: { align: { default: null }, lineHeight: { default: null } },
  parseDOM: [
    {
      tag: "p",
      getAttrs: (dom) => blockAttrsFromDOM(dom as HTMLElement),
    },
  ],
  toDOM(node) {
    return ["p", blockStyleAttrs(node.attrs), 0];
  },
};

const headingSpec: NodeSpec = {
  ...nodeSpec("heading"),
  attrs: {
    level: { default: 1 },
    align: { default: null },
    lineHeight: { default: null },
  },
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs: (dom: HTMLElement | string) => ({
      level,
      ...blockAttrsFromDOM(dom as HTMLElement),
    }),
  })),
  toDOM(node) {
    const level = Math.min(Math.max(Number(node.attrs.level) || 1, 1), 6);
    return [`h${level}`, blockStyleAttrs(node.attrs), 0];
  },
};

const underlineSpec: MarkSpec = {
  parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
  toDOM: () => ["u", 0],
};

const strikeSpec: MarkSpec = {
  parseDOM: [
    { tag: "s" },
    { tag: "del" },
    { style: "text-decoration=line-through" },
  ],
  toDOM: () => ["s", 0],
};

const fontFamilySpec: MarkSpec = {
  attrs: { family: {} },
  parseDOM: [
    {
      style: "font-family",
      getAttrs: (value) => {
        const family = normalizeFontFamily(value);
        return family ? { family } : false;
      },
    },
  ],
  toDOM(mark) {
    const family = normalizeFontFamily(mark.attrs.family);
    return family ? ["span", { style: `font-family: ${family}` }, 0] : ["span", 0];
  },
};

const fontSizeSpec: MarkSpec = {
  attrs: { size: {} },
  parseDOM: [
    {
      style: "font-size",
      getAttrs: (value) => {
        const size = normalizeFontSize(value);
        return size ? { size } : false;
      },
    },
  ],
  toDOM(mark) {
    const size = normalizeFontSize(mark.attrs.size);
    return size ? ["span", { style: `font-size: ${size}` }, 0] : ["span", 0];
  },
};

const textColorSpec: MarkSpec = {
  attrs: { color: {} },
  parseDOM: [
    {
      style: "color",
      getAttrs: (value) => {
        const color = normalizeColor(value);
        return color ? { color } : false;
      },
    },
  ],
  toDOM(mark) {
    const color = normalizeColor(mark.attrs.color);
    return color ? ["span", { style: `color: ${color}` }, 0] : ["span", 0];
  },
};

const highlightSpec: MarkSpec = {
  attrs: { color: {} },
  parseDOM: [
    {
      style: "background-color",
      getAttrs: (value) => {
        const color = normalizeColor(value);
        return color ? { color } : false;
      },
    },
    {
      tag: "mark",
      getAttrs: (dom) => {
        const color = normalizeColor((dom as HTMLElement).style.backgroundColor);
        return color ? { color } : false;
      },
    },
  ],
  toDOM(mark) {
    const color = normalizeColor(mark.attrs.color);
    return color
      ? ["span", { style: `background-color: ${color}` }, 0]
      : ["span", 0];
  },
};

const linkSpec: MarkSpec = {
  attrs: { href: {}, title: { default: null } },
  inclusive: false,
  parseDOM: [
    {
      tag: "a[href]",
      getAttrs: (dom) => {
        const href = normalizeHref(
          (dom as HTMLElement).getAttribute("href"),
        );
        return href ? { href } : false;
      },
    },
  ],
  toDOM(mark) {
    const href = normalizeHref(mark.attrs.href) ?? "#";
    return [
      "a",
      { href, title: mark.attrs.title, rel: "noopener noreferrer" },
      0,
    ];
  },
};

const pageBreakSpec: NodeSpec = {
  group: "block",
  atom: true,
  selectable: false,
  parseDOM: [{ tag: "div.vd-page-break" }],
  toDOM: () => ["div", { class: "vd-page-break" }, ["span", "Ngắt trang"]],
};

const tableSpecs = tableNodes({
  tableGroup: "block",
  cellContent: "block+",
  cellAttributes: {},
});

let nodes = basicSchema.spec.nodes;
nodes = addListNodes(nodes, "paragraph block*", "block");
nodes = nodes
  .update("paragraph", paragraphSpec)
  .update("heading", headingSpec)
  .addToEnd("page_break", pageBreakSpec)
  .addToEnd("table", tableSpecs.table)
  .addToEnd("table_row", tableSpecs.table_row)
  .addToEnd("table_cell", tableSpecs.table_cell)
  .addToEnd("table_header", tableSpecs.table_header);

const marks = basicSchema.spec.marks
  .update("link", linkSpec)
  .addToEnd("underline", underlineSpec)
  .addToEnd("strike", strikeSpec)
  .addToEnd("fontFamily", fontFamilySpec)
  .addToEnd("fontSize", fontSizeSpec)
  .addToEnd("textColor", textColorSpec)
  .addToEnd("highlight", highlightSpec);

export const writerSchema = new Schema({ nodes, marks });
