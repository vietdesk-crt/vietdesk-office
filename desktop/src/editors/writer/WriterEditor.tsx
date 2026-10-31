import { countWords } from "@vietdesk/vietnamese";
import {
  hasNativeCore,
  IMAGE_EXTENSIONS,
  MAX_ASSET_BYTES,
  pickExportPath,
  pickImageFile,
  readFileAsDataUrl,
  readImageBase64,
  writeDocumentBinary,
  writeImageAsset,
} from "@vietdesk/ipc-contract";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  Bold,
  CalendarDays,
  ChartColumn,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  ClipboardType,
  ClipboardCopy,
  Copy,
  Eraser,
  FileText,
  FileType,
  GitCompareArrows,
  Hash,
  Heading1,
  Heading2,
  Heading3,
  Image,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  MessageSquare,
  MessageSquarePlus,
  Minus,
  Paintbrush,
  PanelTop,
  Pilcrow,
  Printer,
  Redo2,
  RemoveFormatting,
  Replace,
  Scissors,
  Search,
  SeparatorHorizontal,
  Sigma,
  SquareDashed,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Type,
  Underline,
  Undo2,
  FileDown,
  FileCheck,
  AArrowUp,
  AArrowDown,
  X,
} from "lucide-react";
import {
  baseKeymap,
  deleteSelection,
  selectAll,
  toggleMark,
} from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import type { Mark, Node as PMNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { tableEditing } from "prosemirror-tables";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import {
  applyFormatting,
  changeCase,
  changeIndent,
  clearFormatting,
  formattingMarksAtSelection,
  inTable,
  insertHorizontalRule,
  insertImage,
  insertPageBreak,
  insertTable,
  listActive,
  markActive,
  markValue,
  removeMarkType,
  setAlign,
  setBlock,
  setFirstLineIndent,
  setIndent,
  setLineHeight,
  setLink,
  setMarkAttr,
  sortSelectedBlocks,
  tableCommands,
  tableKeymap,
  toggleList,
  toggleTaskList,
  transformVietnamese,
  writerKeymap,
} from "./commands";
import type { CaseMode } from "./commands";
import { searchHighlightKey, searchHighlightPlugin } from "./highlight";
import {
  DEFAULT_CHANGE_AUTHOR,
  INDENT_STEP_EM,
  MAX_INDENT,
  normalizeAlign,
  normalizeColor,
  normalizeFontFamily,
  normalizeFontSize,
  normalizeHref,
  normalizeIndent,
  normalizeLineHeight,
  writerSchema,
} from "./schema";
import { findMatches } from "./search";
import { activeOutlineIndex, collectOutline } from "./outline";
import {
  acceptAllChanges,
  acceptChange,
  changeAt,
  collectChanges,
  createTrackChangesPlugin,
  isTrackChangesEnabled,
  rejectAllChanges,
  rejectChange,
  toggleTrackChanges,
} from "./changes";
import {
  createCommentId,
  findCommentRange,
  formatCommentTime,
  MAX_COMMENT_QUOTE,
  MAX_COMMENT_TEXT,
  readComments,
} from "./comments";
import type { WriterComment } from "./comments";
import {
  A4_WIDTH_MM,
  MAX_SIDE_MARGIN_MM,
  MIN_MARGIN_MM,
  ND30_MARGINS,
  computePageBreaks,
  pageContentHeightPx,
  pageOfBlock,
  readPageSetup,
} from "./page";
import type { PageMargins, PageSetup } from "./page";
import { printDocument } from "./print";
import { ImageView } from "./image-view";
import { TaskItemView } from "./task-view";
import { exportWriterPdf } from "../../export/pdf";
import { writerDocxBytes } from "../../export/docx";
import { bytesToBase64 } from "../../export/binary";
import { downloadBinaryFile } from "../../download";
import { fileNameFromPath } from "../../format";
import { ADMINISTRATIVE_TEMPLATES } from "./templates";

/** Một cấp thụt lề (1,6em ở cỡ chữ 16px) quy đổi sang px/mm cho thước kẻ. */
const INDENT_STEP_PX = INDENT_STEP_EM * 16;
const MM_TO_PX_CSS = 96 / 25.4;
const INDENT_STEP_MM = INDENT_STEP_PX / MM_TO_PX_CSS;

/** Tay kéo trên thước: lề trang hoặc thụt lề đoạn văn. */
type RulerDragKind =
  | "margin-left"
  | "margin-right"
  | "indent"
  | "first-line";

interface RulerPreview {
  margins: PageMargins;
  indent: number;
  firstLineIndent: number;
}

/** Tên tệp an toàn cho hệ thống tệp (bỏ ký tự cấm). */
function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "tai-lieu";
}

export interface WriterEditorProps {
  /** Nội dung ban đầu (văn bản thuần), dùng khi không có `initialContent`. */
  initialText?: string;
  /** ProseMirror JSON đã lưu trong tệp `.vdx`. */
  initialContent?: unknown;
  /** Gọi mỗi khi nội dung thay đổi — kèm JSON để lưu xuống đĩa. */
  onChange?: (payload: { text: string; doc: unknown }) => void;
  /** Tên tài liệu — dùng làm tên tệp khi xuất PDF. */
  title?: string;
  /** Đường dẫn tệp `.vdx` trên đĩa — để giải đường dẫn ảnh `assets/...`. */
  documentPath?: string | null;
  /** Trạng thái lưu (đã lưu / có thay đổi chưa lưu...) */
  saveStatus?: string;
  /** Tài liệu có thay đổi chưa lưu */
  dirty?: boolean;
}

function buildDoc(text: string): PMNode {
  const paragraph = writerSchema.node(
    "paragraph",
    null,
    text ? [writerSchema.text(text)] : [],
  );
  return writerSchema.node("doc", null, [paragraph]);
}

function docFromJSON(json: unknown): PMNode | null {
  if (!json || typeof json !== "object") {
    return null;
  }
  try {
    return writerSchema.nodeFromJSON(
      json as Parameters<typeof writerSchema.nodeFromJSON>[0],
    );
  } catch {
    return null;
  }
}

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}

function ToolbarButton({
  label,
  onClick,
  children,
  active,
  disabled,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={active ? "is-active" : undefined}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const FONT_FAMILIES = [
  { value: '"Noto Serif", "Times New Roman", serif', label: "Noto Serif" },
  { value: '"Times New Roman", Times, serif', label: "Times New Roman" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: 'Calibri, "Segoe UI", sans-serif', label: "Calibri" },
  { value: "Cambria, Georgia, serif", label: "Cambria" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: '"Courier New", Courier, monospace', label: "Courier New" },
];

const FONT_SIZES = [
  "9pt",
  "10pt",
  "10.5pt",
  "11pt",
  "12pt",
  "13pt",
  "14pt",
  "15pt",
  "16pt",
  "18pt",
  "20pt",
  "22pt",
  "24pt",
  "28pt",
  "32pt",
  "36pt",
  "48pt",
  "72pt",
];

const LINE_HEIGHTS = [
  { value: "", label: "Giãn dòng" },
  { value: "1", label: "1,0" },
  { value: "1.15", label: "1,15" },
  { value: "1.5", label: "1,5" },
  { value: "2", label: "2,0" },
  { value: "2.5", label: "2,5" },
  { value: "3", label: "3,0" },
];

const DEFAULT_TEXT_COLOR = "#14140f";
const DEFAULT_HIGHLIGHT_COLOR = "#fff0a8";

/** Lưới chọn kích thước bảng (hàng × cột). */
const TABLE_GRID_ROWS = 8;
const TABLE_GRID_COLS = 10;

/** MIME theo phần mở rộng — dùng khi nhúng ảnh thành data URL. */
const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

function imageMimeType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MIME_TYPES[extension] ?? "image/png";
}

/** Đếm số đoạn văn (khối văn bản) trong tài liệu, kể cả trong bảng. */
function countParagraphs(root: PMNode): number {
  let count = 0;
  root.descendants((node) => {
    if (node.isTextblock) {
      count += 1;
    }
    return true;
  });
  return count;
}

const VIETNAMESE_WEEKDAYS = [
  "Chủ nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

/** Các kiểu chèn ngày tháng thường dùng trong văn bản hành chính. */
const DATE_FORMAT_OPTIONS: {
  label: string;
  render: (date: Date) => string;
}[] = [
  {
    label: "Ngày/tháng/năm",
    render: (date) =>
      `${String(date.getDate()).padStart(2, "0")}/${String(
        date.getMonth() + 1,
      ).padStart(2, "0")}/${date.getFullYear()}`,
  },
  {
    label: "Ngày tháng năm (đầy đủ)",
    render: (date) =>
      `ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`,
  },
  {
    label: "Thứ, ngày/tháng/năm",
    render: (date) =>
      `${VIETNAMESE_WEEKDAYS[date.getDay()]}, ${String(
        date.getDate(),
      ).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(
        2,
        "0",
      )}/${date.getFullYear()}`,
  },
  {
    label: "Năm-tháng-ngày (ISO)",
    render: (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(date.getDate()).padStart(2, "0")}`,
  },
];

/** Ký hiệu doanh nghiệp — giáo dục dùng thường xuyên. */
const WRITER_SYMBOLS = [
  "₫",
  "€",
  "$",
  "¥",
  "©",
  "®",
  "™",
  "§",
  "¶",
  "°",
  "±",
  "×",
  "÷",
  "≠",
  "≤",
  "≥",
  "≈",
  "∞",
  "√",
  "π",
  "Σ",
  "Δ",
  "µ",
  "%",
  "‰",
  "→",
  "←",
  "↑",
  "↓",
  "•",
  "…",
  "—",
  "–",
  "“",
  "”",
  "‘",
  "’",
  "½",
  "¼",
  "¾",
  "²",
  "³",
];

/** Trường biểu mẫu điền thông tin hành chính chuẩn NĐ 30. */
const ADMINISTRATIVE_FORM_FIELDS = [
  { label: "Họ và tên", value: "[ Họ và tên: ............................................ ]" },
  { label: "Chức vụ / Đơn vị", value: "[ Chức vụ / Phòng ban: .............................. ]" },
  { label: "Số ký hiệu văn bản", value: "[ Số: ......./QĐ-UBND ]" },
  { label: "Ngày ban hành", value: "[ Ngày ..... tháng ..... năm 20... ]" },
  { label: "Hộp kiểm phê duyệt", value: "[ ☑ Đồng ý    ☐ Không đồng ý ]" },
  { label: "Chữ ký & Họ tên", value: "[ (Ký, ghi rõ họ tên và đóng dấu) ]" },
  { label: "Nơi nhận văn bản", value: "[ Nơi nhận:\n- Như Điều ...;\n- Lưu: VT, HS. ]" },
];

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function colorInputValue(value: string, fallback: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value
      .slice(1)
      .split("")
      .map((character) => character + character)
      .join("")}`;
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(
    value,
  );
  if (rgb) {
    return `#${rgb
      .slice(1)
      .map((part) =>
        Math.min(255, Number(part)).toString(16).padStart(2, "0"),
      )
      .join("")}`;
  }
  return fallback;
}

/**
 * Trình soạn thảo Writer dựa trên ProseMirror.
 *
 * Giai đoạn hiện tại: soạn thảo văn bản có định dạng, danh sách, canh lề và
 * tìm/thay thế, chạy trong WebView. Phân trang A4 thật và round-trip .docx sẽ
 * do lõi C++ đảm nhận ở giai đoạn sau — component này không được phép biết về
 * chúng.
 */
export function WriterEditor({
  initialText,
  initialContent,
  onChange,
  title,
  documentPath,
  saveStatus,
  dirty: propDirty,
}: WriterEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  /** Định dạng đã chép cho "Chép định dạng" — null khi chưa chép gì. */
  const painterMarksRef = useRef<readonly Mark[] | null>(null);
  /** Đo lại phân trang sau mỗi thay đổi — hàm được gọi từ effect cũ. */
  const measureRef = useRef<(() => void) | null>(null);
  /** Cấu hình trang hiện tại — effect tạo EditorView chỉ đọc một lần nên cần ref. */
  const pageSetupRef = useRef<PageSetup>(readPageSetup(initialContent));
  /** Danh sách bình luận — effect tạo EditorView chỉ đọc một lần nên cần ref. */
  const commentsRef = useRef<WriterComment[]>(readComments(initialContent));

  // Chỉ đọc nội dung ban đầu một lần: sau đó EditorView tự giữ state.
  // App remount component bằng `key` khi mở tài liệu khác.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialDoc = useMemo(() => docFromJSON(initialContent), []);
  const initialPlain = useMemo(
    () =>
      initialDoc
        ? initialDoc.textBetween(0, initialDoc.content.size, "\n", " ")
        : (initialText ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [, forceRender] = useState(0);
  const [stats, setStats] = useState(() => ({
    words: countWords(initialPlain),
    characters: initialPlain.length,
    charactersNoSpaces: initialPlain.replace(/\s/g, "").length,
    paragraphs: initialDoc ? countParagraphs(initialDoc) : 1,
  }));
  const [empty, setEmpty] = useState(() => initialPlain.trim() === "");

  const [searchOpen, setSearchOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [activeMatch, setActiveMatch] = useState(0);
  const [painterArmed, setPainterArmed] = useState(false);
  const [showMarks, setShowMarks] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);

  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [pagePanelOpen, setPagePanelOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<WriterComment[]>(() =>
    readComments(initialContent),
  );
  const [commentDraft, setCommentDraft] = useState<string | null>(null);
  const [commentAnchor, setCommentAnchor] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [pageSetup, setPageSetup] = useState<PageSetup>(() =>
    readPageSetup(initialContent),
  );
  const [pagination, setPagination] = useState({ page: 1, total: 1 });
  const [tableSize, setTableSize] = useState<{
    rows: number;
    cols: number;
  } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  /** Bảng chèn phụ đang mở: ngày tháng, ký hiệu hoặc biểu mẫu hành chính. */
  const [insertPanel, setInsertPanel] = useState<"date" | "symbol" | "form" | null>(
    null,
  );
  /** Chế độ chỉ đọc / bảo vệ văn bản không cho chỉnh sửa ngoài ý muốn. */
  const [readOnly, setReadOnly] = useState(false);
  const readOnlyRef = useRef(false);
  /** Bảng thống kê tài liệu (số từ, đoạn, thời gian đọc…). */
  const [statsOpen, setStatsOpen] = useState(false);
  /** Trạng thái xuất PDF: đang chạy / thông báo thành công / thông báo lỗi. */
  const [exportBusy, setExportBusy] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [ribbonTab, setRibbonTab] = useState<"home" | "insert" | "layout" | "review" | "view">("home");
  const [pagelessMode, setPagelessMode] = useState(false);
  const [showRuler, setShowRuler] = useState(true);
  const [zoom, setZoom] = useState<number>(100);
  /** Tay kéo đang hoạt động trên thước kẻ (null khi không kéo). */
  const [rulerDrag, setRulerDrag] = useState<RulerDragKind | null>(null);
  /** Giá trị xem trước khi kéo — áp dụng thật khi thả tay. */
  const [rulerPreview, setRulerPreview] = useState<RulerPreview | null>(null);
  const rulerTrackRef = useRef<HTMLDivElement>(null);
  const rulerDragRef = useRef<{
    kind: RulerDragKind;
    startX: number;
    baseMargins: PageMargins;
    baseIndent: number;
    baseFirstLineIndent: number;
    preview: RulerPreview;
  } | null>(null);

  /** Chuẩn hóa trang văn bản 1 chạm theo Nghị định 30/2020/NĐ-CP */
  const applyNd30Layout = () => {
    const nd30Setup: PageSetup = {
      ...pageSetup,
      showPageNumbers: true,
      margins: { ...ND30_MARGINS },
    };
    setPageSetup(nd30Setup);
    setExportNotice(
      "Đã chuẩn hóa toàn bộ trang văn bản theo Nghị định 30/2020/NĐ-CP (Khổ A4 đứng, Lề 20-20-30-15mm, Đánh số trang chuẩn).",
    );
    setTimeout(() => setExportNotice(null), 4500);
  };

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  /**
   * Đo chiều cao từng khối rồi chia thành trang A4.
   *
   * Chiều cao lấy từ DOM (trình duyệt mới biết), nhưng phép chia trang là
   * hàm thuần tuý nên kiểm thử được độc lập.
   */
  const measurePagination = () => {
    const view = viewRef.current;
    const host = hostRef.current;
    if (!view || !host) {
      return;
    }
    const surface = host.querySelector<HTMLElement>(".ProseMirror");
    if (!surface) {
      return;
    }

    const blocks = Array.from(surface.children) as HTMLElement[];
    const heights = blocks.map((block) => block.getBoundingClientRect().height);

    const forced: number[] = [];
    view.state.doc.forEach((node, _offset, index) => {
      if (node.type.name === "page_break") {
        forced.push(index);
      }
    });

    const breaks = computePageBreaks(
      heights,
      pageContentHeightPx(pageSetup.margins),
      forced,
    );

    const selectionPos = view.state.selection.from;
    let selectionIndex = 0;
    view.state.doc.forEach((node, offset, index) => {
      if (offset <= selectionPos && selectionPos < offset + node.nodeSize) {
        selectionIndex = index;
      }
    });

    const page = pageOfBlock(breaks, selectionIndex);
    const total = breaks.length + 1;
    setPagination((previous) =>
      previous.page === page && previous.total === total
        ? previous
        : { page, total },
    );
  };

  measureRef.current = measurePagination;

  /** Đổi đầu trang / chân trang / hiển thị số trang và báo ra ngoài để lưu. */
  const updatePageSetup = (next: PageSetup) => {
    setPageSetup(next);
    pageSetupRef.current = next;
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const text = view.state.doc.textBetween(
      0,
      view.state.doc.content.size,
      "\n",
      " ",
    );
    onChangeRef.current?.({
      text,
      doc: {
        ...view.state.doc.toJSON(),
        pageSetup: next,
        comments: commentsRef.current,
      },
    });
    forceRender((value) => value + 1);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const view: EditorView = new EditorView(host, {
      state: EditorState.create({
        schema: writerSchema,
        doc: initialDoc ?? buildDoc(initialText ?? ""),
        plugins: [
          history(),
          searchHighlightPlugin,
          createTrackChangesPlugin(),
          tableEditing({ allowTableNodeSelection: false }),
          keymap({
            "Mod-z": undo,
            "Mod-y": redo,
            "Mod-Shift-z": redo,
            ...writerKeymap,
          }),
          keymap(tableKeymap),
          keymap(baseKeymap),
        ],
      }),
      editable: () => !readOnlyRef.current,
      nodeViews: {
        task_item: (node, view, getPos) => new TaskItemView(node, view, getPos),
        image: (node, view, getPos) =>
          new ImageView(node, view, getPos, documentPath ?? null),
      },
      dispatchTransaction(transaction) {
        const next = view.state.apply(transaction);
        view.updateState(next);
        if (transaction.docChanged) {
          const text = next.doc.textBetween(0, next.doc.content.size, "\n", " ");
          setStats({
            words: countWords(text),
            characters: text.length,
            charactersNoSpaces: text.replace(/\s/g, "").length,
            paragraphs: countParagraphs(next.doc),
          });
          setEmpty(text.trim() === "");
          onChangeRef.current?.({
            text,
            doc: {
              ...next.doc.toJSON(),
              pageSetup: pageSetupRef.current,
              comments: commentsRef.current,
            },
          });
          measureRef.current?.();
        }
        forceRender((value) => value + 1);
      },
    });

    viewRef.current = view;
    // Cập nhật toolbar/trạng thái sau khi view được gắn.
    forceRender((value) => value + 1);

    // Đo phân trang lại khi cửa sổ đổi kích thước (bề rộng cột văn bản đổi
    // theo nên chiều cao các khối cũng đổi).
    const handleResize = () => measureRef.current?.();
    window.addEventListener("resize", handleResize);
    const frame = requestAnimationFrame(() => measureRef.current?.());

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    readOnlyRef.current = readOnly;
    if (viewRef.current) {
      viewRef.current.setProps({ editable: () => !readOnly });
    }
  }, [readOnly]);

  const state = viewRef.current?.state;
  const doc = state?.doc;

  // Giá trị hiển thị trên thước: ưu tiên bản xem trước khi đang kéo.
  const selectionAttrs = state?.selection.$from.parent.attrs ?? {};
  const blockIndent = normalizeIndent(selectionAttrs.indent);
  const blockFirstLineIndent = normalizeIndent(
    selectionAttrs.firstLineIndent,
  );
  const activeMargins = rulerPreview?.margins ?? pageSetup.margins;
  const activeIndent = rulerPreview?.indent ?? blockIndent;
  const activeFirstLineIndent =
    rulerPreview?.firstLineIndent ?? blockFirstLineIndent;
  const leftMarginPct = (activeMargins.left / A4_WIDTH_MM) * 100;
  const rightMarginPct = (activeMargins.right / A4_WIDTH_MM) * 100;
  const indentPct =
    ((activeMargins.left + activeIndent * INDENT_STEP_MM) / A4_WIDTH_MM) * 100;
  const firstLinePct =
    ((activeMargins.left + activeFirstLineIndent * INDENT_STEP_MM) /
      A4_WIDTH_MM) *
    100;
  const isLandscape = pageSetup.orientation === "landscape";
  const pageWidth = isLandscape ? "297mm" : "210mm";
  const pageMinHeight = isLandscape ? "210mm" : "297mm";
  const pageStyle = {
    width: pagelessMode ? undefined : pageWidth,
    minHeight: pagelessMode ? undefined : pageMinHeight,
    "--vd-page-margin-top": `${activeMargins.top}mm`,
    "--vd-page-margin-right": `${activeMargins.right}mm`,
    "--vd-page-margin-bottom": `${activeMargins.bottom}mm`,
    "--vd-page-margin-left": `${activeMargins.left}mm`,
  } as CSSProperties;
  const matches = useMemo(
    () => (doc ? findMatches(doc, query, caseSensitive) : []),
    [doc, query, caseSensitive],
  );
  const activeIndex =
    matches.length === 0 ? 0 : Math.min(activeMatch, matches.length - 1);

  const outline = useMemo(() => (doc ? collectOutline(doc) : []), [doc]);
  const activeOutline = state
    ? activeOutlineIndex(outline, state.selection.from)
    : -1;

  /** Chế độ theo dõi thay đổi đang bật hay không. */
  const trackChangesOn = state ? isTrackChangesEnabled(state) : false;
  /** Các thay đổi đang chờ người dùng chấp nhận hoặc bác bỏ. */
  const changeList = useMemo(
    () => (doc ? collectChanges(doc) : []),
    [doc],
  );
  /** Thay đổi đang chứa con trỏ — dùng cho nút duyệt từng thay đổi. */
  const currentChange = doc && state ? changeAt(doc, state.selection.from) : null;

  /** Nhảy tới tiêu đề được bấm trong bảng điều hướng. */
  const jumpToHeading = (pos: number) => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, pos + 1))
        .scrollIntoView(),
    );
    view.focus();
    forceRender((value) => value + 1);
  };

  // Chọn kết quả đầu tiên khi từ khoá thay đổi.
  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    const view = viewRef.current;
    if (!view) {
      return;
    }
    if (!query) {
      view.dispatch(
        view.state.tr.setMeta(searchHighlightKey, {
          query: "",
          caseSensitive,
          activeIndex: 0,
        }),
      );
      return;
    }

    const found = findMatches(view.state.doc, query, caseSensitive);
    setActiveMatch(0);
    if (found.length === 0) {
      view.dispatch(
        view.state.tr.setMeta(searchHighlightKey, {
          query,
          caseSensitive,
          activeIndex: 0,
        }),
      );
      return;
    }

    const match = found[0];
    view.dispatch(
      view.state.tr
        .setMeta(searchHighlightKey, {
          query,
          caseSensitive,
          activeIndex: 0,
        })
        .setSelection(
          TextSelection.create(view.state.doc, match.from, match.to),
        )
        .scrollIntoView(),
    );
  }, [query, caseSensitive, searchOpen]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    if (!linkOpen) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [linkOpen]);

  /**
   * In tài liệu hoặc xuất PDF.
   *
   * Bản in được dựng riêng (mỗi trang A4 có đầu trang, chân trang và số trang
   * riêng) rồi mới gọi hộp thoại in của hệ điều hành — cùng một đường đi cho
   * cả in giấy lẫn “Lưu thành PDF”.
   */
  const printNow = useCallback(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const surface = host.querySelector<HTMLElement>(".ProseMirror");
    if (!surface) {
      return;
    }
    printDocument({
      surface,
      header: pageSetup.header,
      footer: pageSetup.footer,
      showPageNumbers: pageSetup.showPageNumbers,
      margins: pageSetup.margins,
      title,
    });
  }, [pageSetup, title]);

  /**
   * Xuất tệp PDF thật — không qua hộp thoại in.
   * Desktop: chọn chỗ lưu rồi ghi tệp; bản web: tải tệp xuống thư mục Tải về.
   */
  const exportPdfNow = useCallback(async () => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const surface = host.querySelector<HTMLElement>(".ProseMirror");
    if (!surface) {
      return;
    }
    setExportError(null);
    setExportBusy(true);
    try {
      const result = await exportWriterPdf({
        surface,
        title: title ?? "",
        pageSetup,
      });
      const base = sanitizeFileName(title || "tai-lieu");
      if (hasNativeCore()) {
        const path = await pickExportPath(
          `${base}.pdf`,
          "Xuất PDF",
          { name: "Tài liệu PDF", extensions: ["pdf"] },
        );
        if (!path) {
          return;
        }
        await writeDocumentBinary(path, bytesToBase64(result.bytes));
      } else {
        downloadBinaryFile(`${base}.pdf`, result.bytes, "application/pdf");
      }
      setExportNotice(`Đã xuất PDF ${result.pageCount} trang.`);
    } catch (error) {
      setExportError(
        `Không xuất được PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setExportBusy(false);
    }
  }, [pageSetup, title]);

  /**
   * Xuất tệp Word (.docx) từ nội dung đang soạn.
   * Desktop: chọn chỗ lưu; bản web: tải xuống thư mục Tải về.
   */
  const exportWordNow = useCallback(async () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    setExportError(null);
    setExportBusy(true);
    try {
      const base = sanitizeFileName(title || "tai-lieu");
      const bytes = writerDocxBytes(
        { ...view.state.doc.toJSON(), pageSetup: pageSetupRef.current },
        title ?? "",
      );
      if (hasNativeCore()) {
        const path = await pickExportPath(`${base}.docx`, "Xuất Word", {
          name: "Tài liệu Word",
          extensions: ["docx"],
        });
        if (!path) {
          return;
        }
        await writeDocumentBinary(path, bytesToBase64(bytes));
      } else {
        downloadBinaryFile(`${base}.docx`, bytes, DOCX_MIME);
      }
      setExportNotice("Đã xuất tệp Word (.docx).");
    } catch (error) {
      setExportError(
        `Không xuất được Word: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setExportBusy(false);
    }
  }, [title]);

  /** Xuất văn bản thuần (.txt) — giữ xuống dòng giữa các đoạn. */
  const exportTextNow = useCallback(async () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    setExportError(null);
    setExportBusy(true);
    try {
      const base = sanitizeFileName(title || "tai-lieu");
      const text = view.state.doc.textBetween(
        0,
        view.state.doc.content.size,
        "\n\n",
        "\n",
      );
      const bytes = new TextEncoder().encode(
        text.endsWith("\n") ? text : `${text}\n`,
      );
      if (hasNativeCore()) {
        const path = await pickExportPath(`${base}.txt`, "Xuất văn bản", {
          name: "Văn bản thuần",
          extensions: ["txt"],
        });
        if (!path) {
          return;
        }
        await writeDocumentBinary(path, bytesToBase64(bytes));
      } else {
        downloadBinaryFile(`${base}.txt`, bytes, "text/plain;charset=utf-8");
      }
      setExportNotice("Đã xuất tệp văn bản (.txt).");
    } catch (error) {
      setExportError(
        `Không xuất được văn bản: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setExportBusy(false);
    }
  }, [title]);

  /** Xoá thông báo "Đã xuất" sau vài giây. */
  useEffect(() => {
    if (!exportNotice) {
      return;
    }
    const timer = window.setTimeout(() => setExportNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [exportNotice]);

  useEffect(() => {
    if (!clipboardNotice) {
      return;
    }
    const timer = window.setTimeout(() => setClipboardNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [clipboardNotice]);

  const run = (command: Command) => () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    command(view.state, view.dispatch, view);
    view.focus();
    forceRender((value) => value + 1);
  };

  const clampSideMargin = (value: number) =>
    Math.min(MAX_SIDE_MARGIN_MM, Math.max(MIN_MARGIN_MM, Math.round(value)));

  const clampIndentSteps = (value: number) =>
    Math.min(MAX_INDENT, Math.max(0, Math.round(value)));

  /** Bắt đầu kéo tay cầm trên thước kẻ. */
  const beginRulerDrag =
    (kind: RulerDragKind) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const attrs = viewRef.current?.state.selection.$from.parent.attrs ?? {};
      const baseMargins = { ...pageSetupRef.current.margins };
      const baseIndent = normalizeIndent(attrs.indent);
      const baseFirstLineIndent = normalizeIndent(attrs.firstLineIndent);
      const preview: RulerPreview = {
        margins: { ...baseMargins },
        indent: baseIndent,
        firstLineIndent: baseFirstLineIndent,
      };
      rulerDragRef.current = {
        kind,
        startX: event.clientX,
        baseMargins,
        baseIndent,
        baseFirstLineIndent,
        preview,
      };
      setRulerDrag(kind);
      setRulerPreview(preview);
    };

  /** Cập nhật giá trị xem trước trong lúc kéo. */
  const moveRulerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = rulerDragRef.current;
    const track = rulerTrackRef.current;
    if (!drag || !track) {
      return;
    }
    const trackWidth = track.getBoundingClientRect().width;
    if (trackWidth <= 0) {
      return;
    }
    const preview: RulerPreview = {
      margins: { ...drag.baseMargins },
      indent: drag.baseIndent,
      firstLineIndent: drag.baseFirstLineIndent,
    };
    if (drag.kind === "margin-left" || drag.kind === "margin-right") {
      const deltaMm = ((event.clientX - drag.startX) / trackWidth) * A4_WIDTH_MM;
      if (drag.kind === "margin-left") {
        preview.margins.left = clampSideMargin(drag.baseMargins.left + deltaMm);
      } else {
        preview.margins.right = clampSideMargin(drag.baseMargins.right - deltaMm);
      }
    } else {
      const deltaSteps = Math.round(
        (event.clientX - drag.startX) / INDENT_STEP_PX,
      );
      if (drag.kind === "indent") {
        preview.indent = clampIndentSteps(drag.baseIndent + deltaSteps);
      } else {
        preview.firstLineIndent = clampIndentSteps(
          drag.baseFirstLineIndent + deltaSteps,
        );
      }
    }
    drag.preview = preview;
    setRulerPreview(preview);
  };

  /** Áp dụng giá trị cuối cùng khi thả tay. */
  const endRulerDrag = () => {
    const drag = rulerDragRef.current;
    rulerDragRef.current = null;
    setRulerDrag(null);
    setRulerPreview(null);
    if (!drag) {
      return;
    }
    const { preview } = drag;
    if (drag.kind === "margin-left" || drag.kind === "margin-right") {
      updatePageSetup({ ...pageSetupRef.current, margins: preview.margins });
      requestAnimationFrame(() => measureRef.current?.());
      return;
    }
    if (drag.kind === "indent") {
      run(setIndent(preview.indent))();
      return;
    }
    run(setFirstLineIndent(preview.firstLineIndent))();
  };

  /** Điều khiển thước bằng phím mũi tên (1mm hoặc 1 cấp mỗi lần). */
  const nudgeRuler = (
    kind: RulerDragKind,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    const direction =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (direction === 0) {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    if (kind === "margin-left" || kind === "margin-right") {
      const margins = { ...pageSetupRef.current.margins };
      if (kind === "margin-left") {
        margins.left = clampSideMargin(margins.left + direction * step);
      } else {
        margins.right = clampSideMargin(margins.right - direction * step);
      }
      updatePageSetup({ ...pageSetupRef.current, margins });
      requestAnimationFrame(() => measureRef.current?.());
      return;
    }
    const attrs = viewRef.current?.state.selection.$from.parent.attrs ?? {};
    const base =
      kind === "indent"
        ? normalizeIndent(attrs.indent)
        : normalizeIndent(attrs.firstLineIndent);
    const next = clampIndentSteps(base + direction * step);
    run(kind === "indent" ? setIndent(next) : setFirstLineIndent(next))();
  };

  /** Cắt/Chép vùng chọn qua lệnh trình duyệt — ProseMirror lo phần nội dung. */
  const runClipboard = (command: "cut" | "copy") => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    setClipboardError(null);
    view.focus();
    const done =
      typeof document.execCommand === "function" &&
      document.execCommand(command);
    if (!done) {
      setClipboardError(
        "Trình duyệt không cho phép thao tác này — hãy dùng phím tắt Ctrl+X hoặc Ctrl+C.",
      );
    }
  };

  /** Dán văn bản thuần từ bộ nhớ tạm (webview có thể chặn đọc clipboard). */
  const pasteFromClipboard = async () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    setClipboardError(null);
    view.focus();
    if (
      typeof document.execCommand === "function" &&
      document.execCommand("paste")
    ) {
      forceRender((value) => value + 1);
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        view.dispatch(view.state.tr.insertText(text).scrollIntoView());
      }
    } catch (error) {
      setClipboardError(
        `Không đọc được bộ nhớ tạm (${error instanceof Error ? error.message : String(error)}) — hãy dùng Ctrl+V.`,
      );
    }
  };

  /** Chèn một đoạn văn bản ngắn (ngày tháng, ký hiệu) tại con trỏ. */
  const insertTextAtCursor = (text: string) => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch(view.state.tr.insertText(text).scrollIntoView());
    view.focus();
    forceRender((value) => value + 1);
  };

  const applyTemplate = (templateId: string) => {
    const tmpl = ADMINISTRATIVE_TEMPLATES.find((t) => t.id === templateId);
    const view = viewRef.current;
    if (!tmpl || !view) return;
    const newDoc = docFromJSON(tmpl.content);
    if (newDoc) {
      view.dispatch(
        view.state.tr
          .replaceWith(0, view.state.doc.content.size, newDoc.content)
          .scrollIntoView(),
      );
      view.focus();
      forceRender((value) => value + 1);
    }
    setTemplatePickerOpen(false);
  };

  /** Dán văn bản thuần, bỏ mọi định dạng của nguồn. */
  const pastePlainText = async () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    setClipboardError(null);
    view.focus();
    try {
      const text = await navigator.clipboard.readText();
      // `pasteText` chia đoạn theo dấu xuống dòng và đi qua đúng các plugin
      // xử lý dán (kể cả theo dõi thay đổi), khác với insertText một khối.
      if (text) {
        view.pasteText(text);
      }
    } catch (error) {
      setClipboardError(
        `Không đọc được bộ nhớ tạm (${error instanceof Error ? error.message : String(error)}) — hãy dùng Ctrl+Shift+V.`,
      );
    }
  };

  /** Chép toàn bộ văn bản (không kèm định dạng) vào bộ nhớ tạm. */
  const copyAllText = async () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    setClipboardError(null);
    const text = view.state.doc.textBetween(
      0,
      view.state.doc.content.size,
      "\n\n",
      "\n",
    );
    try {
      await navigator.clipboard.writeText(text);
      setClipboardNotice("Đã chép toàn bộ văn bản.");
    } catch (error) {
      setClipboardError(
        `Không chép được toàn bộ văn bản (${error instanceof Error ? error.message : String(error)}) — hãy dùng Ctrl+A rồi Ctrl+C.`,
      );
    }
    view.focus();
  };

  /**
   * "Chép định dạng": bấm lần đầu để lấy định dạng tại vùng chọn, chọn đoạn
   * đích rồi bấm lần hai để dán định dạng.
   */
  const toggleFormatPainter = () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    setClipboardError(null);
    const pending = painterMarksRef.current;
    if (pending) {
      if (view.state.selection.empty) {
        setClipboardError("Hãy chọn đoạn văn bản cần dán định dạng.");
        return;
      }
      painterMarksRef.current = null;
      setPainterArmed(false);
      run(applyFormatting(pending))();
      return;
    }
    painterMarksRef.current = formattingMarksAtSelection(view.state);
    setPainterArmed(true);
    view.focus();
  };

  /** Bật/tắt chế độ theo dõi thay đổi. */
  const toggleTrackChangesMode = () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    toggleTrackChanges(view.state, view.dispatch);
    view.focus();
    forceRender((value) => value + 1);
  };

  /** Chấp nhận mọi thay đổi đang chờ. */
  const acceptAll = () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    acceptAllChanges(view);
    view.focus();
    forceRender((value) => value + 1);
  };

  /** Bác bỏ mọi thay đổi đang chờ. */
  const rejectAll = () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    rejectAllChanges(view);
    view.focus();
    forceRender((value) => value + 1);
  };

  /** Chấp nhận hoặc bác bỏ thay đổi đang chứa con trỏ. */
  const resolveCurrentChange = (accept: boolean) => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    if (accept) {
      acceptChange(view);
    } else {
      rejectChange(view);
    }
    view.focus();
    forceRender((value) => value + 1);
  };

  /** Ghi lại nội dung tài liệu kèm danh sách bình luận mới. */
  const persistComments = (next: WriterComment[]) => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const text = view.state.doc.textBetween(
      0,
      view.state.doc.content.size,
      "\n",
      " ",
    );
    onChangeRef.current?.({
      text,
      doc: {
        ...view.state.doc.toJSON(),
        pageSetup: pageSetupRef.current,
        comments: next,
      },
    });
  };

  /** Mở ô viết bình luận cho đoạn văn bản đang bôi đen. */
  const startComment = () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    setCommentsOpen(true);
    const { from, to, empty } = view.state.selection;
    if (empty) {
      setCommentAnchor(null);
      setCommentDraft(null);
      setCommentError("Hãy bôi đen đoạn văn bản cần bình luận.");
      return;
    }
    setCommentAnchor({ from, to });
    setCommentDraft("");
    setCommentError(null);
  };

  /** Lưu bình luận mới và ghim vào đúng đoạn văn bản đã bôi đen. */
  const submitComment = () => {
    const view = viewRef.current;
    const text = (commentDraft ?? "").trim();
    if (!view || !commentAnchor) {
      setCommentError("Chưa có đoạn văn bản được bôi đen.");
      return;
    }
    if (!text) {
      setCommentError("Nhập nội dung bình luận.");
      return;
    }
    if (text.length > MAX_COMMENT_TEXT) {
      setCommentError(`Bình luận tối đa ${MAX_COMMENT_TEXT} ký tự.`);
      return;
    }

    const id = createCommentId();
    const quote = view.state.doc.textBetween(
      commentAnchor.from,
      commentAnchor.to,
      " ",
      " ",
    );
    view.dispatch(
      view.state.tr.addMark(
        commentAnchor.from,
        commentAnchor.to,
        writerSchema.marks.comment.create({ id }),
      ),
    );

    const next: WriterComment[] = [
      ...commentsRef.current,
      {
        id,
        author: DEFAULT_CHANGE_AUTHOR,
        text,
        quote: quote.slice(0, MAX_COMMENT_QUOTE),
        createdAt: Date.now(),
      },
    ];
    commentsRef.current = next;
    setComments(next);
    setCommentDraft(null);
    setCommentAnchor(null);
    setCommentError(null);
    persistComments(next);
    view.focus();
    forceRender((value) => value + 1);
  };

  /** Xoá một bình luận: gỡ ghim khỏi văn bản và khỏi danh sách bên cạnh. */
  const removeComment = (id: string) => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const range = findCommentRange(view.state.doc, id);
    if (range) {
      view.dispatch(
        view.state.tr.removeMark(
          range.from,
          range.to,
          writerSchema.marks.comment,
        ),
      );
    }
    const next = commentsRef.current.filter((item) => item.id !== id);
    commentsRef.current = next;
    setComments(next);
    persistComments(next);
    forceRender((value) => value + 1);
  };

  /** Nhảy tới đoạn văn bản được bình luận. */
  const focusComment = (id: string) => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const range = findCommentRange(view.state.doc, id);
    if (!range) {
      return;
    }
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, range.from, range.to))
        .scrollIntoView(),
    );
    view.focus();
    forceRender((value) => value + 1);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    const view = viewRef.current;
    if (view) {
      view.dispatch(
        view.state.tr.setMeta(searchHighlightKey, {
          query: "",
          caseSensitive: false,
          activeIndex: 0,
        }),
      );
      view.focus();
    }
  };

  /**
   * In tài liệu hoặc xuất PDF.
   *
   * Bản in được dựng riêng (mỗi trang A4 có đầu trang, chân trang và số trang
   * riêng) rồi mới gọi hộp thoại in của hệ điều hành — cùng một đường đi cho
   * cả in giấy lẫn “Lưu thành PDF”.
   */
  const openLinkBar = () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const existing = markValue(view.state, writerSchema.marks.link, "href");
    setLinkUrl(typeof existing === "string" ? existing : "");
    setLinkError(null);
    setLinkOpen(true);
  };

  const applyLink = () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const value = linkUrl.trim();
    if (!value) {
      setLinkError("Nhập địa chỉ liên kết trước khi chèn.");
      return;
    }
    if (!normalizeHref(value)) {
      setLinkError(
        "Địa chỉ không hợp lệ — chỉ nhận http, https, mailto, tel hoặc đường dẫn nội bộ.",
      );
      return;
    }
    if (!setLink(value)(view.state, view.dispatch, view)) {
      setLinkError("Hãy bôi đen phần văn bản cần gắn liên kết.");
      return;
    }
    setLinkOpen(false);
    setLinkUrl("");
    setLinkError(null);
    view.focus();
    forceRender((value) => value + 1);
  };

  /**
   * Chèn ảnh vào tài liệu.
   *
   * Trên Tauri mở hộp thoại chọn tệp của hệ điều hành, đọc ảnh rồi lưu vào thư
   * mục `assets` cạnh tệp `.vdx` (đường dẫn tương đối trong tài liệu). Khi tài
   * liệu chưa lưu hoặc đang chạy trong trình duyệt, nhúng ảnh trực tiếp bằng
   * data URL để không phụ thuộc đường dẫn trên đĩa.
   */
  const handleInsertImage = async () => {
    setImageError(null);
    if (!hasNativeCore()) {
      imageInputRef.current?.click();
      return;
    }
    try {
      const path = await pickImageFile();
      if (!path) {
        return;
      }
      const base64 = await readImageBase64(path);
      const fileName = fileNameFromPath(path);
      const src = documentPath
        ? await writeImageAsset(documentPath, fileName, base64)
        : `data:${imageMimeType(fileName)};base64,${base64}`;
      run(insertImage({ src, alt: fileName }))();
    } catch (error) {
      setImageError(error instanceof Error ? error.message : String(error));
    }
  };

  /** Xử lý ảnh được chọn qua `<input type="file">` (trình duyệt / tài liệu chưa lưu). */
  const handleImageFile = async (file: File | undefined) => {
    setImageError(null);
    if (!file) {
      return;
    }
    if (file.size > MAX_ASSET_BYTES) {
      setImageError(
        `Ảnh quá lớn (${Math.round(file.size / (1024 * 1024))} MB). Giới hạn hiện tại là 16 MB.`,
      );
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      run(insertImage({ src: dataUrl, alt: file.name }))();
    } catch (error) {
      setImageError(error instanceof Error ? error.message : String(error));
    }
  };

  const findNext = (direction: 1 | -1) => {
    const view = viewRef.current;
    if (!view || !query) {
      return;
    }
    const currentMatches = findMatches(view.state.doc, query, caseSensitive);
    if (currentMatches.length === 0) {
      setActiveMatch(0);
      return;
    }

    const selection = view.state.selection;
    const currentIndex = currentMatches.findIndex(
      (match) => match.from === selection.from && match.to === selection.to,
    );
    const base =
      currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0;
    const next =
      (((base + direction) % currentMatches.length) +
        currentMatches.length) %
      currentMatches.length;
    const match = currentMatches[next];
    view.dispatch(
      view.state.tr
        .setMeta(searchHighlightKey, {
          query,
          caseSensitive,
          activeIndex: next,
        })
        .setSelection(
          TextSelection.create(view.state.doc, match.from, match.to),
        )
        .scrollIntoView(),
    );
    setActiveMatch(next);
  };

  const replaceCurrent = () => {
    const view = viewRef.current;
    if (!view || !query) {
      return;
    }
    const currentMatches = findMatches(view.state.doc, query, caseSensitive);
    if (currentMatches.length === 0) {
      return;
    }

    const index = Math.min(activeMatch, currentMatches.length - 1);
    const match = currentMatches[index];
    view.dispatch(view.state.tr.insertText(replacement, match.from, match.to));

    const nextMatches = findMatches(view.state.doc, query, caseSensitive);
    if (nextMatches.length === 0) {
      setActiveMatch(0);
      return;
    }
    const nextIndex = Math.min(index, nextMatches.length - 1);
    const nextMatch = nextMatches[nextIndex];
    view.dispatch(
      view.state.tr
        .setMeta(searchHighlightKey, {
          query,
          caseSensitive,
          activeIndex: nextIndex,
        })
        .setSelection(
          TextSelection.create(view.state.doc, nextMatch.from, nextMatch.to),
        )
        .scrollIntoView(),
    );
    setActiveMatch(nextIndex);
  };

  const replaceAll = () => {
    const view = viewRef.current;
    if (!view || !query) {
      return;
    }
    const currentMatches = findMatches(view.state.doc, query, caseSensitive);
    if (currentMatches.length === 0) {
      return;
    }

    let transaction = view.state.tr.setMeta(searchHighlightKey, {
      query,
      caseSensitive,
      activeIndex: 0,
    });
    for (let index = currentMatches.length - 1; index >= 0; index -= 1) {
      const match = currentMatches[index];
      transaction = transaction.insertText(
        replacement,
        match.from,
        match.to,
      );
    }
    view.dispatch(transaction);
    setActiveMatch(0);
  };

  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.altKey && event.key.toLowerCase() === "p") {
      event.preventDefault();
      printNow();
      return;
    }
    if (mod && !event.altKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      setReplaceMode(false);
      setSearchOpen(true);
      return;
    }
    if (mod && !event.altKey && event.key.toLowerCase() === "h") {
      event.preventDefault();
      setReplaceMode(true);
      setSearchOpen(true);
      return;
    }
    if (event.key === "Escape") {
      if (focusMode) {
        event.preventDefault();
        setFocusMode(false);
        return;
      }
      if (searchOpen) {
        event.preventDefault();
        closeSearch();
      }
    }
  };

  const strongActive = state
    ? markActive(state, writerSchema.marks.strong)
    : false;
  const emActive = state ? markActive(state, writerSchema.marks.em) : false;
  const underlineActive = state
    ? markActive(state, writerSchema.marks.underline)
    : false;
  const strikeActive = state
    ? markActive(state, writerSchema.marks.strike)
    : false;
  const superscriptActive = state
    ? markActive(state, writerSchema.marks.superscript)
    : false;
  const subscriptActive = state
    ? markActive(state, writerSchema.marks.subscript)
    : false;
  const currentBlock = state?.selection.$from.parent;
  /**
   * Kiểu khối đang chọn, dùng cho hộp "Kiểu đoạn": "paragraph" hoặc
   * "heading-1".."heading-6".
   */
  const blockStyle =
    currentBlock?.type === writerSchema.nodes.heading
      ? `heading-${Math.min(Math.max(Number(currentBlock.attrs.level) || 1, 1), 6)}`
      : "paragraph";
  const currentAlign =
    normalizeAlign(currentBlock?.attrs.align) ?? "left";
  const currentIndent = normalizeIndent(currentBlock?.attrs.indent);
  const bulletActive = state
    ? listActive(state, writerSchema.nodes.bullet_list)
    : false;
  const orderedActive = state
    ? listActive(state, writerSchema.nodes.ordered_list)
    : false;
  const taskActive = state
    ? listActive(state, writerSchema.nodes.task_list)
    : false;
  const canUndo = state ? undo(state) : false;
  const canRedo = state ? redo(state) : false;
  const tableActive = state ? inTable(state) : false;
  /** Thời gian đọc ước tính — 200 từ mỗi phút. */
  const readingMinutes =
    stats.words === 0 ? 0 : Math.max(1, Math.ceil(stats.words / 200));

  const fontFamily = state
    ? (normalizeFontFamily(
        markValue(state, writerSchema.marks.fontFamily, "family"),
      ) ?? "")
    : "";
  const fontSize = state
    ? (normalizeFontSize(
        markValue(state, writerSchema.marks.fontSize, "size"),
      ) ?? "")
    : "";
  const textColor = state
    ? (normalizeColor(
        markValue(state, writerSchema.marks.textColor, "color"),
      ) ?? DEFAULT_TEXT_COLOR)
    : DEFAULT_TEXT_COLOR;
  const highlightColor = state
    ? (normalizeColor(
        markValue(state, writerSchema.marks.highlight, "color"),
      ) ?? DEFAULT_HIGHLIGHT_COLOR)
    : DEFAULT_HIGHLIGHT_COLOR;
  const lineHeight = state
    ? (normalizeLineHeight(currentBlock?.attrs.lineHeight) ?? "")
    : "";

  /** Tăng/giảm cỡ chữ theo nấc gần nhất trong FONT_SIZES (Word style A^/A∨). */
  const bumpFontSize = (direction: 1 | -1) => {
    const current = fontSize ? parseFloat(fontSize) : 12;
    const values = FONT_SIZES.map((size) => parseFloat(size));
    let next: number;
    if (direction > 0) {
      next =
        values.find((value) => value > current + 0.01) ??
        values[values.length - 1];
    } else {
      next = values[0];
      for (let index = values.length - 1; index >= 0; index -= 1) {
        if (values[index] < current - 0.01) {
          next = values[index];
          break;
        }
      }
    }
    if (next === current) {
      return () => {};
    }
    return run(
      setMarkAttr(writerSchema.marks.fontSize, { size: `${next}pt` }),
    );
  };

  return (
    <div
      className={`vd-writer${showMarks ? " is-show-marks" : ""}${focusMode ? " is-focus-mode" : ""}`}
      onKeyDown={handleRootKeyDown}
    >
      {focusMode ? (
        <button
          type="button"
          className="vd-writer__focus-exit"
          onClick={() => setFocusMode(false)}
          title="Thoát chế độ tập trung (Esc)"
          aria-label="Thoát chế độ tập trung"
        >
          ✕ Thoát tập trung (Esc)
        </button>
      ) : null}
      <div className="vd-writer__toolbar" role="toolbar" aria-label="Định dạng">
        <div className="vd-writer__tab-strip" role="tablist" aria-label="Nhóm chức năng Writer">
          <div className="vd-writer__tabs-left">
            <button
              type="button"
              role="tab"
              aria-selected={ribbonTab === "home"}
              className={`vd-writer__tab-btn${ribbonTab === "home" ? " is-active" : ""}`}
              onClick={() => setRibbonTab("home")}
            >
              Trang chủ
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ribbonTab === "insert"}
              className={`vd-writer__tab-btn${ribbonTab === "insert" ? " is-active" : ""}`}
              onClick={() => setRibbonTab("insert")}
            >
              Chèn & Biểu mẫu
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ribbonTab === "layout"}
              className={`vd-writer__tab-btn${ribbonTab === "layout" ? " is-active" : ""}`}
              onClick={() => setRibbonTab("layout")}
            >
              Bố cục trang
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ribbonTab === "review"}
              className={`vd-writer__tab-btn${ribbonTab === "review" ? " is-active" : ""}`}
              onClick={() => setRibbonTab("review")}
            >
              Kiểm duyệt
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ribbonTab === "view"}
              className={`vd-writer__tab-btn${ribbonTab === "view" ? " is-active" : ""}`}
              onClick={() => setRibbonTab("view")}
            >
              Hiển thị
            </button>
          </div>

          <div className="vd-writer__tab-actions">
            <button
              type="button"
              className={`vd-writer__toggle-btn${pagelessMode ? " is-active" : ""}`}
              onClick={() => setPagelessMode((prev) => !prev)}
              title={pagelessMode ? "Chuyển về Chế độ Trang in chuẩn A4" : "Chuyển sang Chế độ Không ngắt trang liên tục"}
            >
              <span>{pagelessMode ? "Trang in A4" : "Không ngắt trang"}</span>
            </button>
            <button
              type="button"
              className={`vd-writer__toggle-btn${readOnly ? " is-active" : ""}`}
              onClick={() => setReadOnly((prev) => !prev)}
              title={readOnly ? "Đang khóa chỉnh sửa (Chỉ đọc). Nhấn để bật chế độ Soạn thảo" : "Khóa chỉnh sửa văn bản (Chế độ Chỉ đọc bảo vệ)"}
            >
              <span>{readOnly ? "Đang bảo vệ (Chỉ đọc)" : "Chế độ đọc"}</span>
            </button>
            <button
              type="button"
              className="vd-writer__nd30-btn"
              onClick={applyNd30Layout}
              title="Chuẩn hóa toàn bộ trang văn bản theo Nghị định 30/2020/NĐ-CP (Lề 20-20-30-15mm, Khổ A4, Đánh số trang chuẩn)"
            >
              <FileCheck size={14} aria-hidden="true" />
              <span>Chuẩn hóa NĐ 30</span>
            </button>
          </div>
        </div>
        <div className="vd-writer__toolbar-strip">
          {/* TAB 1: TRANG CHỦ */}
          <div className="vd-writer__tab-panel" hidden={ribbonTab !== "home"}>
            <div className="vd-writer__tgroup vd-writer__tgroup--rail">
              <div className="vd-writer__tgroup-line vd-writer__tgroup-line--stack">
                <ToolbarButton
                  label="Hoàn tác (Ctrl+Z)"
                  onClick={run(undo)}
                  disabled={!canUndo}
                >
                  <Undo2 size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Làm lại (Ctrl+Y)"
                  onClick={run(redo)}
                  disabled={!canRedo}
                >
                  <Redo2 size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Hoàn tác</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Dán (Ctrl+V)"
                  onClick={() => void pasteFromClipboard()}
                >
                  <ClipboardPaste size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Cắt (Ctrl+X)"
                  onClick={() => runClipboard("cut")}
                >
                  <Scissors size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Chép (Ctrl+C)"
                  onClick={() => runClipboard("copy")}
                >
                  <Copy size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Chép định dạng — bấm lần nữa để dán định dạng vào vùng chọn"
                  active={painterArmed}
                  onClick={toggleFormatPainter}
                >
                  <Paintbrush size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Dán không định dạng (Ctrl+Shift+V)"
                  onClick={() => void pastePlainText()}
                >
                  <ClipboardType size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Xóa nội dung đang chọn"
                  disabled={!state || state.selection.empty}
                  onClick={run(deleteSelection)}
                >
                  <Eraser size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Chép toàn bộ văn bản"
                  onClick={() => void copyAllText()}
                >
                  <ClipboardCopy size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Bảng tạm</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <select
                  className="vd-writer__select vd-writer__select--family"
                  value={fontFamily}
                  aria-label="Kiểu chữ"
                  title="Kiểu chữ"
                  onChange={(event) =>
                    run(
                      event.target.value
                        ? setMarkAttr(writerSchema.marks.fontFamily, {
                            family: event.target.value,
                          })
                        : removeMarkType(writerSchema.marks.fontFamily),
                    )()
                  }
                >
                  <option value="">Mặc định</option>
                  {FONT_FAMILIES.map((font) => (
                    <option key={font.label} value={font.value}>
                      {font.label}
                    </option>
                  ))}
                  {fontFamily &&
                  !FONT_FAMILIES.some((font) => font.value === fontFamily) ? (
                    <option value={fontFamily}>{fontFamily}</option>
                  ) : null}
                </select>

                <select
                  className="vd-writer__select vd-writer__select--size"
                  value={fontSize}
                  aria-label="Cỡ chữ"
                  title="Cỡ chữ"
                  onChange={(event) =>
                    run(
                      event.target.value
                        ? setMarkAttr(writerSchema.marks.fontSize, {
                            size: event.target.value,
                          })
                        : removeMarkType(writerSchema.marks.fontSize),
                    )()
                  }
                >
                  <option value="">Mặc định</option>
                  {FONT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                  {fontSize && !FONT_SIZES.includes(fontSize) ? (
                    <option value={fontSize}>{fontSize}</option>
                  ) : null}
                </select>

                <ToolbarButton label="Tăng cỡ chữ" onClick={bumpFontSize(1)}>
                  <AArrowUp size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton label="Giảm cỡ chữ" onClick={bumpFontSize(-1)}>
                  <AArrowDown size={17} aria-hidden="true" />
                </ToolbarButton>

                <span className="vd-writer__color" title="Màu chữ">
                  <span
                    className="vd-writer__color-swatch"
                    style={{ color: textColor }}
                    aria-hidden="true"
                  >
                    A
                  </span>
                  <input
                    type="color"
                    value={colorInputValue(textColor, DEFAULT_TEXT_COLOR)}
                    aria-label="Màu chữ"
                    onChange={(event) =>
                      run(
                        setMarkAttr(writerSchema.marks.textColor, {
                          color: event.target.value,
                        }),
                      )()
                    }
                  />
                </span>

                <span className="vd-writer__color" title="Tô sáng">
                  <span
                    className="vd-writer__color-swatch vd-writer__color-swatch--highlight"
                    style={{ background: highlightColor }}
                    aria-hidden="true"
                  />
                  <input
                    type="color"
                    value={colorInputValue(
                      highlightColor,
                      DEFAULT_HIGHLIGHT_COLOR,
                    )}
                    aria-label="Tô sáng"
                    onChange={(event) =>
                      run(
                        setMarkAttr(writerSchema.marks.highlight, {
                          color: event.target.value,
                        }),
                      )()
                    }
                  />
                </span>

                <ToolbarButton
                  label="Xóa định dạng"
                  onClick={run(clearFormatting())}
                >
                  <RemoveFormatting size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Đậm (Ctrl+B)"
                  active={strongActive}
                  onClick={run(toggleMark(writerSchema.marks.strong))}
                >
                  <Bold size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Nghiêng (Ctrl+I)"
                  active={emActive}
                  onClick={run(toggleMark(writerSchema.marks.em))}
                >
                  <Italic size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Gạch chân (Ctrl+U)"
                  active={underlineActive}
                  onClick={run(toggleMark(writerSchema.marks.underline))}
                >
                  <Underline size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Gạch ngang (Ctrl+Shift+X)"
                  active={strikeActive}
                  onClick={run(toggleMark(writerSchema.marks.strike))}
                >
                  <Strikethrough size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Chỉ số trên (Ctrl+Shift+.)"
                  active={superscriptActive}
                  onClick={run(toggleMark(writerSchema.marks.superscript))}
                >
                  <Superscript size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Chỉ số dưới (Ctrl+Shift+,)"
                  active={subscriptActive}
                  onClick={run(toggleMark(writerSchema.marks.subscript))}
                >
                  <Subscript size={17} aria-hidden="true" />
                </ToolbarButton>
                <select
                  className="vd-writer__select vd-writer__select--case"
                  value=""
                  aria-label="Đổi chữ hoa/thường"
                  title="Đổi chữ hoa/thường (Aa)"
                  onChange={(event) => {
                    const mode = event.target.value as CaseMode | "";
                    if (mode) {
                      run(changeCase(mode))();
                    }
                    event.target.value = "";
                  }}
                >
                  <option value="">Aa</option>
                  <option value="upper">CHỮ HOA</option>
                  <option value="lower">chữ thường</option>
                  <option value="sentence">Viết hoa đầu câu</option>
                  <option value="capitalize">Viết Hoa Mỗi Từ</option>
                  <option value="toggle">Đảo chữ hoa/thường</option>
                </select>
              </div>
              <span className="vd-writer__tgroup-caption">Phông chữ</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Danh sách gạch đầu dòng (Ctrl+Shift+8)"
                  active={bulletActive}
                  onClick={run(toggleList(writerSchema.nodes.bullet_list))}
                >
                  <List size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Danh sách đánh số (Ctrl+Shift+7)"
                  active={orderedActive}
                  onClick={run(toggleList(writerSchema.nodes.ordered_list))}
                >
                  <ListOrdered size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Danh sách việc cần làm (Ctrl+Shift+9)"
                  active={taskActive}
                  onClick={run(toggleTaskList())}
                >
                  <ListChecks size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Lùi lề ra (Ctrl+[)"
                  disabled={currentIndent <= 0}
                  onClick={run(changeIndent(-1))}
                >
                  <IndentDecrease size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Thụt lề vào (Ctrl+])"
                  disabled={currentIndent >= 6}
                  onClick={run(changeIndent(1))}
                >
                  <IndentIncrease size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Canh trái (Ctrl+Shift+L)"
                  active={currentAlign === "left"}
                  onClick={run(setAlign("left"))}
                >
                  <AlignLeft size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Canh giữa (Ctrl+Shift+E)"
                  active={currentAlign === "center"}
                  onClick={run(setAlign("center"))}
                >
                  <AlignCenter size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Canh phải (Ctrl+Shift+R)"
                  active={currentAlign === "right"}
                  onClick={run(setAlign("right"))}
                >
                  <AlignRight size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Canh đều (Ctrl+Shift+J)"
                  active={currentAlign === "justify"}
                  onClick={run(setAlign("justify"))}
                >
                  <AlignJustify size={17} aria-hidden="true" />
                </ToolbarButton>
                <select
                  className="vd-writer__select vd-writer__select--spacing"
                  value={lineHeight}
                  aria-label="Giãn dòng"
                  title="Giãn dòng"
                  onChange={(event) =>
                    run(setLineHeight(event.target.value || null))()
                  }
                >
                  {LINE_HEIGHTS.map((item) => (
                    <option key={item.label} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                  {lineHeight &&
                  !LINE_HEIGHTS.some((item) => item.value === lineHeight) ? (
                    <option value={lineHeight}>{lineHeight}</option>
                  ) : null}
                </select>
                <ToolbarButton
                  label="Hiện/ẩn dấu đoạn ¶"
                  active={showMarks}
                  onClick={() => {
                    setShowMarks((value) => !value);
                    viewRef.current?.focus();
                  }}
                >
                  <Pilcrow size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Sắp xếp đoạn văn A→Z (chọn từ hai đoạn trở lên)"
                  onClick={run(sortSelectedBlocks())}
                >
                  <ArrowDownAZ size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Đoạn văn</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <select
                  className="vd-writer__select vd-writer__select--block"
                  value={blockStyle}
                  aria-label="Kiểu đoạn"
                  title="Kiểu đoạn"
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "paragraph") {
                      run(setBlock(writerSchema.nodes.paragraph))();
                      return;
                    }
                    const level = Number(value.replace("heading-", ""));
                    if (Number.isInteger(level) && level >= 1 && level <= 6) {
                      run(setBlock(writerSchema.nodes.heading, { level }))();
                    }
                  }}
                >
                  <option value="paragraph">Đoạn văn</option>
                  {[1, 2, 3, 4, 5, 6].map((level) => (
                    <option key={level} value={`heading-${level}`}>
                      Tiêu đề {level}
                    </option>
                  ))}
                </select>
              </div>
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Đoạn văn thường"
                  active={blockStyle === "paragraph"}
                  onClick={run(setBlock(writerSchema.nodes.paragraph))}
                >
                  <Type size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Tiêu đề 1"
                  active={blockStyle === "heading-1"}
                  onClick={run(setBlock(writerSchema.nodes.heading, { level: 1 }))}
                >
                  <Heading1 size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Tiêu đề 2"
                  active={blockStyle === "heading-2"}
                  onClick={run(setBlock(writerSchema.nodes.heading, { level: 2 }))}
                >
                  <Heading2 size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Tiêu đề 3"
                  active={blockStyle === "heading-3"}
                  onClick={run(setBlock(writerSchema.nodes.heading, { level: 3 }))}
                >
                  <Heading3 size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Kiểu</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Tìm trong văn bản (Ctrl+F)"
                  onClick={() => {
                    setReplaceMode(false);
                    setSearchOpen(true);
                  }}
                >
                  <Search size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Tìm và thay thế (Ctrl+H)"
                  onClick={() => {
                    setReplaceMode(true);
                    setSearchOpen(true);
                  }}
                >
                  <Replace size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Chọn tất cả (Ctrl+A)"
                  onClick={run(selectAll)}
                >
                  <SquareDashed size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Chỉnh sửa</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Chèn ngày tháng"
                  active={insertPanel === "date"}
                  onClick={() =>
                    setInsertPanel((open) => (open === "date" ? null : "date"))
                  }
                >
                  <CalendarDays size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Chèn ký hiệu"
                  active={insertPanel === "symbol"}
                  onClick={() =>
                    setInsertPanel((open) =>
                      open === "symbol" ? null : "symbol",
                    )
                  }
                >
                  <Sigma size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Xuất Word (.docx)"
                  onClick={() => void exportWordNow()}
                  disabled={exportBusy}
                >
                  <FileType size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Xuất văn bản (.txt)"
                  onClick={() => void exportTextNow()}
                  disabled={exportBusy}
                >
                  <FileText size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Tiện ích</span>
            </div>
          </div>

          {/* TAB 2: CHÈN & BIỂU MẪU */}
          <div className="vd-writer__tab-panel" hidden={ribbonTab !== "insert"}>
            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Chèn bảng"
                  onClick={() => {
                    setTableSize(null);
                    setTablePickerOpen((open) => !open);
                  }}
                >
                  <Table size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Bảng biểu</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Chèn ảnh"
                  onClick={() => void handleInsertImage()}
                >
                  <Image size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton label="Chèn liên kết" onClick={openLinkBar}>
                  <Link2 size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Phương tiện</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Ngắt trang"
                  onClick={run(insertPageBreak())}
                >
                  <SeparatorHorizontal size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Chèn đường kẻ ngang"
                  onClick={run(insertHorizontalRule())}
                >
                  <Minus size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Trang & Ngắt</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Chèn ngày tháng"
                  active={insertPanel === "date"}
                  onClick={() =>
                    setInsertPanel((open) => (open === "date" ? null : "date"))
                  }
                >
                  <CalendarDays size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Chèn ký hiệu"
                  active={insertPanel === "symbol"}
                  onClick={() =>
                    setInsertPanel((open) =>
                      open === "symbol" ? null : "symbol",
                    )
                  }
                >
                  <Sigma size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Ký hiệu & Ngày</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Biểu mẫu chuẩn Nghị định 30"
                  active={templatePickerOpen}
                  onClick={() => setTemplatePickerOpen((open) => !open)}
                >
                  <FileText size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Chèn trường biểu mẫu (OFORM)"
                  active={insertPanel === "form"}
                  onClick={() =>
                    setInsertPanel((open) => (open === "form" ? null : "form"))
                  }
                >
                  <SquareDashed size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Biểu mẫu</span>
            </div>
          </div>

          {/* TAB 3: BỐ CỤC TRANG */}
          <div className="vd-writer__tab-panel" hidden={ribbonTab !== "layout"}>
            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <button
                  type="button"
                  className="vd-writer__nd30-btn"
                  onClick={applyNd30Layout}
                  title="Chuẩn hóa toàn bộ trang văn bản theo Nghị định 30/2020/NĐ-CP (Lề 20-20-30-15mm, Khổ A4, Đánh số trang chuẩn)"
                >
                  <FileCheck size={16} aria-hidden="true" />
                  <span>Chuẩn hóa NĐ 30</span>
                </button>
              </div>
              <span className="vd-writer__tgroup-caption">Thể thức chuẩn</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <select
                  className="vd-writer__select"
                  value={
                    pageSetup.margins?.top === 20 &&
                    pageSetup.margins?.bottom === 20 &&
                    pageSetup.margins?.left === 30 &&
                    pageSetup.margins?.right === 15
                      ? "nd30"
                      : "custom"
                  }
                  onChange={(e) => {
                    if (e.target.value === "nd30") {
                      updatePageSetup({
                        ...pageSetup,
                        margins: { top: 20, bottom: 20, left: 30, right: 15 },
                      });
                    } else if (e.target.value === "standard") {
                      updatePageSetup({
                        ...pageSetup,
                        margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
                      });
                    } else if (e.target.value === "narrow") {
                      updatePageSetup({
                        ...pageSetup,
                        margins: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 },
                      });
                    } else if (e.target.value === "wide") {
                      updatePageSetup({
                        ...pageSetup,
                        margins: { top: 25.4, bottom: 25.4, left: 38.1, right: 38.1 },
                      });
                    }
                  }}
                  title="Thiết lập lề trang nhanh"
                  aria-label="Căn lề trang"
                >
                  <option value="nd30">Lề chuẩn NĐ 30 (20-20-30-15 mm)</option>
                  <option value="standard">Tiêu chuẩn (25.4 mm)</option>
                  <option value="narrow">Lề hẹp (12.7 mm)</option>
                  <option value="wide">Lề rộng (25.4 - 38.1 mm)</option>
                  <option value="custom">Tùy biến...</option>
                </select>
                <ToolbarButton
                  label="Tùy chỉnh lề chi tiết"
                  active={pagePanelOpen}
                  onClick={() => setPagePanelOpen((v) => !v)}
                >
                  <PanelTop size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Lề trang</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <select
                  className="vd-writer__select"
                  value={pageSetup.orientation ?? "portrait"}
                  onChange={(e) =>
                    updatePageSetup({
                      ...pageSetup,
                      orientation: e.target.value as "portrait" | "landscape",
                    })
                  }
                  title="Hướng trang"
                  aria-label="Hướng trang"
                >
                  <option value="portrait">Trang đứng (Portrait)</option>
                  <option value="landscape">Trang ngang (Landscape)</option>
                </select>
                <select
                  className="vd-writer__select"
                  value={pageSetup.paperSize ?? "a4"}
                  onChange={(e) =>
                    updatePageSetup({
                      ...pageSetup,
                      paperSize: e.target.value as "a4" | "letter" | "legal",
                    })
                  }
                  title="Khổ giấy"
                  aria-label="Khổ giấy"
                >
                  <option value="a4">Khổ A4 (210 × 297 mm)</option>
                  <option value="letter">Letter (8.5 × 11 in)</option>
                  <option value="legal">Legal (8.5 × 14 in)</option>
                </select>
              </div>
              <span className="vd-writer__tgroup-caption">Khổ giấy</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Lùi lề ra (Ctrl+[)"
                  disabled={currentIndent <= 0}
                  onClick={run(changeIndent(-1))}
                >
                  <IndentDecrease size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Thụt lề vào (Ctrl+])"
                  disabled={currentIndent >= 6}
                  onClick={run(changeIndent(1))}
                >
                  <IndentIncrease size={17} aria-hidden="true" />
                </ToolbarButton>
                <select
                  className="vd-writer__select"
                  value=""
                  onChange={(e) => {
                    const mm = Number(e.target.value);
                    if (!isNaN(mm)) run(setFirstLineIndent(mm))();
                    e.target.value = "";
                  }}
                  title="Thụt dòng đầu tiên (First Line Indent)"
                  aria-label="Thụt dòng đầu"
                >
                  <option value="">Thụt dòng đầu...</option>
                  <option value="0">Không thụt dòng (0 mm)</option>
                  <option value="10">Thụt 10 mm</option>
                  <option value="12.7">Thụt chuẩn NĐ 30 (12.7 mm)</option>
                  <option value="15">Thụt 15 mm</option>
                </select>
              </div>
              <span className="vd-writer__tgroup-caption">Thụt lề</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Đầu trang và chân trang"
                  active={pagePanelOpen}
                  onClick={() => setPagePanelOpen((value) => !value)}
                >
                  <PanelTop size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Hiện/ẩn số trang"
                  active={pageSetup.showPageNumbers}
                  onClick={() =>
                    updatePageSetup({
                      ...pageSetup,
                      showPageNumbers: !pageSetup.showPageNumbers,
                    })
                  }
                >
                  <Hash size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Đầu & Chân trang</span>
            </div>
          </div>

          {/* TAB 4: KIỂM DUYỆT */}
          <div className="vd-writer__tab-panel" hidden={ribbonTab !== "review"}>
            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Theo dõi thay đổi"
                  active={trackChangesOn}
                  onClick={toggleTrackChangesMode}
                >
                  <GitCompareArrows size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Chấp nhận thay đổi tại con trỏ"
                  disabled={changeList.length === 0 || !currentChange}
                  onClick={() => resolveCurrentChange(true)}
                >
                  <Check size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Bác bỏ thay đổi tại con trỏ"
                  disabled={changeList.length === 0 || !currentChange}
                  onClick={() => resolveCurrentChange(false)}
                >
                  <X size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Chấp nhận mọi thay đổi"
                  disabled={changeList.length === 0}
                  onClick={acceptAll}
                >
                  <CheckCheck size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Bác bỏ mọi thay đổi"
                  disabled={changeList.length === 0}
                  onClick={rejectAll}
                >
                  <Undo2 size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Theo dõi thay đổi</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Bình luận"
                  active={commentsOpen}
                  onClick={startComment}
                >
                  <MessageSquarePlus size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Bảng bình luận"
                  active={commentsOpen}
                  onClick={() => setCommentsOpen((value) => !value)}
                >
                  <MessageSquare size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Bình luận</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Thống kê tài liệu"
                  active={statsOpen}
                  onClick={() => setStatsOpen((value) => !value)}
                >
                  <ChartColumn size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Thống kê</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Chuẩn hóa toàn bộ văn bản sang NFC"
                  onClick={run(transformVietnamese("nfc"))}
                >
                  <span>NFC</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Bỏ thanh điệu tiếng Việt"
                  onClick={run(transformVietnamese("strip-tones"))}
                >
                  <span>Bỏ thanh</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Bỏ toàn bộ dấu tiếng Việt"
                  onClick={run(transformVietnamese("remove-diacritics"))}
                >
                  <span>Bỏ dấu</span>
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Tiếng Việt</span>
            </div>
          </div>

          {/* TAB 5: HIỂN THỊ */}
          <div className="vd-writer__tab-panel" hidden={ribbonTab !== "view"}>
            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label={pagelessMode ? "Chuyển về Trang in chuẩn A4" : "Chuyển sang Chế độ Không ngắt trang"}
                  active={pagelessMode}
                  onClick={() => setPagelessMode((prev) => !prev)}
                >
                  <SeparatorHorizontal size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label={focusMode ? "Thoát chế độ tập trung" : "Chế độ tập trung (Focus Mode)"}
                  active={focusMode}
                  onClick={() => setFocusMode((f) => !f)}
                >
                  <SquareDashed size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label={readOnly ? "Mở khóa chỉnh sửa" : "Khóa chỉnh sửa (Chế độ đọc)"}
                  active={readOnly}
                  onClick={() => setReadOnly((r) => !r)}
                >
                  <FileText size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Chế độ xem</span>
            </div>

            <div className="vd-writer__tgroup">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Bảng điều hướng cấu trúc tài liệu"
                  active={outlineOpen}
                  onClick={() => setOutlineOpen((value) => !value)}
                >
                  <ListTree size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Hiện/ẩn thước kẻ căn lề tài liệu"
                  active={showRuler && !pagelessMode}
                  disabled={pagelessMode}
                  onClick={() => setShowRuler((prev) => !prev)}
                >
                  <PanelTop size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Hiện/ẩn dấu đoạn ¶"
                  active={showMarks}
                  onClick={() => {
                    setShowMarks((value) => !value);
                    viewRef.current?.focus();
                  }}
                >
                  <Pilcrow size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">Hiển thị</span>
            </div>

            <div className="vd-writer__tgroup vd-writer__tgroup--end">
              <div className="vd-writer__tgroup-line">
                <ToolbarButton label="In (Ctrl+P)" onClick={printNow}>
                  <Printer size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Xuất PDF (tệp, không qua máy in)"
                  onClick={() => void exportPdfNow()}
                  disabled={exportBusy}
                >
                  <FileDown size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <div className="vd-writer__tgroup-line">
                <ToolbarButton
                  label="Xuất Word (.docx)"
                  onClick={() => void exportWordNow()}
                  disabled={exportBusy}
                >
                  <FileType size={17} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Xuất văn bản (.txt)"
                  onClick={() => void exportTextNow()}
                  disabled={exportBusy}
                >
                  <FileText size={17} aria-hidden="true" />
                </ToolbarButton>
              </div>
              <span className="vd-writer__tgroup-caption">In và xuất</span>
            </div>
          </div>
        </div>

        {tableActive ? (
          <div
            className="vd-writer__toolbar-row vd-writer__toolbar-row--context"
            role="toolbar"
            aria-label="Công cụ bảng"
          >
            <span className="vd-writer__toolbar-label">Bảng</span>
            <ToolbarButton
              label="Thêm hàng trên"
              onClick={run(tableCommands.addRowBefore)}
            >
              Hàng trên
            </ToolbarButton>
            <ToolbarButton
              label="Thêm hàng dưới"
              onClick={run(tableCommands.addRowAfter)}
            >
              Hàng dưới
            </ToolbarButton>
            <ToolbarButton
              label="Thêm cột bên trái"
              onClick={run(tableCommands.addColumnBefore)}
            >
              Cột trái
            </ToolbarButton>
            <ToolbarButton
              label="Thêm cột bên phải"
              onClick={run(tableCommands.addColumnAfter)}
            >
              Cột phải
            </ToolbarButton>
            <ToolbarButton
              label="Gộp ô đang chọn"
              onClick={run(tableCommands.mergeCells)}
            >
              Gộp ô
            </ToolbarButton>
            <ToolbarButton
              label="Tách ô đang chọn"
              onClick={run(tableCommands.splitCell)}
            >
              Tách ô
            </ToolbarButton>
            <ToolbarButton
              label="Bật/tắt hàng tiêu đề"
              onClick={run(tableCommands.toggleHeaderRow)}
            >
              Hàng tiêu đề
            </ToolbarButton>
            <ToolbarButton
              label="Xóa hàng hiện tại"
              onClick={run(tableCommands.deleteRow)}
            >
              Xóa hàng
            </ToolbarButton>
            <ToolbarButton
              label="Xóa cột hiện tại"
              onClick={run(tableCommands.deleteColumn)}
            >
              Xóa cột
            </ToolbarButton>
            <ToolbarButton
              label="Xóa toàn bộ bảng"
              onClick={run(tableCommands.deleteTable)}
            >
              Xóa bảng
            </ToolbarButton>
          </div>
        ) : null}
      </div>

      {statsOpen ? (
        <div
          className="vd-writer__panel vd-writer__stats"
          role="dialog"
          aria-label="Bảng thống kê tài liệu"
        >
          <ChartColumn size={17} aria-hidden="true" />
          <span className="vd-writer__stats-heading">Thống kê tài liệu</span>
          <dl className="vd-writer__stats-grid">
            <div>
              <dt>Số từ</dt>
              <dd>{stats.words.toLocaleString("vi-VN")}</dd>
            </div>
            <div>
              <dt>Ký tự (có dấu cách)</dt>
              <dd>{stats.characters.toLocaleString("vi-VN")}</dd>
            </div>
            <div>
              <dt>Ký tự (không dấu cách)</dt>
              <dd>{stats.charactersNoSpaces.toLocaleString("vi-VN")}</dd>
            </div>
            <div>
              <dt>Đoạn văn</dt>
              <dd>{stats.paragraphs.toLocaleString("vi-VN")}</dd>
            </div>
            <div>
              <dt>Số trang A4</dt>
              <dd>{pagination.total}</dd>
            </div>
            <div>
              <dt>Thời gian đọc</dt>
              <dd>{readingMinutes} phút</dd>
            </div>
          </dl>
          <button
            type="button"
            className="vd-writer__panel-action"
            onClick={() => setStatsOpen(false)}
          >
            Đóng
          </button>
        </div>
      ) : null}

      {insertPanel === "date" ? (
        <div
          className="vd-writer__panel"
          role="dialog"
          aria-label="Bảng chọn ngày tháng"
        >
          <CalendarDays size={17} aria-hidden="true" />
          <span className="vd-writer__panel-hint">Chèn ngày hiện tại</span>
          {DATE_FORMAT_OPTIONS.map((option) => {
            const value = option.render(new Date());
            return (
              <button
                key={option.label}
                type="button"
                className="vd-writer__panel-action"
                title={option.label}
                aria-label={`${option.label}: ${value}`}
                onClick={() => {
                  insertTextAtCursor(value);
                  setInsertPanel(null);
                }}
              >
                {value}
              </button>
            );
          })}
          <button
            type="button"
            className="vd-writer__panel-action"
            onClick={() => setInsertPanel(null)}
          >
            Đóng
          </button>
        </div>
      ) : null}

      {insertPanel === "symbol" ? (
        <div
          className="vd-writer__panel"
          role="dialog"
          aria-label="Bảng chọn ký hiệu"
        >
          <Sigma size={17} aria-hidden="true" />
          <span className="vd-writer__panel-hint">Ký hiệu thường dùng</span>
          <div className="vd-writer__symbols">
            {WRITER_SYMBOLS.map((symbol) => (
              <button
                key={symbol}
                type="button"
                title={`Chèn ${symbol}`}
                aria-label={`Chèn ký hiệu ${symbol}`}
                onClick={() => insertTextAtCursor(symbol)}
              >
                {symbol}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="vd-writer__panel-action"
            onClick={() => setInsertPanel(null)}
          >
            Đóng
          </button>
        </div>
      ) : null}

      {insertPanel === "form" ? (
        <div
          className="vd-writer__panel"
          role="dialog"
          aria-label="Bảng chèn trường biểu mẫu hành chính"
        >
          <SquareDashed size={17} aria-hidden="true" />
          <span className="vd-writer__panel-hint">Trường biểu mẫu hành chính (OFORM)</span>
          {ADMINISTRATIVE_FORM_FIELDS.map((field) => (
            <button
              key={field.label}
              type="button"
              className="vd-writer__panel-action"
              title={field.label}
              onClick={() => {
                insertTextAtCursor(field.value);
                setInsertPanel(null);
              }}
            >
              {field.label}
            </button>
          ))}
          <button
            type="button"
            className="vd-writer__panel-action"
            onClick={() => setInsertPanel(null)}
          >
            Đóng
          </button>
        </div>
      ) : null}

      {tablePickerOpen ? (
        <div
          className="vd-writer__panel"
          role="dialog"
          aria-label="Chèn bảng"
        >
          <div className="vd-writer__tablegrid">
            {Array.from({ length: TABLE_GRID_ROWS }, (_, row) =>
              Array.from({ length: TABLE_GRID_COLS }, (_, col) => {
                const size = { rows: row + 1, cols: col + 1 };
                const active = Boolean(
                  tableSize &&
                    row < tableSize.rows &&
                    col < tableSize.cols,
                );
                return (
                  <button
                    key={`${row}-${col}`}
                    type="button"
                    className={active ? "is-active" : undefined}
                    aria-label={`Bảng ${size.rows} hàng × ${size.cols} cột`}
                    onMouseEnter={() => setTableSize(size)}
                    onFocus={() => setTableSize(size)}
                    onClick={() => {
                      run(insertTable(size.rows, size.cols))();
                      setTablePickerOpen(false);
                      setTableSize(null);
                    }}
                  />
                );
              }),
            )}
          </div>
          <span className="vd-writer__panel-hint">
            {tableSize
              ? `${tableSize.rows} hàng × ${tableSize.cols} cột`
              : "Chọn số hàng và cột"}
          </span>
          <button
            type="button"
            className="vd-writer__panel-action"
            onClick={() => {
              setTablePickerOpen(false);
              setTableSize(null);
            }}
          >
            Đóng
          </button>
        </div>
      ) : null}

      {templatePickerOpen ? (
        <div
          className="vd-writer__panel vd-writer__panel--templates"
          role="dialog"
          aria-label="Kho biểu mẫu chuẩn Nghị định 30"
        >
          <div className="vd-writer__panel-header">
            <strong>Kho Biểu Mẫu Chuẩn Nghị Định 30/2020/NĐ-CP</strong>
            <button
              type="button"
              className="vd-writer__panel-close"
              aria-label="Đóng"
              onClick={() => setTemplatePickerOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className="vd-writer__template-list">
            {ADMINISTRATIVE_TEMPLATES.map((tmpl) => (
              <div
                key={tmpl.id}
                className="vd-writer__template-card"
                onClick={() => applyTemplate(tmpl.id)}
              >
                <div className="vd-writer__template-title">{tmpl.title}</div>
                <div className="vd-writer__template-desc">{tmpl.description}</div>
                <span className="vd-writer__template-tag">{tmpl.category}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {linkOpen ? (
        <div
          className="vd-writer__panel"
          role="dialog"
          aria-label="Chèn liên kết"
        >
          <Link2 size={17} aria-hidden="true" />
          <input
            ref={linkInputRef}
            className="vd-writer__search-input"
            value={linkUrl}
            placeholder="https://example.com"
            aria-label="Địa chỉ liên kết"
            onChange={(event) => {
              setLinkUrl(event.target.value);
              setLinkError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
            }}
          />
          <button
            type="button"
            className="vd-writer__panel-action"
            onClick={applyLink}
          >
            Chèn
          </button>
          <button
            type="button"
            className="vd-writer__panel-action"
            onClick={() => {
              run(removeMarkType(writerSchema.marks.link))();
              setLinkOpen(false);
            }}
          >
            Bỏ liên kết
          </button>
          <button
            type="button"
            className="vd-writer__panel-action"
            onClick={() => setLinkOpen(false)}
          >
            Đóng
          </button>
          {linkError ? (
            <span className="vd-writer__panel-error" role="alert">
              {linkError}
            </span>
          ) : null}
        </div>
      ) : null}

      <input
        ref={imageInputRef}
        type="file"
        accept={IMAGE_EXTENSIONS.map((extension) => `.${extension}`).join(",")}
        className="vd-writer__image-input"
        aria-label="Chọn tệp ảnh"
        onChange={(event) => {
          void handleImageFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {clipboardNotice ? (
        <div className="vd-writer__panel">
          <span role="status">{clipboardNotice}</span>
        </div>
      ) : null}

      {clipboardError ? (
        <div className="vd-writer__panel" role="alert">
          <span className="vd-writer__panel-error">{clipboardError}</span>
          <button
            type="button"
            className="vd-writer__panel-action"
            onClick={() => setClipboardError(null)}
          >
            Đóng
          </button>
        </div>
      ) : null}

      {imageError ? (
        <div className="vd-writer__panel" role="alert">
          <span className="vd-writer__panel-error">{imageError}</span>
          <button
            type="button"
            className="vd-writer__panel-action"
            onClick={() => setImageError(null)}
          >
            Đóng
          </button>
        </div>
      ) : null}

      {exportError ? (
        <div className="vd-writer__panel" role="alert">
          <span className="vd-writer__panel-error">{exportError}</span>
          <button
            type="button"
            className="vd-writer__panel-action"
            onClick={() => setExportError(null)}
          >
            Đóng
          </button>
        </div>
      ) : null}

      {exportNotice ? (
        <div className="vd-writer__panel">
          <span role="status">{exportNotice}</span>
        </div>
      ) : null}

      {pagePanelOpen ? (
        <div
          className="vd-writer__panel"
          role="dialog"
          aria-label="Đầu trang và chân trang"
        >
          <PanelTop size={17} aria-hidden="true" />
          <label htmlFor="vd-writer-header">Đầu trang</label>
          <input
            id="vd-writer-header"
            className="vd-writer__search-input"
            value={pageSetup.header}
            placeholder="Ví dụ: BÁO CÁO THƯỜNG NIÊN"
            aria-label="Nội dung đầu trang"
            onChange={(event) =>
              updatePageSetup({ ...pageSetup, header: event.target.value })
            }
          />
          <label htmlFor="vd-writer-footer">Chân trang</label>
          <input
            id="vd-writer-footer"
            className="vd-writer__search-input"
            value={pageSetup.footer}
            placeholder="Ví dụ: Ngày cấp phép"
            aria-label="Nội dung chân trang"
            onChange={(event) =>
              updatePageSetup({ ...pageSetup, footer: event.target.value })
            }
          />
          <label className="vd-writer__search-case">
            <input
              type="checkbox"
              checked={pageSetup.showPageNumbers}
              onChange={(event) =>
                updatePageSetup({
                  ...pageSetup,
                  showPageNumbers: event.target.checked,
                })
              }
            />
            Hiện số trang
          </label>
          <button
            type="button"
            className="vd-writer__panel-action"
            onClick={() => setPagePanelOpen(false)}
          >
            Đóng
          </button>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="vd-writer__search" role="search" aria-label="Tìm và thay thế">
          <Search size={17} aria-hidden="true" />
          <input
            ref={searchInputRef}
            className="vd-writer__search-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveMatch(0);
            }}
            placeholder="Tìm trong văn bản"
            aria-label="Từ cần tìm"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                findNext(event.shiftKey ? -1 : 1);
              }
            }}
          />
          <span className="vd-writer__search-count" aria-live="polite">
            {query
              ? `${matches.length === 0 ? 0 : activeIndex + 1}/${matches.length}`
              : ""}
          </span>
          <button
            type="button"
            title="Kết quả trước (Shift+Enter)"
            aria-label="Kết quả trước"
            onClick={() => findNext(-1)}
            disabled={matches.length === 0}
          >
            <ChevronUp size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Kết quả tiếp theo (Enter)"
            aria-label="Kết quả tiếp theo"
            onClick={() => findNext(1)}
            disabled={matches.length === 0}
          >
            <ChevronDown size={17} aria-hidden="true" />
          </button>
          <label className="vd-writer__search-case">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event) => {
                setCaseSensitive(event.target.checked);
                setActiveMatch(0);
              }}
            />
            Phân biệt hoa/thường
          </label>

          {replaceMode ? (
            <>
              <input
                className="vd-writer__search-input"
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                placeholder="Thay bằng"
                aria-label="Nội dung thay thế"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    replaceCurrent();
                  }
                }}
              />
              <button
                type="button"
                className="vd-writer__search-action"
                onClick={replaceCurrent}
                disabled={matches.length === 0}
              >
                Thay thế
              </button>
              <button
                type="button"
                className="vd-writer__search-action"
                onClick={replaceAll}
                disabled={matches.length === 0}
              >
                Thay tất cả
              </button>
            </>
          ) : null}

          <button
            type="button"
            title={replaceMode ? "Ẩn thay thế" : "Hiện thay thế"}
            aria-label="Bật/tắt thay thế"
            onClick={() => setReplaceMode((value) => !value)}
          >
            <Replace size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Đóng (Esc)"
            aria-label="Đóng tìm kiếm"
            onClick={closeSearch}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className={`vd-writer__body${pagelessMode ? " is-pageless" : ""}`}>
        <div className="vd-writer__main">
          {showRuler && !pagelessMode && (
            <div className="vd-writer__ruler" aria-label="Thước kẻ căn lề tài liệu">
              <div
                ref={rulerTrackRef}
                className={`vd-writer__ruler-track${rulerDrag ? " is-dragging" : ""}`}
              >
                <div
                  className="vd-writer__ruler-shade"
                  style={{ left: 0, width: `${leftMarginPct}%` }}
                />
                <div
                  className="vd-writer__ruler-shade vd-writer__ruler-shade--right"
                  style={{ width: `${rightMarginPct}%` }}
                />
                <div className="vd-writer__ruler-scale" aria-hidden="true">
                  {Array.from({ length: 22 }).map((_, cm) => (
                    <span
                      key={cm}
                      className={`vd-writer__ruler-cm${cm % 5 === 0 ? " is-major" : ""}`}
                      style={{ left: `${(cm * 10 * 100) / A4_WIDTH_MM}%` }}
                    >
                      {cm}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  className="vd-writer__ruler-margin-handle vd-writer__ruler-margin-handle--left"
                  style={{ left: `${leftMarginPct}%` }}
                  title={`Lề trái: ${activeMargins.left} mm — kéo hoặc dùng ←/→`}
                  aria-label="Lề trái"
                  role="slider"
                  aria-orientation="horizontal"
                  aria-valuemin={MIN_MARGIN_MM}
                  aria-valuemax={MAX_SIDE_MARGIN_MM}
                  aria-valuenow={activeMargins.left}
                  aria-valuetext={`${activeMargins.left} mm`}
                  onPointerDown={beginRulerDrag("margin-left")}
                  onPointerMove={moveRulerDrag}
                  onPointerUp={endRulerDrag}
                  onPointerCancel={endRulerDrag}
                  onKeyDown={(event) => nudgeRuler("margin-left", event)}
                />
                <button
                  type="button"
                  className="vd-writer__ruler-margin-handle vd-writer__ruler-margin-handle--right"
                  style={{ right: `${rightMarginPct}%` }}
                  title={`Lề phải: ${activeMargins.right} mm — kéo hoặc dùng ←/→`}
                  aria-label="Lề phải"
                  role="slider"
                  aria-orientation="horizontal"
                  aria-valuemin={MIN_MARGIN_MM}
                  aria-valuemax={MAX_SIDE_MARGIN_MM}
                  aria-valuenow={activeMargins.right}
                  aria-valuetext={`${activeMargins.right} mm`}
                  onPointerDown={beginRulerDrag("margin-right")}
                  onPointerMove={moveRulerDrag}
                  onPointerUp={endRulerDrag}
                  onPointerCancel={endRulerDrag}
                  onKeyDown={(event) => nudgeRuler("margin-right", event)}
                />

                <button
                  type="button"
                  className="vd-writer__ruler-indent vd-writer__ruler-indent--first"
                  style={{ left: `${firstLinePct}%` }}
                  title={`Thụt dòng đầu: ${(activeFirstLineIndent * INDENT_STEP_EM).toFixed(1)} em — kéo hoặc dùng ←/→`}
                  aria-label="Thụt lề dòng đầu"
                  role="slider"
                  aria-orientation="horizontal"
                  aria-valuemin={0}
                  aria-valuemax={MAX_INDENT}
                  aria-valuenow={activeFirstLineIndent}
                  aria-valuetext={`${(activeFirstLineIndent * INDENT_STEP_EM).toFixed(1)} em`}
                  onPointerDown={beginRulerDrag("first-line")}
                  onPointerMove={moveRulerDrag}
                  onPointerUp={endRulerDrag}
                  onPointerCancel={endRulerDrag}
                  onKeyDown={(event) => nudgeRuler("first-line", event)}
                />
                <button
                  type="button"
                  className="vd-writer__ruler-indent vd-writer__ruler-indent--left"
                  style={{ left: `${indentPct}%` }}
                  title={`Thụt lề trái: ${(activeIndent * INDENT_STEP_EM).toFixed(1)} em — kéo hoặc dùng ←/→`}
                  aria-label="Thụt lề trái"
                  role="slider"
                  aria-orientation="horizontal"
                  aria-valuemin={0}
                  aria-valuemax={MAX_INDENT}
                  aria-valuenow={activeIndent}
                  aria-valuetext={`${(activeIndent * INDENT_STEP_EM).toFixed(1)} em`}
                  onPointerDown={beginRulerDrag("indent")}
                  onPointerMove={moveRulerDrag}
                  onPointerUp={endRulerDrag}
                  onPointerCancel={endRulerDrag}
                  onKeyDown={(event) => nudgeRuler("indent", event)}
                />
              </div>
            </div>
          )}
          <div
            className={`vd-writer__viewport${pagelessMode ? " is-pageless" : ""}`}
            style={{ zoom: zoom !== 100 ? `${zoom}%` : undefined }}
          >
            <div
              className={`vd-writer__page${pagelessMode ? " is-pageless" : ""}`}
              style={pageStyle}
            >
              <div className="vd-writer__page-header" aria-label="Đầu trang">
                {pageSetup.header}
              </div>
              <div className="vd-writer__page-body">
                <div ref={hostRef} className="vd-writer__surface" spellCheck lang="vi" />
                {empty ? (
                  <div className="vd-writer__placeholder" aria-hidden="true">
                    Bắt đầu nhập văn bản…
                  </div>
                ) : null}
              </div>
              <div className="vd-writer__page-footer" aria-label="Chân trang">
                <span className="vd-writer__page-footer-text">
                  {pageSetup.footer}
                </span>
                {pageSetup.showPageNumbers ? (
                  <span className="vd-writer__page-number">
                    Trang {pagination.page} / {pagination.total}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {outlineOpen ? (
          <nav
            className="vd-writer__outline"
            aria-label="Điều hướng cấu trúc tài liệu"
          >
            <div className="vd-writer__outline-head">
              <span>Cấu trúc tài liệu</span>
              <button
                type="button"
                aria-label="Đóng cấu trúc tài liệu"
                title="Đóng"
                onClick={() => setOutlineOpen(false)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            {outline.length === 0 ? (
              <p className="vd-writer__outline-empty">
                Chưa có tiêu đề nào. Dùng hộp “Kiểu đoạn” để tạo tiêu đề.
              </p>
            ) : (
              <ul className="vd-writer__outline-list">
                {outline.map((entry, index) => (
                  <li key={`${entry.pos}-${index}`}>
                    <button
                      type="button"
                      className={
                        index === activeOutline ? "is-active" : undefined
                      }
                      style={{ paddingLeft: 8 + (entry.level - 1) * 14 }}
                      title={`Tiêu đề cấp ${entry.level}`}
                      onClick={() => jumpToHeading(entry.pos)}
                    >
                      {entry.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        ) : null}

        {commentsOpen ? (
          <aside
            className="vd-writer__comments"
            aria-label="Bình luận"
          >
            <div className="vd-writer__comments-head">
              <span>Bình luận ({comments.length})</span>
              <button
                type="button"
                aria-label="Đóng bảng bình luận"
                title="Đóng"
                onClick={() => setCommentsOpen(false)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>

            {commentDraft !== null ? (
              <div className="vd-writer__comment-composer">
                <textarea
                  className="vd-writer__comment-input"
                  value={commentDraft}
                  maxLength={MAX_COMMENT_TEXT}
                  rows={3}
                  placeholder="Viết bình luận…"
                  aria-label="Nội dung bình luận"
                  onChange={(event) => {
                    setCommentDraft(event.target.value);
                    setCommentError(null);
                  }}
                />
                {commentError ? (
                  <span
                    className="vd-writer__panel-error"
                    role="alert"
                  >
                    {commentError}
                  </span>
                ) : null}
                <div className="vd-writer__comment-actions">
                  <button
                    type="button"
                    className="vd-writer__panel-action"
                    onClick={submitComment}
                  >
                    Gửi
                  </button>
                  <button
                    type="button"
                    className="vd-writer__panel-action"
                    onClick={() => {
                      setCommentDraft(null);
                      setCommentAnchor(null);
                      setCommentError(null);
                    }}
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : null}

            {comments.length === 0 && commentDraft === null ? (
              <p className="vd-writer__outline-empty">
                Chưa có bình luận nào. Bôi đen đoạn văn bản rồi bấm “Bình luận”.
              </p>
            ) : null}

            <ul className="vd-writer__comment-list">
              {comments.map((comment) => (
                <li key={comment.id} className="vd-writer__comment">
                  <button
                    type="button"
                    className="vd-writer__comment-quote"
                    title="Đi tới đoạn được bình luận"
                    onClick={() => focusComment(comment.id)}
                  >
                    {comment.quote || "(không có trích đoạn)"}
                  </button>
                  <div className="vd-writer__comment-body">
                    <strong>{comment.author}</strong>
                    <span className="vd-writer__comment-time">
                      {formatCommentTime(comment.createdAt)}
                    </span>
                  </div>
                  <p className="vd-writer__comment-text">{comment.text}</p>
                  <button
                    type="button"
                    className="vd-writer__comment-delete"
                    aria-label={`Xoá bình luận của ${comment.author}`}
                    title="Xoá bình luận"
                    onClick={() => removeComment(comment.id)}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>

      <div className="vd-writer__status">
        <div className="vd-writer__status-left">
          {saveStatus ? (
            <span
              className={`vd-writer__status-save${propDirty ? " is-dirty" : " is-clean"}`}
              title={propDirty ? "Có thay đổi chưa lưu" : "Tài liệu đã được lưu"}
            >
              <span className="vd-status-dot" />
              {saveStatus}
            </span>
          ) : null}
          {documentPath ? (
            <span className="vd-writer__status-path" title={documentPath}>
              {fileNameFromPath(documentPath)}
            </span>
          ) : null}
          <span>
            {stats.words} từ · {stats.characters} ký tự · {stats.paragraphs} đoạn
          </span>
          <span
            className="vd-writer__status-readtime"
            title="Thời gian đọc ước tính (tốc độ đọc trung bình 220 từ/phút)"
          >
            ~{stats.words > 0 ? Math.max(1, Math.ceil(stats.words / 220)) : 0} phút đọc
          </span>
          {changeList.length > 0 ? (
            <span>
              {changeList.length} thay đổi đang chờ duyệt
            </span>
          ) : null}
        </div>
        <div className="vd-writer__status-right">
          <button
            type="button"
            className={`vd-writer__status-focus${focusMode ? " is-active" : ""}`}
            onClick={() => setFocusMode((f) => !f)}
            title="Chế độ tập trung soạn thảo (Focus Mode)"
          >
            {focusMode ? "✕ Thoát tập trung" : "Chế độ tập trung"}
          </button>
          <span>
            A4 · Lề NĐ30 · Trang {pagination.page}/{pagination.total}
          </span>
          <div className="vd-writer__zoom-control" title="Thu phóng trang soạn thảo">
            <button
              type="button"
              className="vd-writer__zoom-btn"
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              title="Thu nhỏ (-10%)"
              aria-label="Thu nhỏ"
            >
              -
            </button>
            <input
              type="range"
              min={50}
              max={200}
              step={5}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="vd-writer__zoom-slider"
              title={`Thu phóng: ${zoom}%`}
              aria-label="Thanh trượt thu phóng"
            />
            <span className="vd-writer__zoom-val">{zoom}%</span>
            <button
              type="button"
              className="vd-writer__zoom-btn"
              onClick={() => setZoom((z) => Math.min(200, z + 10))}
              title="Phóng to (+10%)"
              aria-label="Phóng to"
            >
              +
            </button>
            {zoom !== 100 && (
              <button
                type="button"
                className="vd-writer__zoom-reset"
                onClick={() => setZoom(100)}
                title="Về 100%"
              >
                100%
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
