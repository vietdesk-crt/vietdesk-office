// @vitest-environment jsdom
import {
  clearLocalRecent,
  forgetFile,
  kindFromFileName,
  listRecentFiles,
  readLocalRecent,
  readRecentLimit,
  rememberFile,
  setRecentPinned,
  sortRecent,
  writeRecentLimit,
} from "@vietdesk/ipc-contract";
import type { RecentEntry } from "@vietdesk/ipc-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function entry(overrides: Partial<RecentEntry>): RecentEntry {
  return {
    id: "id",
    path: null,
    name: "tệp",
    kind: "writer",
    pinned: false,
    openedAt: 0,
    size: null,
    exists: false,
    ...overrides,
  };
}

describe("đoán loại tài liệu từ tên tệp", () => {
  it("nhận diện định dạng văn phòng", () => {
    expect(kindFromFileName("Báo cáo.docx")).toBe("writer");
    expect(kindFromFileName("Sổ lương.XLSX")).toBe("sheets");
    expect(kindFromFileName("bai-giang.pptx")).toBe("slides");
    expect(kindFromFileName("dulieu.csv")).toBe("sheets");
  });

  it("trả unknown cho định dạng lạ", () => {
    expect(kindFromFileName("anh.png")).toBe("unknown");
    expect(kindFromFileName("khong-co-duoi")).toBe("unknown");
  });
});

describe("sắp xếp danh sách gần đây", () => {
  it("ghim trước, sau đó mới nhất trước", () => {
    const sorted = sortRecent([
      entry({ id: "a", openedAt: 100 }),
      entry({ id: "b", openedAt: 300 }),
      entry({ id: "c", openedAt: 200, pinned: true }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["c", "b", "a"]);
  });
});

describe("kho lưu danh sách gần đây (chế độ trình duyệt)", () => {
  beforeEach(() => {
    clearLocalRecent();
    writeRecentLimit(20);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T09:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    clearLocalRecent();
    writeRecentLimit(20);
  });

  it("bắt đầu rỗng", async () => {
    expect(await listRecentFiles()).toEqual([]);
  });

  it("ghi nhận tệp mới và trả danh sách đã cập nhật", async () => {
    const entries = await rememberFile({
      path: "/home/an/Báo cáo.docx",
      name: "Báo cáo.docx",
      kind: "writer",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe("Báo cáo.docx");
    expect(entries[0]?.exists).toBe(true);
    expect(entries[0]?.pinned).toBe(false);
    expect(await listRecentFiles()).toHaveLength(1);
  });

  it("mở lại cùng tệp thì gộp, không nhân đôi", async () => {
    const path = "/home/an/Báo cáo.docx";
    await rememberFile({ path, name: "Báo cáo.docx", kind: "writer" });
    vi.advanceTimersByTime(60_000);
    const entries = await rememberFile({
      path,
      name: "Báo cáo.docx",
      kind: "writer",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.openedAt).toBe(Date.now());
  });

  it("giữ trạng thái ghim khi mở lại tệp", async () => {
    const path = "/home/an/Sổ lương.xlsx";
    const first = await rememberFile({ path, name: "Sổ lương.xlsx", kind: "sheets" });
    const id = first[0]?.id as string;
    await setRecentPinned(id, true);
    vi.advanceTimersByTime(1_000);
    const entries = await rememberFile({
      path,
      name: "Sổ lương.xlsx",
      kind: "sheets",
    });
    expect(entries[0]?.pinned).toBe(true);
  });

  it("ghim đưa tệp cũ lên đầu", async () => {
    await rememberFile({ path: "/a.docx", name: "a.docx", kind: "writer" });
    vi.advanceTimersByTime(1_000);
    const entries = await rememberFile({
      path: "/b.docx",
      name: "b.docx",
      kind: "writer",
    });
    const oldId = entries.find((item) => item.name === "a.docx")?.id as string;
    const pinned = await setRecentPinned(oldId, true);
    expect(pinned[0]?.name).toBe("a.docx");
  });

  it("tài liệu chưa lưu dùng id tạm và không đánh dấu tồn tại", async () => {
    const entries = await rememberFile({
      name: "Văn bản chưa đặt tên",
      kind: "writer",
    });
    expect(entries[0]?.id).toBe("unsaved:writer:Văn bản chưa đặt tên");
    expect(entries[0]?.path).toBeNull();
    expect(entries[0]?.exists).toBe(false);
  });

  it("xoá một tệp khỏi danh sách", async () => {
    const entries = await rememberFile({
      path: "/x.docx",
      name: "x.docx",
      kind: "writer",
    });
    const remaining = await forgetFile(entries[0]?.id as string);
    expect(remaining).toEqual([]);
  });

  it("giữ tối đa 20 tệp, bỏ tệp cũ nhất", async () => {
    for (let index = 0; index < 25; index += 1) {
      const name = `tệp-${index}.docx`;
      await rememberFile({ path: `/${name}`, name, kind: "writer" });
      vi.advanceTimersByTime(1_000);
    }
    const entries = await listRecentFiles();
    expect(entries).toHaveLength(20);
    expect(entries[0]?.name).toBe("tệp-24.docx");
    expect(entries.some((item) => item.name === "tệp-0.docx")).toBe(false);
  });

  it("bỏ qua dữ liệu localStorage hỏng", () => {
    localStorage.setItem("vietdesk.recent.v1", "{không phải json");
    expect(readLocalRecent()).toEqual([]);
  });

  it("tôn trọng giới hạn người dùng chọn trong Cài đặt", async () => {
    writeRecentLimit(10);
    expect(readRecentLimit()).toBe(10);

    for (let index = 0; index < 12; index += 1) {
      const name = `muc-${index}.docx`;
      await rememberFile({ path: `/${name}`, name, kind: "writer" });
      vi.advanceTimersByTime(1_000);
    }

    const entries = await listRecentFiles();
    expect(entries).toHaveLength(10);
    expect(entries.some((item) => item.name === "muc-0.docx")).toBe(false);
  });

  it("bỏ qua giới hạn không hợp lệ", () => {
    localStorage.setItem("vietdesk.recent.limit", "không-phải-số");
    expect(readRecentLimit()).toBe(20);
    writeRecentLimit(0);
    expect(readRecentLimit()).toBe(1);
  });
});
