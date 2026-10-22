import { EditorState, TextSelection } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import {
  clearFormatting,
  inTable,
  insertPageBreak,
  insertTable,
  markValue,
  removeMarkType,
  setAlign,
  setBlock,
  setLineHeight,
  setLink,
  setMarkAttr,
  tableCommands,
  toggleList,
} from "../src/editors/writer/commands";
import { normalizeHref, writerSchema } from "../src/editors/writer/schema";
import { findMatches } from "../src/editors/writer/search";

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

function selectedText(document: ReturnType<typeof doc>, match: { from: number; to: number }) {
  return document.textBetween(match.from, match.to, "\n", " ");
}

function applyCommand(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (transaction) => {
    next = state.apply(transaction);
  });
  return next;
}

describe("schema Writer", () => {
  it("giữ tương thích với JSON .vdx cũ không có thuộc tính align", () => {
    const legacy = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Tài liệu cũ" }],
        },
      ],
    };
    const restored = writerSchema.nodeFromJSON(legacy);
    expect(restored.textContent).toBe("Tài liệu cũ");
    expect(restored.firstChild?.attrs.align).toBeNull();
  });

  it("round-trip được canh lề, gạch chân và gạch ngang", () => {
    const document = writerSchema.node("doc", null, [
      writerSchema.node("paragraph", { align: "center" }, [
        writerSchema.text("Đậm", [writerSchema.marks.strong.create()]),
        writerSchema.text(" gạch chân", [
          writerSchema.marks.underline.create(),
        ]),
        writerSchema.text(" gạch ngang", [
          writerSchema.marks.strike.create(),
        ]),
      ]),
    ]);

    const restored = writerSchema.nodeFromJSON(document.toJSON());
    expect(restored.eq(document)).toBe(true);
    expect(restored.firstChild?.attrs.align).toBe("center");
  });

  it("có node danh sách gạch đầu dòng và đánh số", () => {
    expect(writerSchema.nodes.bullet_list).toBeDefined();
    expect(writerSchema.nodes.ordered_list).toBeDefined();
    expect(writerSchema.nodes.list_item).toBeDefined();
  });

  it("round-trip được bảng, liên kết và ngắt trang", () => {
    const document = writerSchema.node("doc", null, [
      writerSchema.node("table", null, [
        writerSchema.node("table_row", null, [
          writerSchema.node("table_header", null, [
            writerSchema.node("paragraph", null, [
              writerSchema.text("Tiêu đề", [
                writerSchema.marks.link.create({
                  href: "https://vietdesk.vn",
                }),
              ]),
            ]),
          ]),
        ]),
      ]),
      writerSchema.nodes.page_break.create(),
    ]);

    const restored = writerSchema.nodeFromJSON(document.toJSON());
    expect(restored.eq(document)).toBe(true);
    expect(restored.child(1).type.name).toBe("page_break");
  });
});

describe("tìm kiếm trong Writer", () => {
  it("tìm được trong nhiều đoạn và không phân biệt hoa/thường", () => {
    const document = doc(
      paragraph("Xin chào thế giới"),
      paragraph("Chào Việt Nam"),
    );

    const matches = findMatches(document, "chào");
    expect(matches).toHaveLength(2);
    expect(matches.map((match) => selectedText(document, match))).toEqual([
      "chào",
      "Chào",
    ]);
  });

  it("tìm được cụm từ vắt qua nhiều mark trong cùng đoạn", () => {
    const document = writerSchema.node("doc", null, [
      writerSchema.node("paragraph", null, [
        writerSchema.text("Xin "),
        writerSchema.text("chào", [writerSchema.marks.strong.create()]),
        writerSchema.text(" thế giới"),
      ]),
    ]);

    const [match] = findMatches(document, "Xin chào");
    expect(match).toBeDefined();
    expect(selectedText(document, match)).toBe("Xin chào");
  });

  it("tôn trọng tuỳ chọn phân biệt hoa/thường", () => {
    const document = doc(paragraph("Chào và chào"));
    expect(findMatches(document, "CHÀO", true)).toHaveLength(0);
    expect(findMatches(document, "CHÀO", false)).toHaveLength(2);
  });

  it("tìm được trong mục danh sách", () => {
    const document = writerSchema.node("doc", null, [
      writerSchema.node("bullet_list", null, [
        writerSchema.node("list_item", null, [paragraph("Một")]),
        writerSchema.node("list_item", null, [paragraph("Hai")]),
      ]),
    ]);

    const [match] = findMatches(document, "Hai");
    expect(match).toBeDefined();
    expect(selectedText(document, match)).toBe("Hai");
  });

  it("thay thế tất cả từ cuối lên không làm lệch vị trí", () => {
    const document = doc(paragraph("chào chào chào"));
    const matches = findMatches(document, "chào");
    const state = EditorState.create({ schema: writerSchema, doc: document });

    let transaction = state.tr;
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const match = matches[index];
      transaction = transaction.insertText("hello", match.from, match.to);
    }
    const next = state.apply(transaction);

    expect(next.doc.textContent).toBe("hello hello hello");
  });
});

describe("lệnh định dạng Writer", () => {
  it("canh giữa đoạn văn hiện tại", () => {
    const document = doc(paragraph("Xin chào"));
    const state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 2),
    });

    let next: EditorState | null = null;
    setAlign("center")(state, (transaction) => {
      next = state.apply(transaction);
    });

    expect(next).not.toBeNull();
    expect((next as unknown as EditorState).doc.firstChild?.attrs.align).toBe(
      "center",
    );
  });

  it("đổi đoạn văn thành tiêu đề cấp 2", () => {
    const document = doc(paragraph("Xin chào"));
    const state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 2),
    });

    let next: EditorState | null = null;
    setBlock(writerSchema.nodes.heading, { level: 2 })(
      state,
      (transaction) => {
        next = state.apply(transaction);
      },
    );

    expect(next).not.toBeNull();
    const block = (next as unknown as EditorState).doc.firstChild;
    expect(block?.type.name).toBe("heading");
    expect(block?.attrs.level).toBe(2);
  });

  it("bọc đoạn văn thành danh sách gạch đầu dòng", () => {
    const document = doc(paragraph("Xin chào"));
    const state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 2),
    });

    let next: EditorState | null = null;
    toggleList(writerSchema.nodes.bullet_list)(
      state,
      (transaction) => {
        next = state.apply(transaction);
      },
    );

    expect(next).not.toBeNull();
    expect((next as unknown as EditorState).doc.firstChild?.type.name).toBe(
      "bullet_list",
    );
  });

  it("đổi danh sách đánh số thành gạch đầu dòng tại chỗ", () => {
    const document = writerSchema.node("doc", null, [
      writerSchema.node("ordered_list", null, [
        writerSchema.node("list_item", null, [paragraph("Mục")]),
      ]),
    ]);
    const state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 4),
    });

    let next: EditorState | null = null;
    toggleList(writerSchema.nodes.bullet_list)(
      state,
      (transaction) => {
        next = state.apply(transaction);
      },
    );

    expect(next).not.toBeNull();
    expect((next as unknown as EditorState).doc.firstChild?.type.name).toBe(
      "bullet_list",
    );
  });
});

describe("typography Writer", () => {
  it("gắn và bỏ mark cỡ chữ, kiểu chữ, màu chữ, tô sáng", () => {
    const document = doc(paragraph("Xin chào"));
    let state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 1, 5),
    });

    state = applyCommand(
      state,
      setMarkAttr(writerSchema.marks.fontSize, { size: "20pt" }),
    );
    state = applyCommand(
      state,
      setMarkAttr(writerSchema.marks.fontFamily, {
        family: "Arial, sans-serif",
      }),
    );
    state = applyCommand(
      state,
      setMarkAttr(writerSchema.marks.textColor, { color: "#c00000" }),
    );
    state = applyCommand(
      state,
      setMarkAttr(writerSchema.marks.highlight, { color: "#fff0a8" }),
    );

    const text = state.doc.firstChild?.firstChild;
    const marks = Object.fromEntries(
      (text?.marks ?? []).map((mark) => [mark.type.name, mark.attrs]),
    );
    expect(marks.fontSize).toEqual({ size: "20pt" });
    expect(marks.fontFamily).toEqual({ family: "Arial, sans-serif" });
    expect(marks.textColor).toEqual({ color: "#c00000" });
    expect(marks.highlight).toEqual({ color: "#fff0a8" });
    expect(markValue(state, writerSchema.marks.fontSize, "size")).toBe("20pt");

    state = applyCommand(state, removeMarkType(writerSchema.marks.fontSize));
    expect(
      markValue(state, writerSchema.marks.fontSize, "size"),
    ).toBeNull();
  });

  it("xuất mark ra DOM với style an toàn", () => {
    expect(
      writerSchema.marks.fontSize.spec.toDOM!(
        writerSchema.marks.fontSize.create({ size: "20pt" }),
        true,
      ),
    ).toEqual(["span", { style: "font-size: 20pt" }, 0]);
    expect(
      writerSchema.marks.fontFamily.spec.toDOM!(
        writerSchema.marks.fontFamily.create({ family: "Arial, sans-serif" }),
        true,
      ),
    ).toEqual(["span", { style: "font-family: Arial, sans-serif" }, 0]);
    expect(
      writerSchema.marks.textColor.spec.toDOM!(
        writerSchema.marks.textColor.create({ color: "#c00000" }),
        true,
      ),
    ).toEqual(["span", { style: "color: #c00000" }, 0]);
    expect(
      writerSchema.marks.highlight.spec.toDOM!(
        writerSchema.marks.highlight.create({ color: "#fff0a8" }),
        true,
      ),
    ).toEqual(["span", { style: "background-color: #fff0a8" }, 0]);
  });

  it("giãn dòng, canh lề và đổi sang tiêu đề vẫn giữ thuộc tính", () => {
    const document = doc(paragraph("Xin chào"));
    let state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 2),
    });

    state = applyCommand(state, setLineHeight("1.5"));
    state = applyCommand(state, setAlign("center"));
    state = applyCommand(
      state,
      setBlock(writerSchema.nodes.heading, { level: 2 }),
    );

    const block = state.doc.firstChild;
    expect(block?.type.name).toBe("heading");
    expect(block?.attrs.level).toBe(2);
    expect(block?.attrs.lineHeight).toBe("1.5");
    expect(block?.attrs.align).toBe("center");
  });

  it("xóa định dạng ký tự và thuộc tính đoạn", () => {
    const document = writerSchema.node("doc", null, [
      writerSchema.node(
        "paragraph",
        { align: "center", lineHeight: "1.5" },
        [
          writerSchema.text("Xin", [
            writerSchema.marks.strong.create(),
            writerSchema.marks.fontSize.create({ size: "20pt" }),
          ]),
        ],
      ),
    ]);
    const state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 1, 4),
    });

    const next = applyCommand(state, clearFormatting());
    const block = next.doc.firstChild;
    expect(block?.attrs.align).toBeNull();
    expect(block?.attrs.lineHeight).toBeNull();
    expect(block?.firstChild?.marks).toHaveLength(0);
  });

  it("trả về null khi vùng chọn có cỡ chữ không đồng nhất", () => {
    const document = writerSchema.node("doc", null, [
      writerSchema.node("paragraph", null, [
        writerSchema.text("A", [
          writerSchema.marks.fontSize.create({ size: "12pt" }),
        ]),
        writerSchema.text("B", [
          writerSchema.marks.fontSize.create({ size: "14pt" }),
        ]),
      ]),
    ]);
    const state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 1, 3),
    });

    expect(
      markValue(state, writerSchema.marks.fontSize, "size"),
    ).toBeNull();
  });
});

describe("bảng, liên kết và ngắt trang trong Writer", () => {
  it("chèn bảng với số hàng/cột và đưa con trỏ vào ô đầu", () => {
    const document = doc(paragraph("Xin chào"));
    const state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 2),
    });

    const next = applyCommand(state, insertTable(3, 2));
    const table = next.doc.child(0);
    expect(table.type.name).toBe("table");
    expect(table.childCount).toBe(3);
    expect(table.child(0).childCount).toBe(2);
    expect(table.child(0).child(0).type.name).toBe("table_header");
    expect(table.child(1).child(0).type.name).toBe("table_cell");
    // Đoạn văn gốc vẫn còn nguyên.
    expect(next.doc.child(1).textContent).toBe("Xin chào");
    expect(inTable(next)).toBe(true);
  });

  it("thêm và xóa hàng trong bảng", () => {
    const document = doc(paragraph("Trước"));
    let state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 2),
    });

    state = applyCommand(state, insertTable(2, 2));
    expect(state.doc.child(0).childCount).toBe(2);

    state = applyCommand(state, tableCommands.addRowAfter);
    expect(state.doc.child(0).childCount).toBe(3);

    state = applyCommand(state, tableCommands.deleteRow);
    expect(state.doc.child(0).childCount).toBe(2);
  });

  it("gắn liên kết và từ chối URL không an toàn", () => {
    const document = doc(paragraph("Xin chào"));
    const state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 1, 4),
    });

    const linked = applyCommand(state, setLink("https://vietdesk.vn"));
    const mark = linked.doc.firstChild?.firstChild?.marks[0];
    expect(mark?.type.name).toBe("link");
    expect(mark?.attrs.href).toBe("https://vietdesk.vn");

    const rejected = applyCommand(state, setLink("javascript:alert(1)"));
    expect(rejected.doc.firstChild?.firstChild?.marks).toHaveLength(0);
  });

  it("lọc địa chỉ liên kết không an toàn", () => {
    expect(normalizeHref("https://vietdesk.vn")).toBe("https://vietdesk.vn");
    expect(normalizeHref("www.vietdesk.vn")).toBe("https://www.vietdesk.vn");
    expect(normalizeHref("mailto:info@vietdesk.vn")).toBe(
      "mailto:info@vietdesk.vn",
    );
    expect(normalizeHref("javascript:alert(1)")).toBeNull();
    expect(normalizeHref("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(normalizeHref("")).toBeNull();
  });

  it("chèn ngắt trang sau đoạn đang soạn", () => {
    const document = doc(paragraph("Một"), paragraph("Hai"));
    const state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 2),
    });

    const next = applyCommand(state, insertPageBreak());
    expect(next.doc.childCount).toBe(3);
    expect(next.doc.child(1).type.name).toBe("page_break");
    expect(next.doc.child(2).textContent).toBe("Hai");
  });

  it("chèn ngắt trang ra khỏi bảng khi con trỏ nằm trong ô", () => {
    const document = doc(paragraph("Trước"));
    let state = EditorState.create({
      schema: writerSchema,
      doc: document,
      selection: TextSelection.create(document, 2),
    });

    state = applyCommand(state, insertTable(2, 2));
    state = applyCommand(state, insertPageBreak());

    expect(state.doc.child(0).type.name).toBe("table");
    expect(state.doc.child(1).type.name).toBe("page_break");
  });

  it("render bảng và liên kết với thuộc tính an toàn", () => {
    const linkSpec = writerSchema.marks.link.spec.toDOM!(
      writerSchema.marks.link.create({ href: "https://vietdesk.vn" }),
      true,
    );
    expect(linkSpec).toEqual([
      "a",
      {
        href: "https://vietdesk.vn",
        title: null,
        rel: "noopener noreferrer",
      },
      0,
    ]);

    const table = writerSchema.nodes.table.create(null, [
      writerSchema.nodes.table_row.create(null, [
        writerSchema.nodes.table_cell.create(
          null,
          writerSchema.nodes.paragraph.create(),
        ),
      ]),
    ]);
    const tableSpec = writerSchema.nodes.table.spec.toDOM!(table) as [
      string,
      ...unknown[],
    ];
    expect(tableSpec[0]).toBe("table");
  });
});
