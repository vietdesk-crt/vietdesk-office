// @vitest-environment jsdom
/**
 * Kiểm thử dựng bản in cho Writer.
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildPrintRoot,
  forcedBreakIndexes,
  planPages,
  printDocument,
} from "../src/editors/writer/print";

function block(text: string, className = ""): HTMLElement {
  const element = document.createElement("p");
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  return element;
}

describe("chia trang cho bản in", () => {
  it("chia khối thành các trang theo chiều cao trang", () => {
    expect(planPages([60, 60, 40], 100)).toEqual([[0], [1, 2]]);
    expect(planPages([40, 40, 40, 40], 100)).toEqual([[0, 1], [2, 3]]);
  });

  it("tôn trọng ngắt trang tay", () => {
    expect(planPages([10, 10], 100, [1])).toEqual([[0], [1]]);
    const blocks = [block("Một"), block("Ngắt", "vd-page-break")];
    expect(forcedBreakIndexes(blocks)).toEqual([1]);
  });

  it("tài liệu trống vẫn in một trang", () => {
    expect(planPages([], 100)).toEqual([[]]);
  });
});

describe("dựng cây DOM của bản in", () => {
  it("mỗi trang có đầu trang, chân trang và số trang riêng", () => {
    const root = buildPrintRoot([block("Một"), block("Hai")], [[0], [1]], {
      header: "BÁO CÁO THƯỜNG NIÊN",
      footer: "Ngày cấp phép",
      showPageNumbers: true,
    });

    const pages = root.querySelectorAll(".vd-print-page");
    expect(pages).toHaveLength(2);
    expect(
      pages[0].querySelector(".vd-writer__page-header")?.textContent,
    ).toBe("BÁO CÁO THƯỜNG NIÊN");
    expect(
      pages[0].querySelector(".vd-writer__page-footer-text")?.textContent,
    ).toBe("Ngày cấp phép");
    expect(pages[0].querySelector(".vd-writer__page-number")?.textContent).toBe(
      "Trang 1 / 2",
    );
    expect(pages[1].querySelector(".vd-writer__page-number")?.textContent).toBe(
      "Trang 2 / 2",
    );
    expect(pages[0].querySelector(".vd-writer__page-body")?.textContent).toBe(
      "Một",
    );
    expect(pages[1].querySelector(".vd-writer__page-body")?.textContent).toBe(
      "Hai",
    );
  });

  it("ẩn số trang khi không bật", () => {
    const root = buildPrintRoot([block("Một")], [[0]], {
      header: "",
      footer: "",
      showPageNumbers: false,
    });
    expect(root.querySelector(".vd-writer__page-number")).toBeNull();
  });

  it("bỏ tô sáng kết quả tìm kiếm và khoá ô tick trong bản in", () => {
    const highlighted = block("chào");
    highlighted.className = "vd-writer__match vd-writer__match--active";
    const task = document.createElement("li");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = true;
    task.appendChild(box);

    const root = buildPrintRoot([highlighted, task], [[0, 1]], {
      header: "",
      footer: "",
      showPageNumbers: false,
    });

    const clone = root.querySelector(".vd-writer__page-body")!;
    expect(clone.querySelector(".vd-writer__match")).toBeNull();
    const clonedBox = clone.querySelector("input")!;
    expect(clonedBox.hasAttribute("disabled")).toBe(true);
    expect((clonedBox as HTMLInputElement).checked).toBe(true);
  });
});

describe("in tài liệu", () => {
  it("dựng bản in, gọi hộp thoại in và đặt tên tệp theo tên tài liệu", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const previousTitle = document.title;
    const surface = document.createElement("div");
    surface.append(block("Nội dung"));

    const pages = printDocument({
      surface,
      header: "",
      footer: "",
      showPageNumbers: true,
      title: "Báo cáo tháng",
    });

    expect(pages).toBe(1);
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".vd-print-root")).not.toBeNull();
    expect(document.title).toBe("Báo cáo tháng");

    document.querySelector(".vd-print-root")?.remove();
    document.title = previousTitle;
    print.mockRestore();
  });
});
