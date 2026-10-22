/**
 * Các lệnh định dạng dùng chung cho toolbar và phím tắt Writer.
 */
import { setBlockType, toggleMark } from "prosemirror-commands";
import type { MarkType, Node as PMNode, NodeType } from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
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
  normalizeAlign,
  normalizeHref,
  normalizeLineHeight,
  writerSchema,
} from "./schema";
import type { Alignment } from "./schema";

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

/** Xóa toàn bộ định dạng ký tự và thuộc tính đoạn (canh lề, giãn dòng). */
export function clearFormatting(): Command {
  return (state, dispatch) => {
    const { from, to, empty, $from } = state.selection;
    const transaction = state.tr;

    if (empty) {
      for (const mark of Object.values(writerSchema.marks)) {
        transaction.removeStoredMark(mark);
      }
    } else {
      transaction.removeMark(from, to);
    }

    const reset = (node: PMNode, pos: number) => {
      if (!isAlignable(node.type)) {
        return;
      }
      if (node.attrs.align == null && node.attrs.lineHeight == null) {
        return;
      }
      transaction.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        align: null,
        lineHeight: null,
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
  "Mod-Alt-1": setBlock(writerSchema.nodes.heading, { level: 1 }),
  "Mod-Alt-2": setBlock(writerSchema.nodes.heading, { level: 2 }),
  "Mod-Alt-3": setBlock(writerSchema.nodes.heading, { level: 3 }),
  "Mod-Alt-0": setBlock(writerSchema.nodes.paragraph),
  "Mod-Shift-8": toggleList(writerSchema.nodes.bullet_list),
  "Mod-Shift-7": toggleList(writerSchema.nodes.ordered_list),
  "Mod-Shift-l": setAlign("left"),
  "Mod-Shift-e": setAlign("center"),
  "Mod-Shift-r": setAlign("right"),
  "Mod-Shift-j": setAlign("justify"),
};
