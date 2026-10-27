// @vitest-environment jsdom
/**
 * Kiểm thử theo dõi thay đổi và bình luận trong Writer.
 *
 * Phần lõi (gom nhóm thay đổi, giữ mark khi xoá định dạng, đọc/ghi bình luận)
 * là hàm thuần nên kiểm thử trực tiếp. Phần bắt thao tác gõ/xoá/dán cần một
 * `EditorView` thật nên dựng trong jsdom.
 */
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Fragment, Slice } from "prosemirror-model";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptAllChanges,
  changeAt,
  collectChanges,
  createTrackChangesPlugin,
  isTrackChangesEnabled,
  preservedMarks,
  rejectAllChanges,
  toggleTrackChanges,
} from "../src/editors/writer/changes";
import {
  createCommentId,
  findCommentRange,
  formatCommentTime,
  MAX_COMMENT_QUOTE,
  MAX_COMMENT_TEXT,
  normalizeComments,
  readComments,
} from "../src/editors/writer/comments";
import { clearFormatting } from "../src/editors/writer/commands";
import { writerSchema } from "../src/editors/writer/schema";

function paragraph(text: string, marks = []) {
  return writerSchema.node(
    "paragraph",
    null,
    text ? [writerSchema.text(text, marks)] : [],
  );
}

function doc(...children: ReturnType<typeof writerSchema.node>[]) {
  return writerSchema.node("doc", null, children);
}

let mounted: HTMLElement | null = null;

function createView(
  initialDoc = doc(paragraph("Xin chào")),
  selection = TextSelection.create(initialDoc, 1),
) {
  mounted = globalThis.document.createElement("div");
  globalThis.document.body.appendChild(mounted);
  const view = new EditorView(mounted, {
    state: EditorState.create({
      schema: writerSchema,
      doc: initialDoc,
      selection,
      plugins: [createTrackChangesPlugin()],
    }),
  });
  return view;
}

afterEach(() => {
  mounted?.remove();
  mounted = null;
});

describe("theo dõi thay đổi", () => {
  it("bắt đầu ở trạng thái tắt và bật/tắt bằng lệnh", () => {
    const view = createView();
    expect(isTrackChangesEnabled(view.state)).toBe(false);

    toggleTrackChanges(view.state, view.dispatch);
    expect(isTrackChangesEnabled(view.state)).toBe(true);

    toggleTrackChanges(view.state, view.dispatch);
    expect(isTrackChangesEnabled(view.state)).toBe(false);
    view.destroy();
  });

  it("gõ chữ thì đánh dấu là thêm, không sửa thẳng nội dung", () => {
    const view = createView();
    toggleTrackChanges(view.state, view.dispatch);

    const handled = view.someProp("handleTextInput", (handler) =>
      handler(view, 9, 9, " mới", () => view.state.tr),
    );
    expect(handled).toBe(true);

    // Chữ vẫn nằm trong tài liệu, nhưng mang mark "thêm".
    expect(view.state.doc.textContent).toBe("Xin chào mới");
    const changes = collectChanges(view.state.doc);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("insertion");
    view.destroy();
  });

  it("xoá bằng phím Backspace thì đánh dấu là bớt, chữ không biến mất", () => {
    const view = createView();
    toggleTrackChanges(view.state, view.dispatch);

    // Con trỏ đặt sau "chào" để xoá chữ "o".
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 9)),
    );
    const event = new KeyboardEvent("keydown", { key: "Backspace" });
    const handled = view.someProp("handleKeyDown", (handler) =>
      handler(view, event),
    );
    expect(handled).toBe(true);

    expect(view.state.doc.textContent).toBe("Xin chào");
    const changes = collectChanges(view.state.doc);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("deletion");
    expect(view.state.doc.textBetween(changes[0].from, changes[0].to)).toBe(
      "o",
    );
    view.destroy();
  });

  it("dán văn bản thì đánh dấu toàn bộ phần dán là thêm", () => {
    const view = createView();
    toggleTrackChanges(view.state, view.dispatch);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 9)),
    );

    const slice = new Slice(
      Fragment.from(writerSchema.text(" dán")),
      0,
      0,
    );
    const event = new Event("paste") as ClipboardEvent;
    const handled = view.someProp("handlePaste", (handler) =>
      handler(view, event, slice),
    );
    expect(handled).toBe(true);

    expect(view.state.doc.textContent).toBe("Xin chào dán");
    const changes = collectChanges(view.state.doc);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("insertion");
    view.destroy();
  });

  it("gom nhiều đoạn thêm liền nhau thành một thay đổi", () => {
    const document = writerSchema.node("doc", null, [
      writerSchema.node("paragraph", null, [
        writerSchema.text("A", [writerSchema.marks.insertion.create()]),
        writerSchema.text("B", [writerSchema.marks.insertion.create()]),
        writerSchema.text("C"),
      ]),
    ]);
    const changes = collectChanges(document);
    expect(changes).toHaveLength(1);
    expect(changes[0].from).toBe(1);
    expect(changes[0].to).toBe(3);
  });

  it("tìm thay đổi đang chứa con trỏ", () => {
    const document = writerSchema.node("doc", null, [
      writerSchema.node("paragraph", null, [
        writerSchema.text("A", [writerSchema.marks.insertion.create()]),
        writerSchema.text("B"),
      ]),
    ]);
    expect(changeAt(document, 1)?.kind).toBe("insertion");
    expect(changeAt(document, 3)).toBeNull();
  });

  it("chấp nhận thay đổi thì giữ nội dung và bỏ mark", () => {
    const view = createView();
    toggleTrackChanges(view.state, view.dispatch);
    view.someProp("handleTextInput", (handler) =>
      handler(view, 9, 9, " mới", () => view.state.tr),
    );

    acceptAllChanges(view);
    expect(view.state.doc.textContent).toBe("Xin chào mới");
    expect(collectChanges(view.state.doc)).toHaveLength(0);
    view.destroy();
  });

  it("bác bỏ thay đổi thì trả về trạng thái trước", () => {
    const view = createView();
    toggleTrackChanges(view.state, view.dispatch);
    view.someProp("handleTextInput", (handler) =>
      handler(view, 9, 9, " mới", () => view.state.tr),
    );

    rejectAllChanges(view);
    expect(view.state.doc.textContent).toBe("Xin chào");
    expect(collectChanges(view.state.doc)).toHaveLength(0);
    view.destroy();
  });

  it("bác bỏ thay đổi bớt thì chữ bị xoá quay lại", () => {
    const view = createView();
    toggleTrackChanges(view.state, view.dispatch);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 9)),
    );
    view.someProp("handleKeyDown", (handler) =>
      handler(view, new KeyboardEvent("keydown", { key: "Backspace" })),
    );

    rejectAllChanges(view);
    expect(view.state.doc.textContent).toBe("Xin chào");
    view.destroy();
  });

  it("xóa định dạng không âm thầm chấp nhận thay đổi", () => {
    const document = writerSchema.node("doc", null, [
      writerSchema.node("paragraph", null, [
        writerSchema.text("A", [
          writerSchema.marks.insertion.create(),
          writerSchema.marks.strong.create(),
        ]),
      ]),
    ]);
    const state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 1, 2),
    });

    let next = state;
    clearFormatting()(state, (transaction) => {
      next = state.apply(transaction);
    });

    const marks = next.doc.firstChild?.firstChild?.marks ?? [];
    expect(marks.map((mark) => mark.type.name)).toContain("insertion");
    expect(marks.map((mark) => mark.type.name)).not.toContain("strong");
  });

  it("giữ lại mark cần bảo vệ khi xóa định dạng", () => {
    const document = writerSchema.node("doc", null, [
      writerSchema.node("paragraph", null, [
        writerSchema.text("A", [
          writerSchema.marks.insertion.create(),
          writerSchema.marks.comment.create({ id: "c1" }),
        ]),
      ]),
    ]);
    const kept = preservedMarks(document, 1, 2);
    expect(kept.map((item) => item.mark.type.name)).toEqual([
      "insertion",
      "comment",
    ]);
  });
});

describe("bình luận trong Writer", () => {
  it("bỏ qua phần tử không hợp lệ khi đọc danh sách", () => {
    const comments = normalizeComments([
      { id: "c1", text: "Hợp lệ", author: "Nam", createdAt: 5 },
      { id: "", text: "Thiếu mã" },
      { id: "c2", text: "   " },
      "không phải đối tượng",
      null,
    ]);

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ id: "c1", text: "Hợp lệ" });
  });

  it("đọc bình luận từ nội dung tài liệu", () => {
    expect(
      readComments({
        type: "doc",
        comments: [{ id: "c1", text: "Chỉnh lại", createdAt: 10 }],
      }),
    ).toHaveLength(1);
    expect(readComments({ type: "doc" })).toHaveLength(0);
    expect(readComments(null)).toHaveLength(0);
  });

  it("giới hạn độ dài lời nhắn và trích đoạn", () => {
    const [comment] = normalizeComments([
      { id: "c1", text: "x".repeat(MAX_COMMENT_TEXT + 50), createdAt: 1 },
    ]);
    expect(comment.text).toHaveLength(MAX_COMMENT_TEXT);

    const [longQuote] = normalizeComments([
      { id: "c2", text: "ok", quote: "y".repeat(MAX_COMMENT_QUOTE + 50) },
    ]);
    expect(longQuote.quote).toHaveLength(MAX_COMMENT_QUOTE);
  });

  it("tìm vị trí ghim của bình luận trong văn bản", () => {
    const document = writerSchema.node("doc", null, [
      writerSchema.node("paragraph", null, [
        writerSchema.text("Xin ", [writerSchema.marks.comment.create({ id: "c1" })]),
        writerSchema.text("chào"),
      ]),
    ]);

    const range = findCommentRange(document, "c1");
    expect(range).not.toBeNull();
    expect(range?.from).toBe(1);
    expect(range?.to).toBe(5);
    expect(findCommentRange(document, "không-có")).toBeNull();
  });

  it("sinh mã định danh không trùng lặp", () => {
    const first = createCommentId();
    const second = createCommentId();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(3);
  });

  it("định dạng thời điểm theo lịch Việt Nam", () => {
    expect(formatCommentTime(0)).toBe("");
    expect(formatCommentTime(Number.NaN)).toBe("");
    expect(formatCommentTime(Date.UTC(2026, 0, 2, 3, 4))).toContain("2026");
  });
});
