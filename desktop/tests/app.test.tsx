// @vitest-environment jsdom
/**
 * Smoke test: mount thật toàn bộ vỏ ứng dụng trong jsdom.
 *
 * Trọng tâm là luồng người dùng ở trang chủ: tạo mới, chuyển ứng dụng, và
 * thấy tài liệu vừa tạo xuất hiện trong danh sách gần đây.
 */
import { clearLocalRecent } from "@vietdesk/ipc-contract";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";

declare global {
  // React 18 cần cờ này để `act` hoạt động đúng trong môi trường test.
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("vỏ ứng dụng", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    clearLocalRecent();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
    await flush();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    clearLocalRecent();
  });

  function buttonByText(selector: string, text: string) {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>(selector),
    ).find((button) => button.textContent?.includes(text));
  }

  it("mở ở trang chủ với ba lựa chọn tạo mới", () => {
    const text = container.textContent ?? "";
    expect(text).toContain("VietDesk");
    expect(text).toContain("Tạo mới");
    expect(text).toContain("Gần đây");
    expect(text).toContain("Văn bản");
    expect(text).toContain("Bảng tính");
    expect(text).toContain("Trình chiếu");

    expect(container.querySelectorAll(".vd-card")).toHaveLength(3);
    // Chạy ngoài Tauri nên phải rơi vào fallback, không treo ở "Đang kiểm tra".
    expect(text).toContain("Bản web (fallback)");
  });

  it("tạo văn bản mới và mount trình soạn thảo", async () => {
    const card = container.querySelector<HTMLButtonElement>(".vd-card.is-writer");
    expect(card).not.toBeNull();

    await act(async () => {
      card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector(".vd-writer__surface")).not.toBeNull();
    const tabName = container.querySelector<HTMLInputElement>(
      ".vd-tab.is-active .vd-tab__name",
    );
    expect(tabName).not.toBeNull();
    expect(tabName?.value).toBe("Văn bản chưa đặt tên");
  });

  it("chuyển sang Sheets bằng rail và hiển thị lưới", async () => {
    const railItem = buttonByText(".vd-rail__item", "Sheets");
    expect(railItem).toBeDefined();

    await act(async () => {
      railItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector(".vd-sheets__grid")).not.toBeNull();
    expect(container.querySelectorAll(".vd-sheets__grid tbody tr")).toHaveLength(15);
  });

  it("tài liệu vừa tạo xuất hiện trong danh sách gần đây", async () => {
    const card = container.querySelector<HTMLButtonElement>(".vd-card.is-sheets");
    await act(async () => {
      card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    // Rail ẩn khi đang ở trình soạn — về trang chủ bằng nút trên header.
    const homeButton = container.querySelector<HTMLButtonElement>(".vd-app__crumb");
    await act(async () => {
      homeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const names = Array.from(
      container.querySelectorAll(".vd-recent__name"),
    ).map((node) => node.textContent);
    expect(names).toContain("Bảng tính chưa đặt tên");
    expect(container.textContent).toContain("Chưa lưu vào đĩa");
  });

  it("mở được bảng công cụ tiếng Việt", async () => {
    const card = container.querySelector<HTMLButtonElement>(".vd-card.is-writer");
    await act(async () => {
      card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const toolsButton = container.querySelector<HTMLButtonElement>(
      '.vd-actions__btn[aria-label="Công cụ tiếng Việt"]',
    );
    expect(toolsButton).not.toBeNull();

    await act(async () => {
      toolsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector(".vd-tools")).not.toBeNull();
  });

  it("mở Cài đặt và kiểm tra giao diện sáng", async () => {
    const settingsItem = buttonByText(".vd-rail__item", "Cài đặt");
    expect(settingsItem).toBeDefined();

    await act(async () => {
      settingsItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector(".vd-settings")).not.toBeNull();
    expect(container.textContent).toContain("Giao diện");
    expect(container.textContent).toContain("Tệp gần đây");
    expect(container.textContent).toContain("Tiếng Việt");

    const lightButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".vd-theme-option"),
    ).find(
      (button) =>
        button.querySelector(".vd-theme-option__label")?.textContent?.trim() ===
        "Sáng",
    );
    expect(lightButton).toBeDefined();

    await act(async () => {
      lightButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("vietdesk-theme")).toBe("light");
  });

  it("đổi số tệp gần đây tối đa trong Cài đặt", async () => {
    const settingsItem = buttonByText(".vd-rail__item", "Cài đặt");
    await act(async () => {
      settingsItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const tenButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".vd-segmented__item"),
    ).find((button) => button.textContent?.trim() === "10");
    expect(tenButton).toBeDefined();

    await act(async () => {
      tenButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(localStorage.getItem("vietdesk.recent.limit")).toBe("10");
    expect(tenButton?.getAttribute("aria-checked")).toBe("true");
  });

  it("bật nút Lưu cho tài liệu mới và đánh dấu khi sửa tên", async () => {
    const card = container.querySelector<HTMLButtonElement>(".vd-card.is-writer");
    await act(async () => {
      card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector(".vd-ribbon")).toBeNull();

    const saveButton = container.querySelector<HTMLButtonElement>(
      '.vd-actions__btn[aria-label="Lưu tài liệu"]',
    );
    expect(saveButton).not.toBeNull();
    expect(saveButton?.disabled).toBe(false);

    const title = container.querySelector<HTMLInputElement>(
      ".vd-tab.is-active .vd-tab__name",
    );
    expect(title).not.toBeNull();
    expect(container.querySelector(".vd-tab__dirty")).toBeNull();

    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(title, "Báo cáo mới");

    await act(async () => {
      title?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector(".vd-tab__dirty")).not.toBeNull();
  });

  it("mở tệp OOXML thì không cho chỉnh sửa và giải thích rõ", async () => {
    // Trình duyệt: mô phỏng chọn tệp qua input ẩn.
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    const file = new File(["nội dung gốc"], "Bao-cao.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector(".vd-unavailable")).not.toBeNull();
    expect(container.textContent).toContain("Định dạng này chưa đọc được");
    expect(container.textContent).toContain("Tệp gốc trên đĩa không bị thay đổi");
  });

  it("khôi phục bản nháp chưa lưu từ trang chủ", async () => {
    const draft = {
      id: "unsaved:writer",
      kind: "writer",
      name: "Bản nháp cũ",
      path: null,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Nội dung nháp" }],
          },
        ],
      },
      updatedAt: Date.now(),
    };
    localStorage.setItem("vietdesk.drafts.v1", JSON.stringify([draft]));

    // Render lại để App đọc bản nháp lúc khởi động.
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
    await flush();

    expect(container.textContent).toContain("Bản nháp chưa lưu");
    expect(container.textContent).toContain("Bản nháp cũ");

    const restoreButton = buttonByText(".vd-draft__actions .vd-button", "Khôi phục");
    expect(restoreButton).toBeDefined();

    await act(async () => {
      restoreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const title = container.querySelector<HTMLInputElement>(
      ".vd-tab.is-active .vd-tab__name",
    );
    expect(title?.value).toBe("Bản nháp cũ");
    expect(
      container.querySelector(".vd-writer__surface .ProseMirror")?.textContent,
    ).toContain("Nội dung nháp");
    expect(container.querySelector(".vd-tab__dirty")).not.toBeNull();
  });
});
