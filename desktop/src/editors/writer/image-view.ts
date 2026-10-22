/**
 * NodeView cho ảnh chèn trong văn bản.
 *
 * Schema chỉ lưu `src` tương đối (`assets/anh.png`) hoặc data URL; NodeView
 * này đổi `src` thành URL trình duyệt hiển thị được qua `assetUrl` (trong
 * Tauri là asset protocol, ngoài Tauri giữ nguyên data URL). Ngoài ra còn cung
 * cấp chọn ảnh bằng chuột và kéo góc dưới-phải để đổi bề rộng.
 */
import { assetUrl } from "@vietdesk/ipc-contract";
import type { Node as PMNode } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import { normalizeImageSize, writerSchema } from "./schema";

/** Khoảng bề rộng hợp lệ — khớp với `normalizeImageSize`. */
const MIN_SIZE = 16;
const MAX_SIZE = 4000;

/** Bề rộng dùng khi chưa đo được gì (ảnh chưa tải xong trong môi trường test). */
const FALLBACK_WIDTH = 320;

export class ImageView implements NodeView {
  dom: HTMLSpanElement;

  private readonly img: HTMLImageElement;
  private readonly handle: HTMLSpanElement;
  private node: PMNode;

  constructor(
    node: PMNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly documentPath: string | null,
  ) {
    this.node = node;

    this.dom = document.createElement("span");
    this.dom.className = "vd-writer__image";

    this.img = document.createElement("img");
    this.img.className = "vd-writer__image-img";
    this.img.draggable = false;

    this.handle = document.createElement("span");
    this.handle.className = "vd-writer__image-handle";
    this.handle.setAttribute("aria-hidden", "true");

    this.dom.append(this.img, this.handle);

    this.dom.addEventListener("mousedown", this.onSelect);
    this.handle.addEventListener("mousedown", this.onResizeStart);

    this.sync(node);
  }

  update(node: PMNode): boolean {
    if (node.type !== writerSchema.nodes.image) {
      return false;
    }
    this.node = node;
    this.sync(node);
    return true;
  }

  selectNode(): void {
    this.dom.classList.add("is-selected");
  }

  deselectNode(): void {
    this.dom.classList.remove("is-selected");
  }

  /** Mọi tương tác chuột nằm trong NodeView — ProseMirror không can thiệp. */
  stopEvent(): boolean {
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.dom.removeEventListener("mousedown", this.onSelect);
    this.handle.removeEventListener("mousedown", this.onResizeStart);
    this.stopResizing();
  }

  private sync(node: PMNode): void {
    this.img.src = assetUrl(this.documentPath, String(node.attrs.src ?? ""));
    this.img.alt = String(node.attrs.alt ?? "");

    const width = normalizeImageSize(node.attrs.width);
    if (width) {
      this.img.setAttribute("width", String(width));
    } else {
      this.img.removeAttribute("width");
    }
    const height = normalizeImageSize(node.attrs.height);
    if (height) {
      this.img.setAttribute("height", String(height));
    } else {
      this.img.removeAttribute("height");
    }
  }

  private onSelect = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const pos = this.getPos();
    if (pos === undefined) {
      return;
    }
    this.view.dispatch(
      this.view.state.tr
        .setSelection(NodeSelection.create(this.view.state.doc, pos))
        .scrollIntoView(),
    );
    this.view.focus();
  };

  private onResizeStart = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    const startWidth = this.currentWidth();
    const startX = event.clientX;

    const onMove = (move: MouseEvent): void => {
      const width = Math.min(
        MAX_SIZE,
        Math.max(MIN_SIZE, Math.round(startWidth + (move.clientX - startX))),
      );
      const pos = this.getPos();
      if (pos === undefined) {
        return;
      }
      // Chỉ đặt bề rộng, bỏ chiều cao để trình duyệt tự giữ tỉ lệ ảnh.
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...this.node.attrs,
          width,
          height: null,
        }),
      );
    };
    const onUp = () => {
      this.stopResizing();
    };

    this.onMove = onMove;
    this.onUp = onUp;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.classList.add("vd-writer__image-resizing");
  };

  private onMove: ((move: MouseEvent) => void) | null = null;
  private onUp: (() => void) | null = null;

  private stopResizing(): void {
    if (this.onMove) {
      window.removeEventListener("mousemove", this.onMove);
      this.onMove = null;
    }
    if (this.onUp) {
      window.removeEventListener("mouseup", this.onUp);
      this.onUp = null;
    }
    document.body.classList.remove("vd-writer__image-resizing");
  }

  /** Bề rộng hiện tại để bắt đầu kéo: thuộc tính node, ảnh đã render, hoặc mặc định. */
  private currentWidth(): number {
    const attr = normalizeImageSize(this.node.attrs.width);
    if (attr) {
      return attr;
    }
    const rendered = this.img.getBoundingClientRect().width;
    if (rendered >= MIN_SIZE) {
      return Math.round(rendered);
    }
    return FALLBACK_WIDTH;
  }
}
