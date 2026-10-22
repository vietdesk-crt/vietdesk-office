// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDrafts,
  draftId,
  readDrafts,
  removeDraft,
  saveDraft,
} from "../src/drafts";

const NOW = 1_700_000_000_000;

function makeDraft(id: string, updatedAt: number, name = `Tài liệu ${id}`) {
  return {
    id,
    kind: "writer" as const,
    name,
    path: null,
    content: { type: "doc", content: [] },
    updatedAt,
  };
}

describe("bản nháp tự động", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("không có bản nháp thì trả mảng rỗng", () => {
    expect(readDrafts(NOW)).toEqual([]);
  });

  it("lưu, ghi đè cùng id và sắp xếp mới nhất trước", () => {
    saveDraft(makeDraft("unsaved:writer", NOW - 1_000, "Cũ"));
    saveDraft(makeDraft("unsaved:sheets", NOW - 500));
    saveDraft(makeDraft("unsaved:writer", NOW, "Mới"));

    const drafts = readDrafts(NOW);

    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.name).toBe("Mới");
    expect(drafts[1]?.id).toBe("unsaved:sheets");
  });

  it("bỏ bản nháp quá 14 ngày", () => {
    const fifteenDays = 15 * 24 * 60 * 60 * 1000;
    saveDraft(makeDraft("quá-cũ", NOW - fifteenDays));
    saveDraft(makeDraft("còn-mới", NOW - 1_000));

    const drafts = readDrafts(NOW);

    expect(drafts.map((draft) => draft.id)).toEqual(["còn-mới"]);
  });

  it("chịu được dữ liệu hỏng trong localStorage", () => {
    localStorage.setItem("vietdesk.drafts.v1", "{không phải json");
    expect(readDrafts(NOW)).toEqual([]);

    localStorage.setItem("vietdesk.drafts.v1", JSON.stringify([{ id: 1 }]));
    expect(readDrafts(NOW)).toEqual([]);
  });

  it("xoá theo id và xoá toàn bộ", () => {
    saveDraft(makeDraft("a", NOW));
    saveDraft(makeDraft("b", NOW - 1));

    expect(removeDraft("a", NOW).map((draft) => draft.id)).toEqual(["b"]);

    clearDrafts();
    expect(readDrafts(NOW)).toEqual([]);
  });

  it("sinh id ổn định cho tài liệu chưa lưu", () => {
    expect(draftId(null, "writer")).toBe("unsaved:writer");
    expect(draftId("/tmp/a.vdx", "writer")).toBe("/tmp/a.vdx");
  });
});
