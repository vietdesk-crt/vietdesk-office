/**
 * Tiện ích XML dựa trên DOMParser của WebView/jsdom.
 *
 * Tệp Office là XML có namespace (w:, a:, text:…). Ta không cần namespace URI
 * — chỉ cần tên local — vì cấu trúc tài liệu là duy nhất theo tên phần tử
 * trong từng định dạng.
 */

export class OfficeXmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficeXmlError";
  }
}

/** Phân tích chuỗi XML; ném lỗi tiếng Việt khi cú pháp hỏng. */
export function parseXml(text: string, sourceName: string): Element {
  const parsed = new DOMParser().parseFromString(text, "application/xml");
  const errorNode = parsed.getElementsByTagName("parsererror")[0];
  if (errorNode) {
    throw new OfficeXmlError(`Phần ${sourceName} không phải XML hợp lệ.`);
  }
  const root = parsed.documentElement;
  if (!root) {
    throw new OfficeXmlError(`Phần ${sourceName} trống.`);
  }
  return root;
}

/** Con trực tiếp theo tên local (bỏ qua prefix namespace). */
export function child(element: Element, localName: string): Element | null {
  for (const node of element.children) {
    if (node.localName === localName) return node;
  }
  return null;
}

/** Mọi con trực tiếp theo tên local. */
export function children(element: Element, localName: string): Element[] {
  return [...element.children].filter((node) => node.localName === localName);
}

/** Con trực tiếp hoặc con của con đầu tiên — tiện cho w:pPr/w:numPr dạng gọn. */
export function descendant(element: Element, localName: string): Element | null {
  const found = element.getElementsByTagNameNS("*", localName);
  return found.length > 0 ? (found[0] as Element) : null;
}

/** Mọi hậu duệ theo tên local. */
export function descendants(element: Element, localName: string): Element[] {
  return [...element.getElementsByTagNameNS("*", localName)] as Element[];
}

/**
 * Giá trị thuộc tính theo tên local.
 * Word viết `w:val`, ODF viết `text:style-name` — so khớp localName là đủ.
 */
export function attr(element: Element, localName: string): string | null {
  for (const attribute of [...element.attributes]) {
    if (attribute.localName === localName) return attribute.value;
  }
  return null;
}

/** Văn bản thuần của phần tử, nối mọi nút con. */
export function textOf(element: Element): string {
  return element.textContent ?? "";
}
