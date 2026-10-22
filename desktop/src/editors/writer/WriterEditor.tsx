import { countWords } from "@vietdesk/vietnamese";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Redo2,
  RemoveFormatting,
  Replace,
  Search,
  SeparatorHorizontal,
  Strikethrough,
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
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  clearFormatting,
  inTable,
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
  writerKeymap,
} from "./commands";
import { searchHighlightKey, searchHighlightPlugin } from "./highlight";
import {
  normalizeAlign,
  normalizeColor,
  normalizeFontFamily,
  normalizeFontSize,
  normalizeHref,
  normalizeLineHeight,
  writerSchema,
} from "./schema";
import { findMatches } from "./search";

export interface WriterEditorProps {
  /** Nội dung ban đầu (văn bản thuần), dùng khi không có `initialContent`. */
  initialText?: string;
  /** ProseMirror JSON đã lưu trong tệp `.vdx`. */
  initialContent?: unknown;
  /** Gọi mỗi khi nội dung thay đổi — kèm JSON để lưu xuống đĩa. */
  onChange?: (payload: { text: string; doc: unknown }) => void;
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

/** Nội dung ProseMirror của một văn bản trống (dùng làm mặc định khi lưu). */
export function createEmptyWriterDocument(): unknown {
  return buildDoc("").toJSON();
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
}: WriterEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

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
      dispatchTransaction(transaction) {
        const next = view.state.apply(transaction);
        view.updateState(next);
        if (transaction.docChanged) {
          const text = next.doc.textBetween(0, next.doc.content.size, "\n", " ");
          setStats({ words: countWords(text), characters: text.length });
          setEmpty(text.trim() === "");
          onChangeRef.current?.({ text, doc: next.doc.toJSON() });
        }
        forceRender((value) => value + 1);
      },
    });

    viewRef.current = view;
    // Cập nhật toolbar/trạng thái sau khi view được gắn.
    forceRender((value) => value + 1);

    return () => {
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

  const run = (command: Command) => () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    command(view.state, view.dispatch, view);
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
  const currentBlock = state?.selection.$from.parent;
  const headingLevel =
    currentBlock?.type === writerSchema.nodes.heading
      ? Number(currentBlock.attrs.level)
      : null;
  const paragraphActive =
    currentBlock?.type === writerSchema.nodes.paragraph;
  const currentAlign =
    normalizeAlign(currentBlock?.attrs.align) ?? "left";
  const bulletActive = state
    ? listActive(state, writerSchema.nodes.bullet_list)
    : false;
  const orderedActive = state
    ? listActive(state, writerSchema.nodes.ordered_list)
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

        <span className="vd-writer__divider" />

        <ToolbarButton
          label="Tiêu đề cấp 1 (Ctrl+Alt+1)"
          active={headingLevel === 1}
          onClick={run(setBlock(writerSchema.nodes.heading, { level: 1 }))}
        >
          <Heading1 size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Tiêu đề cấp 2 (Ctrl+Alt+2)"
          active={headingLevel === 2}
          onClick={run(setBlock(writerSchema.nodes.heading, { level: 2 }))}
        >
          <Heading2 size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Tiêu đề cấp 3 (Ctrl+Alt+3)"
          active={headingLevel === 3}
          onClick={run(setBlock(writerSchema.nodes.heading, { level: 3 }))}
        >
          <Heading3 size={15} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Đoạn văn thường (Ctrl+Alt+0)"
          active={paragraphActive}
          onClick={run(setBlock(writerSchema.nodes.paragraph))}
        >
          <Pilcrow size={15} aria-hidden="true" />
        </ToolbarButton>
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

      <div className="vd-writer__viewport">
        <div className="vd-writer__page">
          <div ref={hostRef} className="vd-writer__surface" spellCheck lang="vi" />
          {empty ? (
            <div className="vd-writer__placeholder" aria-hidden="true">
              Bắt đầu nhập văn bản…
            </div>
          ) : null}
        </div>
      </div>

      <div className="vd-writer__status">
        <span>
          {stats.words} từ · {stats.characters} ký tự
        </span>
        <span>A4 · Lề NĐ30 · chưa phân trang</span>
      </div>
    </div>
  );
}
