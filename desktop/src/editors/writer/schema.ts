/**
 * Schema ProseMirror cho Writer.
 *
 * Mở rộng schema cơ bản của ProseMirror bằng:
 *  - canh lề, giãn dòng và thụt lề cho đoạn văn/tiêu đề,
 *  - gạch chân, gạch ngang, chỉ số trên/dưới,
 *  - kiểu chữ, cỡ chữ, màu chữ, tô sáng,
 *  - danh sách gạch đầu dòng / đánh số / việc cần làm,
 *  - bảng (bảng, hàng, ô, ô tiêu đề),
 *  - đường kẻ ngang, liên kết an toàn và ngắt trang.
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

/** Số cấp thụt lề tối đa (mỗi cấp ~ 1,6em). */
export const MAX_INDENT = 6;

/** Bề rộng một cấp thụt lề. */
export const INDENT_STEP_EM = 1.6;

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

/** Đọc số cấp thụt lề từ DOM, quy đổi từ px sang cấp. */
function indentFromDOM(dom: HTMLElement): number {
  const raw = dom.style.marginLeft || "";
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(raw.trim());
  if (!match) {
    return 0;
  }
  const pixels = Number(match[1]);
  if (!Number.isFinite(pixels) || pixels <= 0) {
    return 0;
  }
  // 1em ≈ 16px ở cỡ chữ mặc định — dùng hằng số 25.6px cho 1,6em.
  return Math.min(MAX_INDENT, Math.round(pixels / 25.6));
}

/** Chuẩn hoá số cấp thụt lề về khoảng 0..MAX_INDENT. */
export function normalizeIndent(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.min(MAX_INDENT, Math.max(0, Math.round(numeric)));
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
  const indent = normalizeIndent(attrs.indent);
  if (indent > 0) {
    styles.push(`margin-left: ${indent * INDENT_STEP_EM}em`);
  }
  return styles.length ? { style: styles.join("; ") } : {};
}

function blockAttrsFromDOM(dom: HTMLElement) {
  return {
    align: alignFromDOM(dom),
    lineHeight: normalizeLineHeight(dom.style.lineHeight),
    indent: indentFromDOM(dom),
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
  attrs: {
    align: { default: null },
    lineHeight: { default: null },
    indent: { default: 0 },
  },
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
    indent: { default: 0 },
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

const superscriptSpec: MarkSpec = {
  parseDOM: [{ tag: "sup" }],
  toDOM: () => ["sup", 0],
};

const subscriptSpec: MarkSpec = {
  parseDOM: [{ tag: "sub" }],
  toDOM: () => ["sub", 0],
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

/** Tên tác giả mặc định cho các thay đổi được theo dõi. */
export const DEFAULT_CHANGE_AUTHOR = "Tác giả";

/**
 * Mark thay đổi được theo dõi: `insertion` (chữ được thêm) và `deletion`
 * (chữ bị bớt). Hai mark này không lan sang vùng gõ tiếp theo.
 */
const changeMarkSpec = (kind: "insertion" | "deletion"): MarkSpec => ({
  attrs: {
    author: { default: DEFAULT_CHANGE_AUTHOR },
    date: { default: null },
  },
  inclusive: false,
  parseDOM: [
    {
      tag: `span[data-change="${kind}"]`,
      getAttrs: (dom: HTMLElement | string) => {
        const element = dom as HTMLElement;
        return {
          author:
            element.getAttribute("data-author") || DEFAULT_CHANGE_AUTHOR,
          date: element.getAttribute("data-date"),
        };
      },
    },
  ],
  toDOM: (mark) => [
    "span",
    {
      class: `vd-change vd-change--${kind}`,
      "data-change": kind,
      "data-author": mark.attrs.author,
      ...(mark.attrs.date ? { "data-date": mark.attrs.date } : {}),
    },
    0,
  ],
});

/** Mark ghim bình luận vào văn bản. */
const commentMarkSpec: MarkSpec = {
  attrs: { id: { default: "" } },
  inclusive: false,
  parseDOM: [
    {
      tag: "span[data-comment-id]",
      getAttrs: (dom: HTMLElement | string) => {
        const id = (dom as HTMLElement).getAttribute("data-comment-id");
        return id ? { id } : false;
      },
    },
  ],
  toDOM: (mark) => [
    "span",
    { class: "vd-comment-anchor", "data-comment-id": mark.attrs.id },
    0,
  ],
};

/** Kích thước ảnh (px) — chỉ nhận số trong khoảng hợp lý. */
export function normalizeImageSize(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const rounded = Math.round(numeric);
  if (rounded < 16 || rounded > 4000) {
    return null;
  }
  return rounded;
}

/**
 * Node ảnh.
 *
 * `src` là đường dẫn *tương đối* tới tệp ảnh trong thư mục `assets` cạnh tệp
 * tài liệu (hoặc một data URL khi tài liệu chưa lưu trên đĩa). Nhờ vậy tài
 * liệu vẫn mở được sau khi chuyển sang máy khác.
 */
const imageSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  draggable: true,
  attrs: {
    src: {},
    alt: { default: "" },
    width: { default: null },
    height: { default: null },
  },
  parseDOM: [
    {
      tag: "img[src]",
      getAttrs: (dom: HTMLElement | string) => {
        const element = dom as HTMLElement;
        const src = element.getAttribute("src") ?? "";
        if (!src) {
          return false;
        }
        return {
          src,
          alt: element.getAttribute("alt") ?? "",
          width: normalizeImageSize(element.getAttribute("width")),
          height: normalizeImageSize(element.getAttribute("height")),
        };
      },
    },
  ],
  toDOM(node) {
    const attrs: Record<string, string> = {
      src: String(node.attrs.src ?? ""),
      alt: String(node.attrs.alt ?? ""),
    };
    const width = normalizeImageSize(node.attrs.width);
    const height = normalizeImageSize(node.attrs.height);
    if (width) {
      attrs.width = String(width);
    }
    if (height) {
      attrs.height = String(height);
    }
    return ["img", attrs];
  },
};

const pageBreakSpec: NodeSpec = {
  group: "block",
  atom: true,
  selectable: false,
  parseDOM: [{ tag: "div.vd-page-break" }],
  toDOM: () => ["div", { class: "vd-page-break" }, ["span", "Ngắt trang"]],
};

const horizontalRuleSpec: NodeSpec = {
  group: "block",
  atom: true,
  parseDOM: [{ tag: "hr" }],
  toDOM: () => ["hr", { class: "vd-writer__hr" }],
};

/** Mục việc cần làm — một mục có ô tick, nội dung là block* như list item. */
const taskItemSpec: NodeSpec = {
  content: "paragraph block*",
  group: "list_item",
  defining: true,
  attrs: { checked: { default: false }, indent: { default: 0 } },
  parseDOM: [
    {
      tag: "li[data-task]",
      getAttrs: (dom: HTMLElement | string) => {
        const element = dom as HTMLElement;
        return {
          checked: element.getAttribute("data-checked") === "true",
          indent: indentFromDOM(element),
        };
      },
    },
  ],
  toDOM(node) {
    const style = node.attrs.indent
      ? `margin-left: ${normalizeIndent(node.attrs.indent) * INDENT_STEP_EM}em`
      : "";
    return [
      "li",
      {
        class: "vd-writer__task",
        "data-task": "true",
        "data-checked": String(Boolean(node.attrs.checked)),
        ...(style ? { style } : {}),
      },
      0,
    ];
  },
};

const taskListSpec: NodeSpec = {
  content: "task_item+",
  group: "block",
  parseDOM: [{ tag: "ul[data-tasklist]" }],
  toDOM: () => ["ul", { class: "vd-writer__tasklist", "data-tasklist": "true" }, 0],
};

const tableSpecs = tableNodes({
  tableGroup: "block",
  cellContent: "block+",
  cellAttributes: {},
});

let nodes = basicSchema.spec.nodes;
nodes = addListNodes(nodes, "paragraph block*", "block");
// `list_item` của addListNodes không có thuộc tính — thêm `indent` để thụt lề
// được áp dụng đồng nhất cho cả mục danh sách lẫn mục việc cần làm.
nodes = nodes.update("list_item", {
  ...nodes.get("list_item")!,
  attrs: { indent: { default: 0 } },
  toDOM(node) {
    const indent = normalizeIndent(node.attrs.indent);
    return [
      "li",
      indent > 0
        ? { style: `margin-left: ${indent * INDENT_STEP_EM}em` }
        : {},
      0,
    ];
  },
  parseDOM: [
    {
      tag: "li",
      getAttrs: (dom: HTMLElement | string) => ({
        indent: indentFromDOM(dom as HTMLElement),
      }),
    },
  ],
});
nodes = nodes
  .update("paragraph", paragraphSpec)
  .update("heading", headingSpec)
  .addToEnd("image", imageSpec)
  .addToEnd("page_break", pageBreakSpec)
  .addToEnd("horizontal_rule", horizontalRuleSpec)
  .addToEnd("task_list", taskListSpec)
  .addToEnd("task_item", taskItemSpec)
  .addToEnd("table", tableSpecs.table)
  .addToEnd("table_row", tableSpecs.table_row)
  .addToEnd("table_cell", tableSpecs.table_cell)
  .addToEnd("table_header", tableSpecs.table_header);

const marks = basicSchema.spec.marks
  .update("link", linkSpec)
  .addToEnd("underline", underlineSpec)
  .addToEnd("strike", strikeSpec)
  .addToEnd("superscript", superscriptSpec)
  .addToEnd("subscript", subscriptSpec)
  .addToEnd("fontFamily", fontFamilySpec)
  .addToEnd("fontSize", fontSizeSpec)
  .addToEnd("textColor", textColorSpec)
  .addToEnd("highlight", highlightSpec)
  .addToEnd("insertion", changeMarkSpec("insertion"))
  .addToEnd("deletion", changeMarkSpec("deletion"))
  .addToEnd("comment", commentMarkSpec);

export const writerSchema = new Schema({ nodes, marks });
