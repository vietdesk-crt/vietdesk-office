// @vitest-environment jsdom
/**
 * Smoke test cho trình soạn slide: thêm / nhân đôi / xóa / đổi thứ tự
 * và chế độ trình chiếu (vào bằng nút, thoát bằng Esc).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultSlides, SlidesEditor } from "../src/editors/slides";
import type { Slide } from "../src/editors/slides";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

function click(element: Element | null | undefined) {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("trình soạn slide", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let changes: Slide[][];

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    changes = [];
    await act(async () => {
      root.render(
        <SlidesEditor
          initialSlides={createDefaultSlides()}
          onChange={(slides) => changes.push(slides)}
        />,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  function thumbs() {
    return Array.from(
      container.querySelectorAll<HTMLElement>(".vd-slides__thumb"),
    );
  }

  function action(index: number, label: string) {
    return thumbs()[index]?.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
  }

  it("thêm slide ngay sau slide đang chọn", () => {
    expect(thumbs()).toHaveLength(2);

    click(container.querySelector(".vd-slides__add"));

    expect(thumbs()).toHaveLength(3);
    expect(thumbs()[1].querySelector(".vd-slides__thumb-title")?.textContent).toBe(
      "Tiêu đề mới",
    );
    expect(changes).toHaveLength(1);
  });

  it("nhân đôi slide giữ nguyên tiêu đề và nội dung", () => {
    click(action(0, "Nhân đôi slide"));

    expect(thumbs()).toHaveLength(3);
    expect(thumbs()[0].querySelector(".vd-slides__thumb-title")?.textContent).toBe(
      "VietDesk Office",
    );
    expect(thumbs()[1].querySelector(".vd-slides__thumb-title")?.textContent).toBe(
      "VietDesk Office",
    );
    // Bản sao vừa tạo trở thành slide đang chọn.
    expect(thumbs()[1].className).toContain("is-selected");
  });

  it("xóa slide và chọn slide kế cạnh", () => {
    click(action(0, "Xóa slide"));

    expect(thumbs()).toHaveLength(1);
    expect(thumbs()[0].querySelector(".vd-slides__thumb-title")?.textContent).toBe(
      "Vì sao VietDesk?",
    );
    expect(thumbs()[0].className).toContain("is-selected");
  });

  it("không xóa được slide cuối cùng", () => {
    click(action(0, "Xóa slide"));

    click(action(0, "Xóa slide"));

    expect(thumbs()).toHaveLength(1);
    expect(action(0, "Xóa slide")?.disabled).toBe(true);
  });

  it("đổi thứ tự slide lên và xuống", () => {
    click(action(1, "Chuyển slide lên trên"));

    expect(thumbs()[0].querySelector(".vd-slides__thumb-title")?.textContent).toBe(
      "Vì sao VietDesk?",
    );

    click(action(0, "Chuyển slide xuống dưới"));

    expect(thumbs()[0].querySelector(".vd-slides__thumb-title")?.textContent).toBe(
      "VietDesk Office",
    );
  });

  it("vào chế độ trình chiếu và thoát bằng Esc", () => {
    click(
      Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Trình chiếu"),
      ),
    );

    const overlay = document.body.querySelector(".vd-present");
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain("VietDesk Office");
    expect(overlay?.textContent).toContain("1/2");

    pressKey("Escape");

    expect(document.body.querySelector(".vd-present")).toBeNull();
  });

  it("thoát trình chiếu khi fullscreen kết thúc (Esc bị trình duyệt tiêu)", () => {
    click(
      Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Trình chiếu"),
      ),
    );
    expect(document.body.querySelector(".vd-present")).not.toBeNull();

    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(document.body.querySelector(".vd-present")).toBeNull();
  });

  it("không vào trình chiếu khi bấm Esc ngoài phiên trình chiếu", () => {
    pressKey("Escape");

    expect(document.body.querySelector(".vd-present")).toBeNull();
  });

  it("bật/tắt ghi chú diễn giả khi trình chiếu bằng phím S", () => {
    click(
      Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Trình chiếu"),
      ),
    );
    expect(document.body.querySelector(".vd-present__notes")).toBeNull();

    pressKey("s");

    const notes = document.body.querySelector(".vd-present__notes");
    expect(notes).not.toBeNull();
    expect(notes?.textContent).toContain("Chào mừng");

    pressKey("Escape");
    expect(document.body.querySelector(".vd-present")).toBeNull();
  });

  it("khung xem dùng class theo layout của slide đang chọn", () => {
    const canvas = container.querySelector(".vd-slides__canvas");
    // Slide đầu tiên mặc định là layout "title".
    expect(canvas?.className).toContain("vd-slide--title");
  });
});
