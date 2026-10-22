// @vitest-environment jsdom
/**
 * Kiểm thử tích hợp Writer trong jsdom: toolbar, tìm kiếm và thay thế.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WriterEditor } from "../src/editors/writer";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("WriterEditor", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<WriterEditor initialText="chào chào" />);
    });
    await flush();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("hiển thị toolbar định dạng và thống kê văn bản", () => {
    expect(
      container.querySelector('button[aria-label="Đậm (Ctrl+B)"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Danh sách gạch đầu dòng (Ctrl+Shift+8)"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Canh giữa (Ctrl+Shift+E)"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('select[aria-label="Kiểu chữ"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('select[aria-label="Cỡ chữ"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('select[aria-label="Giãn dòng"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('input[aria-label="Màu chữ"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('input[aria-label="Tô sáng"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Xóa định dạng"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("2 từ");
    expect(container.textContent).toContain("9 ký tự");
  });

  it("tìm và thay thế tất cả trong văn bản", async () => {
    const searchButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Tìm trong văn bản (Ctrl+F)"]',
    );
    expect(searchButton).not.toBeNull();

    await act(async () => {
      searchButton?.click();
    });
    await flush();

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Từ cần tìm"]',
    );
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        setInputValue(input, "chào");
      }
    });
    await flush();

    expect(
      container.querySelector(".vd-writer__search-count")?.textContent,
    ).toBe("1/2");
    expect(container.querySelectorAll(".vd-writer__match")).toHaveLength(2);

    const next = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Kết quả tiếp theo"]',
    );
    expect(next).not.toBeNull();
    await act(async () => {
      next?.click();
    });
    await flush();
    expect(
      container.querySelector(".vd-writer__search-count")?.textContent,
    ).toBe("2/2");
    expect(
      container.querySelectorAll(".vd-writer__match--active"),
    ).toHaveLength(1);

    const toggleReplace = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Bật/tắt thay thế"]',
    );
    expect(toggleReplace).not.toBeNull();
    await act(async () => {
      toggleReplace?.click();
    });
    await flush();

    const replaceAll = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Thay tất cả");
    expect(replaceAll).toBeDefined();

    await act(async () => {
      replaceAll?.click();
    });
    await flush();

    expect(container.querySelector(".ProseMirror")?.textContent).not.toContain(
      "chào",
    );
  });

  it("áp dụng cỡ chữ cho kết quả đang chọn", async () => {
    const searchButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Tìm trong văn bản (Ctrl+F)"]',
    );
    await act(async () => {
      searchButton?.click();
    });
    await flush();

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Từ cần tìm"]',
    );
    await act(async () => {
      if (input) {
        setInputValue(input, "chào");
      }
    });
    await flush();

    const close = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Đóng tìm kiếm"]',
    );
    await act(async () => {
      close?.click();
    });
    await flush();

    const sizeSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Cỡ chữ"]',
    );
    expect(sizeSelect).not.toBeNull();
    await act(async () => {
      if (sizeSelect) {
        setSelectValue(sizeSelect, "20pt");
      }
    });
    await flush();

    const span = container.querySelector(
      '.ProseMirror span[style*="font-size"]',
    );
    expect(span?.textContent).toBe("chào");
  });

  it("chèn bảng từ lưới chọn kích thước", async () => {
    const tableButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Chèn bảng"]',
    );
    expect(tableButton).not.toBeNull();

    await act(async () => {
      tableButton?.click();
    });
    await flush();

    const cells = container.querySelectorAll(".vd-writer__tablegrid button");
    expect(cells).toHaveLength(80);

    // Ô thứ 13 → hàng thứ 2, cột thứ 3.
    const cell = cells[12] as HTMLButtonElement;
    await act(async () => {
      cell.click();
    });
    await flush();

    const table = container.querySelector(".ProseMirror table");
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll("tr")).toHaveLength(2);
    expect(table?.querySelectorAll("tr")[0].querySelectorAll("th")).toHaveLength(
      3,
    );
    // Thanh công cụ ngữ cảnh của bảng xuất hiện.
    expect(
      container.querySelector(".vd-writer__toolbar-row--context"),
    ).not.toBeNull();
  });

  it("gắn và kiểm tra liên kết an toàn", async () => {
    // Chọn "chào" bằng ô tìm kiếm để có vùng chọn thật.
    const searchButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Tìm trong văn bản (Ctrl+F)"]',
    );
    await act(async () => {
      searchButton?.click();
    });
    await flush();

    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Từ cần tìm"]',
    );
    await act(async () => {
      if (searchInput) {
        setInputValue(searchInput, "chào");
      }
    });
    await flush();

    const close = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Đóng tìm kiếm"]',
    );
    await act(async () => {
      close?.click();
    });
    await flush();

    const linkButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Chèn liên kết"]',
    );
    await act(async () => {
      linkButton?.click();
    });
    await flush();

    const linkInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Địa chỉ liên kết"]',
    );
    expect(linkInput).not.toBeNull();

    // URL không an toàn phải bị từ chối.
    await act(async () => {
      if (linkInput) {
        setInputValue(linkInput, "javascript:alert(1)");
      }
    });
    await flush();
    const applyButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Chèn");
    await act(async () => {
      applyButton?.click();
    });
    await flush();
    expect(container.querySelector(".vd-writer__panel-error")).not.toBeNull();
    expect(container.querySelector(".ProseMirror a")).toBeNull();

    await act(async () => {
      if (linkInput) {
        setInputValue(linkInput, "https://vietdesk.vn");
      }
    });
    await flush();
    await act(async () => {
      applyButton?.click();
    });
    await flush();

    const anchor = container.querySelector(
      '.ProseMirror a[href="https://vietdesk.vn"]',
    );
    expect(anchor?.textContent).toBe("chào");
  });
});
