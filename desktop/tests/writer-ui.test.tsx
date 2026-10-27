// @vitest-environment jsdom
/**
 * Kiểm thử tích hợp Writer trong jsdom: toolbar, tìm kiếm và thay thế.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ASSET_BYTES } from "@vietdesk/ipc-contract";
import { WriterEditor } from "../src/editors/writer";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

if (typeof Range !== "undefined") {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = function () {
      return [] as unknown as DOMRectList;
    };
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = function () {
      return {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect;
    };
  }
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

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
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
    expect(
      container.querySelector('button[aria-label="Dán (Ctrl+V)"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Cắt (Ctrl+X)"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Chép (Ctrl+C)"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Hiện/ẩn dấu đoạn ¶"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        'button[aria-label="Sắp xếp đoạn văn A→Z (chọn từ hai đoạn trở lên)"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('select[aria-label="Đổi chữ hoa/thường"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Tìm và thay thế (Ctrl+H)"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Chọn tất cả (Ctrl+A)"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        'button[aria-label="Dán không định dạng (Ctrl+Shift+V)"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Chép toàn bộ văn bản"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Đoạn văn thường"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Chèn ngày tháng"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Chèn ký hiệu"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Xuất Word (.docx)"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Xuất văn bản (.txt)"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("2 từ");
    expect(container.textContent).toContain("9 ký tự");
  });

  it("đổi nhanh đoạn văn thành tiêu đề bằng nút H1–H3", async () => {
    const h1 = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Tiêu đề 1"]',
    );
    expect(h1).not.toBeNull();

    await act(async () => {
      h1?.click();
    });
    await flush();

    expect(container.querySelector(".ProseMirror h1")?.textContent).toBe(
      "chào chào",
    );
    expect(h1?.getAttribute("aria-pressed")).toBe("true");

    const h2 = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Tiêu đề 2"]',
    );
    await act(async () => {
      h2?.click();
    });
    await flush();

    expect(container.querySelector(".ProseMirror h1")).toBeNull();
    expect(container.querySelector(".ProseMirror h2")?.textContent).toBe(
      "chào chào",
    );
  });

  it("chèn ngày tháng và ký hiệu tại con trỏ", async () => {
    const dateButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Chèn ngày tháng"]',
    );
    await act(async () => {
      dateButton?.click();
    });
    await flush();

    const dateChoice = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        ".vd-writer__panel-action",
      ),
    ).find((button) => /^\d{2}\/\d{2}\/\d{4}$/.test(button.textContent ?? ""));
    expect(dateChoice).toBeDefined();

    await act(async () => {
      dateChoice?.click();
    });
    await flush();

    expect(container.querySelector(".ProseMirror")?.textContent).toMatch(
      /\d{2}\/\d{2}\/\d{4}/,
    );

    const symbolButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Chèn ký hiệu"]',
    );
    await act(async () => {
      symbolButton?.click();
    });
    await flush();

    const symbol = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Chèn ký hiệu ₫"]',
    );
    expect(symbol).not.toBeNull();
    await act(async () => {
      symbol?.click();
    });
    await flush();

    expect(container.querySelector(".ProseMirror")?.textContent).toContain("₫");
  });

  it("bật/tắt số trang và mở bảng thống kê tài liệu", async () => {
    const pageToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hiện/ẩn số trang"]',
    );
    expect(pageToggle?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      pageToggle?.click();
    });
    await flush();

    expect(pageToggle?.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector(".vd-writer__page-number")).toBeNull();

    const statsToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Thống kê tài liệu"]',
    );
    await act(async () => {
      statsToggle?.click();
    });
    await flush();

    const panel = container.querySelector(".vd-writer__stats");
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Số từ2");
    expect(panel?.textContent).toContain("Ký tự (có dấu cách)9");
    expect(panel?.textContent).toContain("Ký tự (không dấu cách)8");
    expect(panel?.textContent).toContain("Đoạn văn1");
    expect(panel?.textContent).toContain("Thời gian đọc1 phút");
  });

  it("bật lớp hiển thị dấu đoạn ¶ trên trang", async () => {
    const marksButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hiện/ẩn dấu đoạn ¶"]',
    );
    expect(marksButton).not.toBeNull();
    expect(container.querySelector(".vd-writer")?.className).not.toContain(
      "is-show-marks",
    );

    await act(async () => {
      marksButton?.click();
    });
    await flush();

    expect(container.querySelector(".vd-writer")?.className).toContain(
      "is-show-marks",
    );
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

  it("mở bảng điều hướng cấu trúc và nhảy tới tiêu đề", async () => {
    const outlineContainer = document.createElement("div");
    document.body.appendChild(outlineContainer);
    const outlineRoot = createRoot(outlineContainer);
    await act(async () => {
      outlineRoot.render(
        <WriterEditor
          initialContent={{
            type: "doc",
            content: [
              {
                type: "heading",
                attrs: { level: 1 },
                content: [{ type: "text", text: "Mở đầu" }],
              },
              {
                type: "paragraph",
                content: [{ type: "text", text: "Nội dung" }],
              },
              {
                type: "heading",
                attrs: { level: 2 },
                content: [{ type: "text", text: "Chương 1" }],
              },
            ],
          }}
        />,
      );
    });
    await flush();

    const toggle = outlineContainer.querySelector<HTMLButtonElement>(
      'button[aria-label="Bảng điều hướng cấu trúc tài liệu"]',
    );
    expect(toggle).not.toBeNull();

    await act(async () => {
      toggle?.click();
    });
    await flush();

    const outline = outlineContainer.querySelector(".vd-writer__outline");
    expect(outline).not.toBeNull();
    const items = outline?.querySelectorAll("button") ?? [];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe("Mở đầu");
    expect(items[1].textContent).toBe("Chương 1");

    await act(async () => {
      items[1].click();
    });
    await flush();

    // Con trỏ đã nhảy vào tiêu đề "Chương 1".
    const heading = outlineContainer.querySelectorAll(".ProseMirror h2");
    expect(heading).toHaveLength(1);
    expect(heading[0].textContent).toBe("Chương 1");

    await act(async () => {
      outlineRoot.unmount();
    });
    outlineContainer.remove();
  });

  it("sửa đầu trang, chân trang và hiển thị số trang", async () => {
    const changes: unknown[] = [];
    const pageContainer = document.createElement("div");
    document.body.appendChild(pageContainer);
    const pageRoot = createRoot(pageContainer);
    await act(async () => {
      pageRoot.render(
        <WriterEditor
          initialText="chào chào"
          onChange={({ doc }) => changes.push(doc)}
        />,
      );
    });
    await flush();

    const toggle = pageContainer.querySelector<HTMLButtonElement>(
      'button[aria-label="Đầu trang và chân trang"]',
    );
    await act(async () => {
      toggle?.click();
    });
    await flush();

    const headerInput = pageContainer.querySelector<HTMLInputElement>(
      'input[aria-label="Nội dung đầu trang"]',
    );
    expect(headerInput).not.toBeNull();

    await act(async () => {
      if (headerInput) {
        setInputValue(headerInput, "BÁO CÁO THƯỜNG NIÊN");
      }
    });
    await flush();

    expect(
      pageContainer.querySelector(".vd-writer__page-header")?.textContent,
    ).toBe("BÁO CÁO THƯỜNG NIÊN");
    expect(
      pageContainer.querySelector(".vd-writer__page-number")?.textContent,
    ).toContain("Trang 1 / 1");

    // Cấu hình trang phải được gửi ra ngoài để lưu xuống tệp .vdx.
    const last = changes.at(-1) as { pageSetup?: unknown } | undefined;
    expect(last?.pageSetup).toMatchObject({
      header: "BÁO CÁO THƯỜNG NIÊN",
      showPageNumbers: true,
    });

    await act(async () => {
      pageRoot.unmount();
    });
    pageContainer.remove();
  });

  it("dựng bản in rồi gọi hộp thoại in của hệ điều hành", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="In (Ctrl+P)"]',
    );
    expect(button).not.toBeNull();

    await act(async () => {
      button?.click();
    });
    await flush();

    expect(print).toHaveBeenCalledTimes(1);
    const root = document.querySelector(".vd-print-root");
    expect(root).not.toBeNull();
    expect(root?.querySelectorAll(".vd-print-page").length).toBe(1);
    expect(
      root?.querySelector(".vd-writer__page-body")?.textContent,
    ).toContain("chào");

    document.querySelector(".vd-print-root")?.remove();
    print.mockRestore();
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

  it("bật theo dõi thay đổi rồi xoá chữ sẽ tạo vùng chữ bị đánh dấu", async () => {
    const toggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Theo dõi thay đổi"]',
    );
    expect(toggle).not.toBeNull();

    await act(async () => {
      toggle?.click();
    });
    await flush();

    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Theo dõi thay đổi"]',
      )?.getAttribute("aria-pressed"),
    ).toBe("true");

    // Bôi đen "chào" để có vùng chọn thật.
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

    // Xoá vùng đang chọn — chữ không biến mất mà được đánh dấu là bớt.
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).not.toBeNull();
    await act(async () => {
      surface?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Backspace",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();

    expect(
      container.querySelector(".ProseMirror .vd-change--deletion"),
    ).not.toBeNull();
    expect(container.querySelector(".ProseMirror")?.textContent).toBe(
      "chào chào",
    );

    // Nút duyệt thay đổi xuất hiện; bấm "chấp nhận" thì chữ bị xoá mới mất.
    const acceptAll = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Chấp nhận mọi thay đổi"]',
    );
    expect(acceptAll).not.toBeNull();
    await act(async () => {
      acceptAll?.click();
    });
    await flush();

    expect(container.querySelector(".ProseMirror")?.textContent).toBe(" chào");
    expect(
      container.querySelector(".ProseMirror .vd-change--deletion"),
    ).toBeNull();
  });

  it("mở bảng bình luận, gửi bình luận và xoá bình luận", async () => {
    const changes: unknown[] = [];
    const commentContainer = document.createElement("div");
    document.body.appendChild(commentContainer);
    const commentRoot = createRoot(commentContainer);
    await act(async () => {
      commentRoot.render(
        <WriterEditor
          initialText="chào chào"
          onChange={({ doc }) => changes.push(doc)}
        />,
      );
    });
    await flush();

    // Bôi đen "chào" bằng ô tìm kiếm để có vùng chọn thật.
    const searchButton = commentContainer.querySelector<HTMLButtonElement>(
      'button[aria-label="Tìm trong văn bản (Ctrl+F)"]',
    );
    await act(async () => {
      searchButton?.click();
    });
    await flush();
    const searchInput = commentContainer.querySelector<HTMLInputElement>(
      'input[aria-label="Từ cần tìm"]',
    );
    await act(async () => {
      if (searchInput) {
        setInputValue(searchInput, "chào");
      }
    });
    await flush();
    const close = commentContainer.querySelector<HTMLButtonElement>(
      'button[aria-label="Đóng tìm kiếm"]',
    );
    await act(async () => {
      close?.click();
    });
    await flush();

    const commentButton = commentContainer.querySelector<HTMLButtonElement>(
      'button[aria-label="Bình luận"]',
    );
    expect(commentButton).not.toBeNull();
    await act(async () => {
      commentButton?.click();
    });
    await flush();

    const textarea = commentContainer.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Nội dung bình luận"]',
    );
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (textarea) {
        setTextareaValue(textarea, "Cần sửa lại câu này");
      }
    });
    await flush();

    const send = Array.from(
      commentContainer.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Gửi");
    expect(send).toBeDefined();
    await act(async () => {
      send?.click();
    });
    await flush();

    // Bình luận xuất hiện trong bảng bên cạnh và được ghim vào văn bản.
    expect(
      commentContainer.querySelector(".vd-writer__comment-text")?.textContent,
    ).toBe("Cần sửa lại câu này");
    expect(
      commentContainer.querySelector(".ProseMirror .vd-comment-anchor"),
    ).not.toBeNull();

    // Danh sách bình luận phải được gửi ra ngoài để lưu xuống tệp .vdx.
    const last = changes.at(-1) as { comments?: unknown[] } | undefined;
    expect(last?.comments).toHaveLength(1);

    const remove = commentContainer.querySelector<HTMLButtonElement>(
      ".vd-writer__comment-delete",
    );
    expect(remove).not.toBeNull();
    await act(async () => {
      remove?.click();
    });
    await flush();

    expect(
      commentContainer.querySelector(".vd-writer__comment-text"),
    ).toBeNull();
    expect(
      commentContainer.querySelector(".ProseMirror .vd-comment-anchor"),
    ).toBeNull();

    await act(async () => {
      commentRoot.unmount();
    });
    commentContainer.remove();
  });

  it("chèn ảnh qua hộp thoại tệp của trình duyệt", async () => {
    const imageButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Chèn ảnh"]',
    );
    expect(imageButton).not.toBeNull();

    // Trình duyệt (không phải Tauri): nút mở hộp thoại tệp ẩn.
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Chọn tệp ảnh"]',
    );
    expect(input).not.toBeNull();

    // Giả lập người dùng chọn tệp — ảnh được nhúng thành data URL.
    const file = new File([new Uint8Array([137, 80, 78, 71])], "bieu-do.png", {
      type: "image/png",
    });
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // FileReader là async task thật (không phải microtask) — chờ tới khi ảnh
    // được chèn thay vì chỉ giải một lượt microtask.
    let image: HTMLImageElement | null = null;
    for (let attempt = 0; attempt < 50 && !image; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      image = container.querySelector<HTMLImageElement>(
        ".ProseMirror .vd-writer__image-img",
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toContain("data:image/png;base64,");
    expect(image?.getAttribute("alt")).toBe("bieu-do.png");
  });

  it("từ chối ảnh vượt quá 16 MB và hiện cảnh báo", async () => {
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Chọn tệp ảnh"]',
    );
    expect(input).not.toBeNull();

    const big = new File([new Uint8Array(1)], "anh-to.png", {
      type: "image/png",
    });
    Object.defineProperty(big, "size", { value: MAX_ASSET_BYTES + 1 });
    Object.defineProperty(input, "files", {
      value: [big],
      configurable: true,
    });

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "16 MB",
    );
    expect(container.querySelector(".ProseMirror .vd-writer__image")).toBeNull();
  });
});
