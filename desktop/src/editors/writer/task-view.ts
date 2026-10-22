/**
 * NodeView cho mục việc cần làm (`task_item`).
 *
 * Node gốc trong schema chỉ biểu diễn trạng thái tick bằng thuộc tính
 * `checked`; NodeView này dựng thêm một ô tick thật để người dùng bấm được.
 *
 * Ô tick nằm ngoài `contentDOM` nên mọi thay đổi DOM trên nó đều bị bỏ qua
 * bởi ProseMirror (`ignoreMutation`), tránh việc trình duyệt tự cập nhật
 * cây AST theo thuộc tính `checked` của HTML.
 */
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView, ViewMutationRecord } from "prosemirror-view";
import { writerSchema } from "./schema";

export class TaskItemView implements NodeView {
  dom: HTMLLIElement;
  contentDOM: HTMLDivElement;

  private readonly checkbox: HTMLInputElement;
  private node: PMNode;

  constructor(
    node: PMNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    this.node = node;

    this.dom = document.createElement("li");
    this.dom.className = "vd-writer__task";

    this.checkbox = document.createElement("input");
    this.checkbox.type = "checkbox";
    this.checkbox.className = "vd-writer__task-check";
    this.checkbox.setAttribute("aria-label", "Đánh dấu công việc đã xong");

    this.contentDOM = document.createElement("div");
    this.contentDOM.className = "vd-writer__task-content";

    this.dom.append(this.checkbox, this.contentDOM);

    // Chặn mousedown để con trỏ không nhảy ra khỏi vùng soạn thảo khi bấm ô.
    this.checkbox.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    this.checkbox.addEventListener("change", () => {
      this.toggleChecked();
    });

    this.sync(node);
  }

  update(node: PMNode): boolean {
    if (node.type !== writerSchema.nodes.task_item) {
      return false;
    }
    this.node = node;
    this.sync(node);
    return true;
  }

  /** Sự kiện phát sinh trên ô tick không thuộc phần soạn thảo. */
  stopEvent(event: Event): boolean {
    return event.target === this.checkbox;
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (mutation.type === "selection") {
      return true;
    }
    return !this.contentDOM.contains(mutation.target);
  }

  private sync(node: PMNode): void {
    const checked = Boolean(node.attrs.checked);
    if (this.checkbox.checked !== checked) {
      this.checkbox.checked = checked;
    }
    this.dom.dataset.checked = String(checked);
  }

  private toggleChecked(): void {
    const pos = this.getPos();
    if (pos === undefined) {
      return;
    }
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        checked: !this.node.attrs.checked,
      }),
    );
  }
}
