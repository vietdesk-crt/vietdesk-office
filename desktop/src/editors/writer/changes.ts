/**
 * Theo dõi thay đổi (track changes) — giống Google Docs và Word.
 *
 * Khi bật chế độ này, mọi thao tác ghi vào tài liệu không sửa thẳng nội dung
 * mà được ghi lại thành “đề xuất thay đổi”:
 *  - chữ mới gõ vào được đánh dấu là *thêm*,
 *  - chữ bị xoá không biến mất mà được đánh dấu là *bớt*.
 *
 * Người dùng quyết định sau bằng cách chấp nhận (giữ thay đổi) hoặc bác bỏ
 * (trả về trạng thái trước) — cho từng thay đổi hoặc cho cả tài liệu.
 *
 * Vì sao bắt chặn ở tầng *view* (gõ, phím xoá, dán) chứ không theo dõi
 * transaction? Vì lệnh xoá của ProseMirror xoá thẳng khỏi cây tài liệu; muốn
 * giữ lại chữ bị xoá thì phải chặn trước khi xoá. Bắt ở đầu vào cũng giúp mọi
 * thao tác đều được ghi nhận đồng nhất, kể cả thao tác của bàn phím.
 */
import { Fragment, Slice } from "prosemirror-model";
import type { Mark, Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { DEFAULT_CHANGE_AUTHOR, writerSchema } from "./schema";

export type ChangeKind = "insertion" | "deletion";

export interface ChangeRange {
  kind: ChangeKind;
  /** Vị trí bắt đầu trong tài liệu. */
  from: number;
  /** Vị trí kết thúc (không bao gồm). */
  to: number;
}

export interface TrackChangesState {
  /** Đang bật chế độ theo dõi thay đổi hay không. */
  enabled: boolean;
  /** Tên tác giả ghi vào mỗi thay đổi. */
  author: string;
}

export const trackChangesKey = new PluginKey<TrackChangesState>(
  "vietdesk-track-changes",
);

/** Mark cần giữ lại khi xoá định dạng: dấu vết thay đổi và ghim bình luận. */
function isPreservedMark(mark: Mark): boolean {
  return (
    mark.type === writerSchema.marks.insertion ||
    mark.type === writerSchema.marks.deletion ||
    mark.type === writerSchema.marks.comment
  );
}

/** Đánh dấu thay đổi với tác giả và thời điểm. */
function changeMark(kind: ChangeKind, author: string): Mark {
  return writerSchema.marks[kind].create({
    author,
    date: new Date().toISOString(),
  });
}

/** Gắn mark vào mọi đoạn chữ trong một fragment (dùng khi dán). */
function addMarkToFragment(fragment: Fragment, mark: Mark): Fragment {
  const children: PMNode[] = [];
  fragment.forEach((child) => {
    if (child.isText) {
      children.push(child.mark(mark.addToSet(child.marks)));
      return;
    }
    if (child.content.size > 0) {
      children.push(child.copy(addMarkToFragment(child.content, mark)));
      return;
    }
    children.push(child);
  });
  return Fragment.fromArray(children);
}

/** Vùng chọn có nằm gọn trong một khối văn bản hay không. */
function isTextRange(doc: PMNode, from: number, to: number): boolean {
  try {
    const $from = doc.resolve(from);
    const $to = doc.resolve(to);
    return $from.sameParent($to) && $from.parent.isTextblock;
  } catch {
    return false;
  }
}

/** Chế độ theo dõi thay đổi có đang bật không. */
export function isTrackChangesEnabled(state: EditorState): boolean {
  return Boolean(trackChangesKey.getState(state)?.enabled);
}

/**
 * Plugin theo dõi thay đổi.
 *
 * Plugin nắm ba đầu vào của người dùng: gõ chữ, phím xoá và dán. Ở mỗi đầu
 * vào, nếu chế độ đang bật thì thay đổi được ghi thành mark thay vì sửa thẳng.
 */
export function createTrackChangesPlugin(
  author: string = DEFAULT_CHANGE_AUTHOR,
): Plugin<TrackChangesState> {
  return new Plugin<TrackChangesState>({
    key: trackChangesKey,
    state: {
      init: () => ({ enabled: false, author }),
      apply(transaction: Transaction, value: TrackChangesState) {
        const meta = transaction.getMeta(trackChangesKey) as
          | Partial<TrackChangesState>
          | undefined;
        if (meta && typeof meta === "object") {
          return { ...value, ...meta };
        }
        return value;
      },
    },
    props: {
      handleTextInput(view, from, to, text) {
        const pluginState = trackChangesKey.getState(view.state);
        if (!pluginState?.enabled) {
          return false;
        }
        const transaction = view.state.tr.insertText(text, from, to);
        transaction.addMark(
          from,
          from + text.length,
          changeMark("insertion", pluginState.author),
        );
        view.dispatch(transaction.scrollIntoView());
        return true;
      },

      handleKeyDown(view, event) {
        const pluginState = trackChangesKey.getState(view.state);
        if (!pluginState?.enabled) {
          return false;
        }
        if (event.key !== "Backspace" && event.key !== "Delete") {
          return false;
        }

        const { selection, doc } = view.state;
        let from = selection.from;
        let to = selection.to;
        if (selection.empty) {
          if (event.key === "Backspace") {
            if (from <= 1) {
              return false;
            }
            from -= 1;
          } else {
            if (to >= doc.content.size) {
              return false;
            }
            to += 1;
          }
        }

        // Xoá xuyên qua nhiều khối sẽ làm đổi cấu trúc tài liệu — để ProseMirror
        // xử lý như bình thường thay vì đánh dấu.
        if (!isTextRange(doc, from, to)) {
          return false;
        }

        view.dispatch(
          view.state.tr
            .addMark(from, to, changeMark("deletion", pluginState.author))
            .scrollIntoView(),
        );
        return true;
      },

      handlePaste(view, _event, slice) {
        const pluginState = trackChangesKey.getState(view.state);
        if (!pluginState?.enabled) {
          return false;
        }
        const content = addMarkToFragment(
          slice.content,
          changeMark("insertion", pluginState.author),
        );
        view.dispatch(
          view.state.tr
            .replaceSelection(new Slice(content, slice.openStart, slice.openEnd))
            .scrollIntoView(),
        );
        return true;
      },
    },
  });
}

/** Bật/tắt chế độ theo dõi thay đổi. */
export function toggleTrackChanges(
  state: EditorState,
  dispatch?: (transaction: Transaction) => void,
): boolean {
  const current = trackChangesKey.getState(state);
  if (!current) {
    return false;
  }
  if (dispatch) {
    dispatch(
      state.tr.setMeta(trackChangesKey, { enabled: !current.enabled }),
    );
  }
  return true;
}

/**
 * Liệt kê các thay đổi đang chờ trong tài liệu.
 *
 * Các đoạn chữ liền nhau cùng loại thay đổi được gộp lại thành một thay đổi,
 * đúng như cách Word và Google Docs hiển thị.
 */
export function collectChanges(doc: PMNode): ChangeRange[] {
  const changes: ChangeRange[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText) {
      return true;
    }
    for (const mark of node.marks) {
      const kind: ChangeKind | null =
        mark.type === writerSchema.marks.insertion
          ? "insertion"
          : mark.type === writerSchema.marks.deletion
            ? "deletion"
            : null;
      if (!kind) {
        continue;
      }
      const last = changes[changes.length - 1];
      if (last && last.kind === kind && last.to === pos) {
        last.to = pos + node.nodeSize;
      } else {
        changes.push({ kind, from: pos, to: pos + node.nodeSize });
      }
    }
    return false;
  });

  return changes;
}

/** Thay đổi đang chứa vị trí cho trước. */
export function changeAt(doc: PMNode, pos: number): ChangeRange | null {
  const changes = collectChanges(doc);
  return (
    changes.find((change) => pos >= change.from && pos <= change.to) ?? null
  );
}

/**
 * Các mark phải giữ lại trong một vùng (dấu vết thay đổi, ghim bình luận).
 *
 * Dùng khi xoá định dạng: xoá luôn dấu “bớt” sẽ âm thầm chấp nhận thay đổi,
 * mà người dùng chưa hề bấm “chấp nhận”.
 */
export function preservedMarks(
  doc: PMNode,
  from: number,
  to: number,
): { mark: Mark; from: number; to: number }[] {
  const kept: { mark: Mark; from: number; to: number }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) {
      return true;
    }
    for (const mark of node.marks) {
      if (isPreservedMark(mark)) {
        kept.push({ mark, from: pos, to: pos + node.nodeSize });
      }
    }
    return false;
  });
  return kept;
}

function applyChanges(
  view: EditorView,
  changes: ChangeRange[],
  accept: boolean,
): number {
  if (changes.length === 0) {
    return 0;
  }
  const transaction = view.state.tr;
  // Xử lý từ cuối về đầu: xoá chữ làm các vị trí phía trước không đổi.
  const ordered = [...changes].sort((left, right) => right.from - left.from);

  for (const change of ordered) {
    if (accept) {
      if (change.kind === "insertion") {
        transaction.removeMark(
          change.from,
          change.to,
          writerSchema.marks.insertion,
        );
      } else {
        transaction.delete(change.from, change.to);
      }
      continue;
    }
    if (change.kind === "insertion") {
      transaction.delete(change.from, change.to);
    } else {
      transaction.removeMark(
        change.from,
        change.to,
        writerSchema.marks.deletion,
      );
    }
  }

  view.dispatch(transaction);
  return changes.length;
}

/** Chấp nhận mọi thay đổi đang chờ. */
export function acceptAllChanges(view: EditorView): number {
  return applyChanges(view, collectChanges(view.state.doc), true);
}

/** Bác bỏ mọi thay đổi đang chờ. */
export function rejectAllChanges(view: EditorView): number {
  return applyChanges(view, collectChanges(view.state.doc), false);
}

/** Chấp nhận một thay đổi (mặc định là thay đổi đang chứa con trỏ). */
export function acceptChange(view: EditorView, at?: number): number {
  const change = changeAt(
    view.state.doc,
    at ?? view.state.selection.from,
  );
  if (!change) {
    return 0;
  }
  return applyChanges(view, [change], true);
}

/** Bác bỏ một thay đổi (mặc định là thay đổi đang chứa con trỏ). */
export function rejectChange(view: EditorView, at?: number): number {
  const change = changeAt(
    view.state.doc,
    at ?? view.state.selection.from,
  );
  if (!change) {
    return 0;
  }
  return applyChanges(view, [change], false);
}
