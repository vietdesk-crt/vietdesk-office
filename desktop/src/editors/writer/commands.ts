/**
 * Các lệnh định dạng dùng chung cho toolbar và phím tắt Writer.
 */
import { setBlockType, toggleMark } from "prosemirror-commands";
import type { Mark, MarkType, Node as PMNode, NodeType } from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { liftListItem, wrapInList } from "prosemirror-schema-list";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  isInTable,
  mergeCells,
  splitCell,
  toggleHeaderRow,
} from "prosemirror-tables";
import {
  MAX_INDENT,
  normalizeAlign,
  normalizeHref,
  normalizeImageSize,
  normalizeIndent,
  normalizeLineHeight,
  writerSchema,
} from "./schema";
import type { Alignment } from "./schema";
import { preservedMarks } from "./changes";

/** Mark đang bật tại vị trí chọn (hoặc trong stored marks). */
export function markActive(state: EditorState, type: MarkType): boolean {
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    return Boolean(type.isInSet(state.storedMarks ?? $from.marks()));
  }
  return state.doc.rangeHasMark(from, to, type);
}

/** Giá trị thuộc tính mark tại vùng chọn; null nếu không có hoặc không đồng nhất. */
export function markValue(
  state: EditorState,
  type: MarkType,
  attr: string,
): unknown {
  const { empty, from, to, $from } = state.selection;
  if (empty) {
    const mark = type.isInSet(state.storedMarks ?? $from.marks());
    return mark?.attrs[attr] ?? null;
  }

  let value: unknown;
  let found = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) {
      return true;
    }
    const current = type.isInSet(node.marks)?.attrs[attr] ?? null;
    if (!found) {
      value = current;
      found = true;
    } else if (value !== current) {
      value = null;
    }
    return true;
  });
  return found ? value : null;
}

/** Đoạn văn/tiêu đề hiện tại đang canh lề nào (mặc định trái). */
export function alignActive(state: EditorState, align: Alignment): boolean {
  const value = normalizeAlign(state.selection.$from.parent.attrs.align);
  return (value ?? "left") === align;
}

/** Đang ở trong danh sách cùng loại hay không. */
export function listActive(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === type) {
      return true;
    }
  }
  return false;
}

function isAlignable(type: NodeType): boolean {
  return (
    type === writerSchema.nodes.paragraph || type === writerSchema.nodes.heading
  );
}

/** Các node chấp nhận thụt lề (đoạn văn, tiêu đề, mục danh sách, mục việc). */
function isIndentable(type: NodeType): boolean {
  return (
    isAlignable(type) ||
    type === writerSchema.nodes.list_item ||
    type === writerSchema.nodes.task_item
  );
}

/** Đặt một thuộc tính block (align, lineHeight…) cho mọi block trong vùng chọn. */
function setBlockAttr(attr: string, value: unknown): Command {
  return (state, dispatch) => {
    const { from, to, $from } = state.selection;
    const transaction = state.tr;
    let changed = false;

    const apply = (node: PMNode, pos: number) => {
      if (!isAlignable(node.type)) {
        return;
      }
      if ((node.attrs[attr] ?? null) === value) {
        return;
      }
      transaction.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        [attr]: value,
      });
      changed = true;
    };

    if (from === to) {
      apply($from.parent, $from.before());
    } else {
      state.doc.nodesBetween(from, to, (node, pos) => {
        apply(node, pos);
        return true;
      });
    }

    if (changed && dispatch) {
      dispatch(transaction);
    }
    return changed;
  };
}

/** Canh lề mọi đoạn văn/tiêu đề trong vùng chọn. */
export function setAlign(align: Alignment): Command {
  return setBlockAttr("align", align);
}

/**
 * Thụt lề hoặc lùi lề mọi khối trong vùng chọn.
 *
 * `delta` dương = thụt vào, âm = lùi ra. Biên trên là 0 (không lùi quá lề trái)
 * và MAX_INDENT (không thụt vô hạn).
 */
export function changeIndent(delta: number): Command {
  return (state, dispatch) => {
    const { from, to, $from } = state.selection;
    const transaction = state.tr;
    let changed = false;

    const apply = (node: PMNode, pos: number) => {
      if (!isIndentable(node.type)) {
        return;
      }
      const current = normalizeIndent(node.attrs.indent);
      const next = Math.min(MAX_INDENT, Math.max(0, current + delta));
      if (next === current) {
        return;
      }
      transaction.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        indent: next,
      });
      changed = true;
    };

    if (from === to) {
      apply($from.parent, $from.before());
    } else {
      state.doc.nodesBetween(from, to, (node, pos) => {
        apply(node, pos);
        return true;
      });
    }

    if (changed && dispatch) {
      dispatch(transaction);
    }
    return changed;
  };
}

/** Giãn dòng cho mọi đoạn văn/tiêu đề trong vùng chọn. */
export function setLineHeight(value: string | null): Command {
  return setBlockAttr(
    "lineHeight",
    value === null ? null : normalizeLineHeight(value),
  );
}

/** Đổi loại block (đoạn văn ↔ tiêu đề), giữ canh lề và giãn dòng hiện tại. */
export function setBlock(
  nodeType: NodeType,
  attrs: Record<string, unknown> = {},
): Command {
  return (state, dispatch, view) => {
    const current = state.selection.$from.parent.attrs;
    const nextAttrs = nodeType.spec.attrs?.align
      ? {
          ...attrs,
          align: normalizeAlign(current.align),
          lineHeight: normalizeLineHeight(current.lineHeight),
          indent: normalizeIndent(current.indent),
        }
      : attrs;
    return setBlockType(nodeType, nextAttrs)(state, dispatch, view);
  };
}

/** Gắn/thay mark có thuộc tính (cỡ chữ, màu chữ…). */
export function setMarkAttr(
  type: MarkType,
  attrs: Record<string, unknown>,
): Command {
  return (state, dispatch) => {
    const mark = type.create(attrs);
    if (state.selection.empty) {
      if (dispatch) {
        dispatch(state.tr.addStoredMark(mark));
      }
      return true;
    }
    const { from, to } = state.selection;
    if (dispatch) {
      dispatch(state.tr.addMark(from, to, mark));
    }
    return true;
  };
}

/** Bỏ một loại mark khỏi vùng chọn hoặc khỏi stored marks. */
export function removeMarkType(type: MarkType): Command {
  return (state, dispatch) => {
    if (state.selection.empty) {
      if (dispatch) {
        dispatch(state.tr.removeStoredMark(type));
      }
      return true;
    }
    const { from, to } = state.selection;
    if (dispatch) {
      dispatch(state.tr.removeMark(from, to, type));
    }
    return true;
  };
}

/** Xóa toàn bộ định dạng ký tự và thuộc tính đoạn (canh lề, giãn dòng, thụt lề). */
export function clearFormatting(): Command {
  return (state, dispatch) => {
    const { from, to, empty, $from } = state.selection;
    const transaction = state.tr;

    if (empty) {
      for (const mark of Object.values(writerSchema.marks)) {
        transaction.removeStoredMark(mark);
      }
    } else {
      // Giữ lại dấu vết thay đổi và ghim bình luận: xoá chúng lúc này sẽ
      // âm thầm chấp nhận thay đổi mà người dùng chưa hề bấm “chấp nhận”.
      const kept = preservedMarks(state.doc, from, to);
      transaction.removeMark(from, to);
      for (const item of kept) {
        transaction.addMark(item.from, item.to, item.mark);
      }
    }

    const reset = (node: PMNode, pos: number) => {
      if (!isAlignable(node.type)) {
        return;
      }
      if (
        node.attrs.align == null &&
        node.attrs.lineHeight == null &&
        normalizeIndent(node.attrs.indent) === 0
      ) {
        return;
      }
      transaction.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        align: null,
        lineHeight: null,
        indent: 0,
      });
    };

    if (empty) {
      reset($from.parent, $from.before());
    } else {
      state.doc.nodesBetween(from, to, (node, pos) => {
        reset(node, pos);
        return true;
      });
    }

    if (dispatch) {
      dispatch(transaction);
    }
    return true;
  };
}

/** Kiểu đổi chữ hoa/thường tương ứng menu "Aa" của Word. */
export type CaseMode =
  | "upper"
  | "lower"
  | "sentence"
  | "capitalize"
  | "toggle";

/**
 * Một bước của "Viết hoa đầu câu"; trả về cả trạng thái để nối tiếp qua các
 * text node khác định dạng trong cùng đoạn văn.
 */
function sentenceCaseStep(
  text: string,
  startOfSentence: boolean,
): { text: string; startOfSentence: boolean } {
  let result = "";
  let start = startOfSentence;
  for (const char of text.toLocaleLowerCase("vi")) {
    if (start && /[\p{L}\p{N}]/u.test(char)) {
      result += char.toLocaleUpperCase("vi");
      start = false;
      continue;
    }
    result += char;
    if (/[.!?]/.test(char)) {
      start = true;
    }
  }
  return { text: result, startOfSentence: start };
}

function toSentenceCase(text: string): string {
  return sentenceCaseStep(text, true).text;
}

function toToggleCase(text: string): string {
  let result = "";
  for (const char of text) {
    const upper = char.toLocaleUpperCase("vi");
    const lower = char.toLocaleLowerCase("vi");
    if (upper === lower) {
      result += char;
    } else {
      result += char === lower ? upper : lower;
    }
  }
  return result;
}

/** Biến đổi chuỗi theo kiểu chữ; tách riêng để kiểm thử độc lập. */
export function transformCaseText(text: string, mode: CaseMode): string {
  switch (mode) {
    case "upper":
      return text.toLocaleUpperCase("vi");
    case "lower":
      return text.toLocaleLowerCase("vi");
    case "sentence":
      return toSentenceCase(text);
    case "capitalize":
      return text.replace(
        /\S+/g,
        (word) =>
          word.charAt(0).toLocaleUpperCase("vi") +
          word.slice(1).toLocaleLowerCase("vi"),
      );
    case "toggle":
      return toToggleCase(text);
    default:
      return text;
  }
}

/**
 * Đổi chữ hoa/thường cho vùng chọn.
 *
 * Mỗi đoạn văn bản được biến đổi riêng và giữ nguyên mark của nó, nhờ vậy
 * chữ đậm/màu/liên kết bên trong không bị mất.
 */
export function changeCase(mode: CaseMode): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) {
      return false;
    }
    if (!dispatch) {
      return true;
    }

    // Thu thập trước rồi thay từ cuối về đầu: đổi chữ hoa/thường có thể làm
    // chuỗi dài ra (ví dụ "ß" → "SS"), khi đó vị trí phía sau sẽ lệch nếu
    // thay theo thứ tự xuôi.
    const ranges: { from: number; to: number; text: string; node: PMNode }[] =
      [];
    let sentenceStart = true;
    let block: PMNode | null = null;
    state.doc.nodesBetween(from, to, (node, pos, parentNode) => {
      if (!node.isText || !node.text) {
        return true;
      }
      // Mỗi khối mở đầu một câu mới; trong cùng khối thì trạng thái được nối
      // tiếp qua các text node khác định dạng (đậm, màu, liên kết…).
      if (parentNode !== block) {
        block = parentNode;
        sentenceStart = true;
      }

      const start = Math.max(pos, from);
      const end = Math.min(pos + node.nodeSize, to);
      if (end <= start) {
        return true;
      }
      const text = node.text.slice(start - pos, end - pos);
      let next: string;
      if (mode === "sentence") {
        const prefix = node.text.slice(0, start - pos);
        if (prefix) {
          sentenceStart = sentenceCaseStep(
            prefix,
            sentenceStart,
          ).startOfSentence;
        }
        const step = sentenceCaseStep(text, sentenceStart);
        next = step.text;
        sentenceStart = step.startOfSentence;
      } else {
        next = transformCaseText(text, mode);
      }
      if (next !== text) {
        ranges.push({ from: start, to: end, text: next, node });
      }
      return true;
    });

    if (ranges.length === 0) {
      return false;
    }

    const transaction = state.tr;
    for (const range of ranges.reverse()) {
      transaction.replaceWith(
        range.from,
        range.to,
        writerSchema.text(range.text, range.node.marks),
      );
    }
    dispatch(transaction);
    return true;
  };
}

/** Các mark định dạng ký tự mà "Chép định dạng" mang theo. */
const FORMATTING_MARKS = new Set([
  "code",
  "strong",
  "em",
  "underline",
  "strike",
  "superscript",
  "subscript",
  "fontFamily",
  "fontSize",
  "textColor",
  "highlight",
]);

/** Định dạng ký tự đang áp dụng tại vùng chọn (dùng cho Format Painter). */
export function formattingMarksAtSelection(
  state: EditorState,
): readonly Mark[] {
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    return (state.storedMarks ?? $from.marks()).filter((mark) =>
      FORMATTING_MARKS.has(mark.type.name),
    );
  }

  // Lấy định dạng của ký tự đầu tiên trong vùng chọn, giống Format Painter
  // của Word (không phụ thuộc vào text node cuối cùng).
  let marks: readonly Mark[] = [];
  let found = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && !found) {
      marks = node.marks;
      found = true;
    }
    return true;
  });
  return marks.filter((mark) => FORMATTING_MARKS.has(mark.type.name));
}

/** Dán định dạng đã chép lên vùng chọn (thay định dạng ký tự cũ). */
export function applyFormatting(marks: readonly Mark[]): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) {
      return false;
    }
    if (!dispatch) {
      return true;
    }

    // Giữ liên kết, dấu vết thay đổi và ghim bình luận — chúng không phải
    // định dạng ký tự nên không được xoá khi dán định dạng.
    const kept: { from: number; to: number; mark: Mark }[] = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) {
        return true;
      }
      const start = Math.max(pos, from);
      const end = Math.min(pos + node.nodeSize, to);
      if (end <= start) {
        return true;
      }
      for (const mark of node.marks) {
        if (!FORMATTING_MARKS.has(mark.type.name)) {
          kept.push({ from: start, to: end, mark });
        }
      }
      return true;
    });

    const transaction = state.tr.removeMark(from, to);
    for (const mark of marks) {
      if (FORMATTING_MARKS.has(mark.type.name)) {
        transaction.addMark(from, to, mark);
      }
    }
    for (const item of kept) {
      transaction.addMark(item.from, item.to, item.mark);
    }
    dispatch(transaction);
    return true;
  };
}

/**
 * Sắp xếp các đoạn văn/tiêu đề cấp cao nhất trong vùng chọn theo ABC.
 *
 * Từ chối khi vùng chọn có bảng, danh sách, ngắt trang… xen vào — đổi thứ tự
 * các khối lồng nhau sẽ phá cấu trúc tài liệu.
 */
export function sortSelectedBlocks(): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) {
      return false;
    }

    const blocks: { node: PMNode; pos: number; end: number; text: string }[] =
      [];
    let allowed = true;
    state.doc.forEach((node, offset) => {
      const end = offset + node.nodeSize;
      if (end <= from || offset >= to) {
        return;
      }
      if (
        node.type !== writerSchema.nodes.paragraph &&
        node.type !== writerSchema.nodes.heading
      ) {
        allowed = false;
        return;
      }
      blocks.push({
        node,
        pos: offset,
        end,
        text: node.textBetween(0, node.content.size, " ", " "),
      });
    });

    if (!allowed || blocks.length < 2) {
      return false;
    }
    if (!dispatch) {
      return true;
    }

    const sorted = [...blocks].sort((left, right) =>
      left.text.localeCompare(right.text, "vi", { sensitivity: "base" }),
    );
    if (sorted.every((block, index) => block === blocks[index])) {
      return false;
    }

    dispatch(
      state.tr
        .replaceWith(
          blocks[0].pos,
          blocks[blocks.length - 1].end,
          sorted.map((block) => block.node),
        )
        .scrollIntoView(),
    );
    return true;
  };
}

/** Bật/tắt danh sách; nếu đang ở loại khác thì đổi loại tại chỗ. */
export function toggleList(type: NodeType): Command {
  return (state, dispatch, view) => {
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type === type) {
        return liftListItem(writerSchema.nodes.list_item)(
          state,
          dispatch,
          view,
        );
      }
      if (
        node.type === writerSchema.nodes.bullet_list ||
        node.type === writerSchema.nodes.ordered_list
      ) {
        if (dispatch) {
          dispatch(state.tr.setNodeMarkup($from.before(depth), type, {}));
        }
        return true;
      }
    }
    return wrapInList(type)(state, dispatch, view);
  };
}

/**
 * Đổi một danh sách sang kiểu danh sách khác mà giữ nguyên nội dung các mục.
 *
 * Cần tự dựng lại node vì `list_item` và `task_item` là hai kiểu khác nhau —
 * `setNodeMarkup` không đổi được kiểu con.
 */
function replaceListType(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  pos: number,
  targetType: NodeType,
): boolean {
  const listNode = state.doc.nodeAt(pos);
  if (!listNode) {
    return false;
  }

  const isTask = targetType === writerSchema.nodes.task_list;
  const itemType = isTask
    ? writerSchema.nodes.task_item
    : writerSchema.nodes.list_item;

  const items: PMNode[] = [];
  listNode.forEach((child) => {
    items.push(
      itemType.create(
        isTask
          ? { checked: false, indent: normalizeIndent(child.attrs.indent) }
          : { indent: normalizeIndent(child.attrs.indent) },
        child.content,
      ),
    );
  });

  if (items.length === 0) {
    return false;
  }
  if (!dispatch) {
    return true;
  }

  const replacement = targetType.create(null, items);
  dispatch(
    state.tr
      .replaceWith(pos, pos + listNode.nodeSize, replacement)
      .scrollIntoView(),
  );
  return true;
}

/**
 * Bật/tắt danh sách việc cần làm.
 *
 * - Đang trong danh sách việc → đổi về danh sách gạch đầu dòng.
 * - Đang trong danh sách gạch đầu dòng/đánh số → đổi sang danh sách việc.
 * - Đang ở đoạn văn thường → bọc thành một mục việc.
 */
export function toggleTaskList(): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type === writerSchema.nodes.task_list) {
        return replaceListType(
          state,
          dispatch,
          $from.before(depth),
          writerSchema.nodes.bullet_list,
        );
      }
      if (
        node.type === writerSchema.nodes.bullet_list ||
        node.type === writerSchema.nodes.ordered_list
      ) {
        return replaceListType(
          state,
          dispatch,
          $from.before(depth),
          writerSchema.nodes.task_list,
        );
      }
    }

    const parent = $from.parent;
    if (parent.type !== writerSchema.nodes.paragraph) {
      return false;
    }
    if (!dispatch) {
      return true;
    }

    const pos = $from.before($from.depth);
    // Nội dung đoạn văn được bọc lại thành đoạn văn bên trong mục việc:
    // `task_item` chỉ chứa block, không chứa trực tiếp văn bản.
    const item = writerSchema.nodes.task_item.create(
      { checked: false },
      writerSchema.nodes.paragraph.create(null, parent.content),
    );
    const list = writerSchema.nodes.task_list.create(null, item);
    dispatch(
      state.tr
        .replaceWith(pos, pos + parent.nodeSize, list)
        .scrollIntoView(),
    );
    return true;
  };
}

/** Tích/bỏ tích mục việc cần làm đang chứa con trỏ. */
export function toggleTaskChecked(): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type === writerSchema.nodes.task_item) {
        if (!dispatch) {
          return true;
        }
        dispatch(
          state.tr.setNodeMarkup($from.before(depth), undefined, {
            ...node.attrs,
            checked: !node.attrs.checked,
          }),
        );
        return true;
      }
    }
    return false;
  };
}

/** Con trỏ đang nằm trong bảng hay không. */
export function inTable(state: EditorState): boolean {
  return isInTable(state);
}

/**
 * Chèn bảng mới với số hàng/cột cho trước.
 *
 * Bảng được chèn trước đoạn đang soạn (không xoá nội dung người dùng) và con
 * trỏ được đưa vào ô đầu tiên.
 */
export function insertTable(rows: number, cols: number): Command {
  return (state, dispatch) => {
    const rowCount = Math.min(Math.max(Math.round(rows), 1), 20);
    const colCount = Math.min(Math.max(Math.round(cols), 1), 12);
    if (!dispatch) {
      return true;
    }

    const body: PMNode[] = [];
    for (let row = 0; row < rowCount; row += 1) {
      const cellType =
        row === 0
          ? writerSchema.nodes.table_header
          : writerSchema.nodes.table_cell;
      const cells: PMNode[] = [];
      for (let col = 0; col < colCount; col += 1) {
        cells.push(cellType.create(null, writerSchema.nodes.paragraph.create()));
      }
      body.push(writerSchema.nodes.table_row.create(null, cells));
    }

    const insertAt = state.selection.$from.before();
    const transaction = state.tr.insert(
      insertAt,
      writerSchema.nodes.table.create(null, body),
    );
    transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(insertAt + 3)),
    );
    dispatch(transaction.scrollIntoView());
    return true;
  };
}

/** Gắn liên kết cho vùng chọn (chỉ nhận URL an toàn). */
export function setLink(href: string): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) {
      return false;
    }
    const value = normalizeHref(href);
    if (!value) {
      return false;
    }
    if (dispatch) {
      const transaction = state.tr.removeMark(
        from,
        to,
        writerSchema.marks.link,
      );
      transaction.addMark(
        from,
        to,
        writerSchema.marks.link.create({ href: value }),
      );
      dispatch(transaction);
    }
    return true;
  };
}

/**
 * Chèn ngắt trang ngay sau khối cấp cao nhất đang chứa con trỏ.
 *
 * Nhờ vậy ngắt trang không nằm lọt bên trong bảng hay danh sách mà luôn nằm
 * ở cấp đoạn văn của tài liệu.
 */
export function insertPageBreak(): Command {
  return (state, dispatch) => {
    if (!dispatch) {
      return true;
    }
    const { $from } = state.selection;
    const transaction = state.tr.insert(
      $from.after(1),
      writerSchema.nodes.page_break.create(),
    );
    dispatch(transaction.scrollIntoView());
    return true;
  };
}

/**
 * Chèn đường kẻ ngang ngay sau khối cấp cao nhất đang chứa con trỏ.
 *
 * Vị trí chèn giống hệt ngắt trang: luôn nằm ở cấp đoạn văn, không lọt vào
 * trong bảng hay danh sách.
 */
export function insertHorizontalRule(): Command {
  return (state, dispatch) => {
    if (!dispatch) {
      return true;
    }
    const { $from } = state.selection;
    const transaction = state.tr.insert(
      $from.after(1),
      writerSchema.nodes.horizontal_rule.create(),
    );
    dispatch(transaction.scrollIntoView());
    return true;
  };
}

/**
 * Chèn ảnh vào vị trí con trỏ.
 *
 * `src` là đường dẫn tương đối trong thư mục `assets` cạnh tệp tài liệu, hoặc
 * một data URL khi tài liệu chưa lưu trên đĩa. Kích thước bị chặn về khoảng
 * 16–4000 px theo quy tắc của schema.
 */
export function insertImage(attrs: {
  src: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
}): Command {
  return (state, dispatch) => {
    if (!attrs.src) {
      return false;
    }
    const node = writerSchema.nodes.image.createAndFill({
      src: attrs.src,
      alt: attrs.alt ?? "",
      width: normalizeImageSize(attrs.width ?? null),
      height: normalizeImageSize(attrs.height ?? null),
    });
    if (!node) {
      return false;
    }
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
    }
    return true;
  };
}

/** Nhóm lệnh bảng dùng cho thanh công cụ ngữ cảnh. */
export const tableCommands = {
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  mergeCells,
  splitCell,
  toggleHeaderRow,
};

/** Tab di chuyển giữa các ô trong bảng. */
export const tableKeymap: Record<string, Command> = {
  Tab: goToNextCell(1),
  "Shift-Tab": goToNextCell(-1),
};

/** Phím tắt định dạng dùng chung. */
export const writerKeymap: Record<string, Command> = {
  "Mod-b": toggleMark(writerSchema.marks.strong),
  "Mod-i": toggleMark(writerSchema.marks.em),
  "Mod-u": toggleMark(writerSchema.marks.underline),
  "Mod-Shift-x": toggleMark(writerSchema.marks.strike),
  "Mod-Shift-.": toggleMark(writerSchema.marks.superscript),
  "Mod-Shift-,": toggleMark(writerSchema.marks.subscript),
  "Mod-Alt-1": setBlock(writerSchema.nodes.heading, { level: 1 }),
  "Mod-Alt-2": setBlock(writerSchema.nodes.heading, { level: 2 }),
  "Mod-Alt-3": setBlock(writerSchema.nodes.heading, { level: 3 }),
  "Mod-Alt-4": setBlock(writerSchema.nodes.heading, { level: 4 }),
  "Mod-Alt-5": setBlock(writerSchema.nodes.heading, { level: 5 }),
  "Mod-Alt-6": setBlock(writerSchema.nodes.heading, { level: 6 }),
  "Mod-Alt-0": setBlock(writerSchema.nodes.paragraph),
  "Mod-Shift-8": toggleList(writerSchema.nodes.bullet_list),
  "Mod-Shift-7": toggleList(writerSchema.nodes.ordered_list),
  "Mod-Shift-9": toggleTaskList(),
  "Mod-]": changeIndent(1),
  "Mod-[": changeIndent(-1),
  "Mod-Shift-l": setAlign("left"),
  "Mod-Shift-e": setAlign("center"),
  "Mod-Shift-r": setAlign("right"),
  "Mod-Shift-j": setAlign("justify"),
};
