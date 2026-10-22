import { countWords } from "@vietdesk/vietnamese";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  MessageSquarePlus,
  Minus,
  PanelTop,
  Printer,
  Redo2,
  RemoveFormatting,
  Replace,
  Search,
  SeparatorHorizontal,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import type { Node as PMNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { tableEditing } from "prosemirror-tables";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  changeIndent,
  clearFormatting,
  inTable,
  insertHorizontalRule,
  insertPageBreak,
  insertTable,
  listActive,
  markActive,
  markValue,
  removeMarkType,
  setAlign,
  setBlock,
  setLineHeight,
  setLink,
  setMarkAttr,
  tableCommands,
  tableKeymap,
  toggleList,
  toggleTaskList,
  writerKeymap,
} from "./commands";
import { searchHighlightKey, searchHighlightPlugin } from "./highlight";
import {
  DEFAULT_CHANGE_AUTHOR,
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
  computePageBreaks,
  pageContentHeightPx,
  pageOfBlock,
  readPageSetup,
} from "./page";
import type { PageSetup } from "./page";
import { printDocument } from "./print";
import { TaskItemView } from "./task-view";

export interface WriterEditorProps {
  /** Nội dung ban đầu (văn bản thuần), dùng khi không có `initialContent`. */
  initialText?: string;
  /** ProseMirror JSON đã lưu trong tệp `.vdx`. */
  initialContent?: unknown;
  /** Gọi mỗi khi nội dung thay đổi — kèm JSON để lưu xuống đĩa. */
  onChange?: (payload: { text: string; doc: unknown }) => void;
  /** Tên tài liệu — dùng làm tên tệp khi xuất PDF. */
  title?: string;
  /** Tăng lên để yêu cầu in (ribbon “Xuất bản → PDF”). */
  printSignal?: number;
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
  printSignal,
}: WriterEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
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
  }));
  const [empty, setEmpty] = useState(() => initialPlain.trim() === "");

  const [searchOpen, setSearchOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [activeMatch, setActiveMatch] = useState(0);

  const [tablePickerOpen, setTablePickerOpen] = useState(false);
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
      pageContentHeightPx(),
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
      nodeViews: {
        task_item: (node, view, getPos) => new TaskItemView(node, view, getPos),
      },
      dispatchTransaction(transaction) {
        const next = view.state.apply(transaction);
        view.updateState(next);
        if (transaction.docChanged) {
          const text = next.doc.textBetween(0, next.doc.content.size, "\n", " ");
          setStats({ words: countWords(text), characters: text.length });
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
    // Chỉ khởi tạo một lần: nội dung sau đó do người dùng điều khiển.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state = viewRef.current?.state;
  const doc = state?.doc;
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
      title,
    });
  }, [pageSetup, title]);

  /** Yêu cầu in từ bên ngoài (ribbon “Xuất bản → PDF”). */
  const printSignalRef = useRef(printSignal);
  useEffect(() => {
    if (printSignal === undefined || printSignalRef.current === printSignal) {
      return;
    }
    printSignalRef.current = printSignal;
    printNow();
  }, [printSignal, printNow]);

  const run = (command: Command) => () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    command(view.state, view.dispatch, view);
    view.focus();
    forceRender((value) => value + 1);
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
    if (event.key === "Escape" && searchOpen) {
      event.preventDefault();
      closeSearch();
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

  return (
    <div className="vd-writer" onKeyDown={handleRootKeyDown}>
      <div className="vd-writer__toolbar" role="toolbar" aria-label="Định dạng">
        <div className="vd-writer__toolbar-row">
        <ToolbarButton
          label="Hoàn tác (Ctrl+Z)"
          onClick={run(undo)}
          disabled={!canUndo}
        >
          <Undo2 size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Làm lại (Ctrl+Y)"
          onClick={run(redo)}
          disabled={!canRedo}
        >
          <Redo2 size={15} aria-hidden="true" />
        </ToolbarButton>

        <span className="vd-writer__divider" />

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
          <RemoveFormatting size={15} aria-hidden="true" />
        </ToolbarButton>

        <span className="vd-writer__divider" />

        <ToolbarButton
          label="Đậm (Ctrl+B)"
          active={strongActive}
          onClick={run(toggleMark(writerSchema.marks.strong))}
        >
          <Bold size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Nghiêng (Ctrl+I)"
          active={emActive}
          onClick={run(toggleMark(writerSchema.marks.em))}
        >
          <Italic size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Gạch chân (Ctrl+U)"
          active={underlineActive}
          onClick={run(toggleMark(writerSchema.marks.underline))}
        >
          <Underline size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Gạch ngang (Ctrl+Shift+X)"
          active={strikeActive}
          onClick={run(toggleMark(writerSchema.marks.strike))}
        >
          <Strikethrough size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Chỉ số trên (Ctrl+Shift+.)"
          active={superscriptActive}
          onClick={run(toggleMark(writerSchema.marks.superscript))}
        >
          <Superscript size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Chỉ số dưới (Ctrl+Shift+,)"
          active={subscriptActive}
          onClick={run(toggleMark(writerSchema.marks.subscript))}
        >
          <Subscript size={15} aria-hidden="true" />
        </ToolbarButton>

        <span className="vd-writer__divider" />

        <ToolbarButton
          label="Thụt lề vào (Ctrl+])"
          disabled={currentIndent >= 6}
          onClick={run(changeIndent(1))}
        >
          <IndentIncrease size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Lùi lề ra (Ctrl+[)"
          disabled={currentIndent <= 0}
          onClick={run(changeIndent(-1))}
        >
          <IndentDecrease size={15} aria-hidden="true" />
        </ToolbarButton>

        <span className="vd-writer__divider" />

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

        <div className="vd-writer__toolbar-row">
        <span className="vd-writer__divider" />

        <ToolbarButton
          label="Danh sách gạch đầu dòng (Ctrl+Shift+8)"
          active={bulletActive}
          onClick={run(toggleList(writerSchema.nodes.bullet_list))}
        >
          <List size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Danh sách đánh số (Ctrl+Shift+7)"
          active={orderedActive}
          onClick={run(toggleList(writerSchema.nodes.ordered_list))}
        >
          <ListOrdered size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Danh sách việc cần làm (Ctrl+Shift+9)"
          active={taskActive}
          onClick={run(toggleTaskList())}
        >
          <ListChecks size={15} aria-hidden="true" />
        </ToolbarButton>

        <span className="vd-writer__divider" />

        <ToolbarButton
          label="Canh trái (Ctrl+Shift+L)"
          active={currentAlign === "left"}
          onClick={run(setAlign("left"))}
        >
          <AlignLeft size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Canh giữa (Ctrl+Shift+E)"
          active={currentAlign === "center"}
          onClick={run(setAlign("center"))}
        >
          <AlignCenter size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Canh phải (Ctrl+Shift+R)"
          active={currentAlign === "right"}
          onClick={run(setAlign("right"))}
        >
          <AlignRight size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Canh đều (Ctrl+Shift+J)"
          active={currentAlign === "justify"}
          onClick={run(setAlign("justify"))}
        >
          <AlignJustify size={15} aria-hidden="true" />
        </ToolbarButton>

        <span className="vd-writer__divider" />

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

        <span className="vd-writer__divider" />

        <ToolbarButton
          label="Chèn bảng"
          onClick={() => {
            setTableSize(null);
            setTablePickerOpen((open) => !open);
          }}
        >
          <Table size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Chèn liên kết" onClick={openLinkBar}>
          <Link2 size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Ngắt trang" onClick={run(insertPageBreak())}>
          <SeparatorHorizontal size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Chèn đường kẻ ngang"
          onClick={run(insertHorizontalRule())}
        >
          <Minus size={15} aria-hidden="true" />
        </ToolbarButton>

        <span className="vd-writer__divider" />

        <ToolbarButton
          label="Tìm trong văn bản (Ctrl+F)"
          onClick={() => {
            setReplaceMode(false);
            setSearchOpen(true);
          }}
        >
          <Search size={15} aria-hidden="true" />
        </ToolbarButton>

        <ToolbarButton
          label="Bảng điều hướng cấu trúc tài liệu"
          active={outlineOpen}
          onClick={() => setOutlineOpen((value) => !value)}
        >
          <ListTree size={15} aria-hidden="true" />
        </ToolbarButton>

        <ToolbarButton
          label="Đầu trang và chân trang"
          active={pagePanelOpen}
          onClick={() => setPagePanelOpen((value) => !value)}
        >
          <PanelTop size={15} aria-hidden="true" />
        </ToolbarButton>

        <ToolbarButton
          label="Theo dõi thay đổi"
          active={trackChangesOn}
          onClick={toggleTrackChangesMode}
        >
          <GitCompareArrows size={15} aria-hidden="true" />
        </ToolbarButton>

        {changeList.length > 0 ? (
          <>
            {currentChange ? (
              <>
                <ToolbarButton
                  label="Chấp nhận thay đổi tại con trỏ"
                  onClick={() => resolveCurrentChange(true)}
                >
                  <Check size={15} aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label="Bác bỏ thay đổi tại con trỏ"
                  onClick={() => resolveCurrentChange(false)}
                >
                  <X size={15} aria-hidden="true" />
                </ToolbarButton>
              </>
            ) : null}
            <ToolbarButton
              label="Chấp nhận mọi thay đổi"
              onClick={acceptAll}
            >
              <CheckCheck size={15} aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              label="Bác bỏ mọi thay đổi"
              onClick={rejectAll}
            >
              <Undo2 size={15} aria-hidden="true" />
            </ToolbarButton>
          </>
        ) : null}

        <ToolbarButton
          label="Bình luận"
          active={commentsOpen}
          onClick={startComment}
        >
          <MessageSquarePlus size={15} aria-hidden="true" />
        </ToolbarButton>

        <ToolbarButton label="In / xuất PDF (Ctrl+P)" onClick={printNow}>
          <Printer size={15} aria-hidden="true" />
        </ToolbarButton>
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

      {linkOpen ? (
        <div
          className="vd-writer__panel"
          role="dialog"
          aria-label="Chèn liên kết"
        >
          <Link2 size={15} aria-hidden="true" />
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

      {pagePanelOpen ? (
        <div
          className="vd-writer__panel"
          role="dialog"
          aria-label="Đầu trang và chân trang"
        >
          <PanelTop size={15} aria-hidden="true" />
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
          <Search size={15} aria-hidden="true" />
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
            <ChevronUp size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Kết quả tiếp theo (Enter)"
            aria-label="Kết quả tiếp theo"
            onClick={() => findNext(1)}
            disabled={matches.length === 0}
          >
            <ChevronDown size={15} aria-hidden="true" />
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
            <Replace size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Đóng (Esc)"
            aria-label="Đóng tìm kiếm"
            onClick={closeSearch}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="vd-writer__body">
        <div className="vd-writer__viewport">
          <div className="vd-writer__page">
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

        {outlineOpen ? (
          <nav
            className="vd-writer__outline"
            aria-label="Điều hướng cấu trúc tài liệu"
          >
            <div className="vd-writer__outline-head">Cấu trúc tài liệu</div>
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
        <span>
          {stats.words} từ · {stats.characters} ký tự
        </span>
        {changeList.length > 0 ? (
          <span>
            {changeList.length} thay đổi đang chờ duyệt
          </span>
        ) : null}
        <span>
          A4 · Lề NĐ30 · Trang {pagination.page}/{pagination.total}
        </span>
      </div>
    </div>
  );
}
