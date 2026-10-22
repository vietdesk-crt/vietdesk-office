/**
 * Chuyển `.pptx` (PowerPoint / Google Slides / LibreOffice Impress) sang nội
 * dung Slides `{ slides: [{ id, title, body }] }`.
 *
 * Mô hình Slides của VietDesk là tiêu đề + nhiều dòng chữ, nên chỉ trích văn
 * bản: hình dạng có placeholder kiểu title/ctrTitle làm tiêu đề, các hình còn
 * lại (và bảng) ghép thành body theo thứ tự xuất hiện. Mất hiệu ứng, ảnh, ô
 * văn bản định dạng chi tiết.
 */

import { entryText, type ZipArchive } from "./zip";
import { attr, child, children, parseXml } from "./xml";

const TITLE_TYPES = new Set(["title", "ctrTitle"]);

/** Văn bản của một a:p (nối các a:r/a:t), bỏ khoảng trắng hoàn toàn. */
function paragraphText(paragraph: Element): string {
  const texts = [...paragraph.getElementsByTagNameNS("*", "t")];
  return texts.map((node) => node.textContent ?? "").join("").trim();
}

/** Mọi đoạn văn bản của một shape (txBody), giữ thứ tự. */
function shapeText(shape: Element): string[] {
  const body = child(shape, "txBody");
  if (!body) return [];
  const paragraphs = children(body, "p")
    .map(paragraphText)
    .filter((text) => text.length > 0);
  if (paragraphs.length > 0) return paragraphs;

  const table = child(body, "tbl");
  if (!table) return [];
  // Bảng trong slide: mỗi hàng một dòng, ô cách bằng " | ".
  const lines: string[] = [];
  for (const row of children(table, "tr")) {
    const cells = children(row, "tc").map((cell) =>
      children(cell, "p")
        .map(paragraphText)
        .filter((text) => text.length > 0)
        .join(" "),
    );
    const joined = cells.filter((text) => text.length > 0).join(" | ");
    if (joined) lines.push(joined);
  }
  return lines;
}

function isTitleShape(shape: Element): boolean {
  const placeholder = descendantPlaceholder(shape);
  return placeholder !== null && TITLE_TYPES.has(attr(placeholder, "type") ?? "");
}

function descendantPlaceholder(shape: Element): Element | null {
  const found = shape.getElementsByTagNameNS("*", "ph");
  return found.length > 0 ? (found[0] as Element) : null;
}

/**
 * Thứ tự slide theo presentation.xml (sldIdLst) — rels cho biết tệp slide.
 * Không đọc được thìfallback sắp xếp theo số trong tên tệp.
 */
function slidePaths(zip: ZipArchive): string[] {
  const presentation = zip.readOptional("ppt/presentation.xml");
  const rels = zip.readOptional("ppt/_rels/presentation.xml.rels");

  if (presentation && rels) {
    const relationshipMap = new Map<string, string>();
    const relsRoot = parseXml(entryText(rels), "presentation.xml.rels");
    for (const rel of [...relsRoot.getElementsByTagNameNS("*", "Relationship")]) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      if (id && target) {
        relationshipMap.set(id, target.replace(/^\.?\//, "").replace(/^ppt\//, ""));
      }
    }

    const root = parseXml(entryText(presentation), "ppt/presentation.xml");
    const list = child(root, "sldIdLst");
    if (list) {
      const paths: string[] = [];
      for (const entry of children(list, "sldId")) {
        const id = entry.getAttribute("r:id");
        const target = id ? relationshipMap.get(id) : undefined;
        if (target) paths.push(target);
      }
      const resolved = paths.map((path) => `ppt/${path}`);
      if (resolved.every((path) => zip.has(path))) {
        return resolved;
      }
    }
  }

  const listed = zip
    .list("ppt/slides/slide")
    .filter((path) => path.endsWith(".xml"))
    .sort((a, b) => {
      const number = (name: string) => Number(/slide(\d+)\.xml$/.exec(name)?.[1] ?? 0);
      return number(a) - number(b);
    });
  if (listed.length === 0) {
    throw new Error("Tệp trình chiếu không có trang nào.");
  }
  return listed;
}

/** Chuyển .pptx thành `{ slides }` của Slides. */
export function convertPptx(zip: ZipArchive): {
  slides: { id: string; title: string; body: string }[];
} {
  const slides: { id: string; title: string; body: string }[] = [];
  let index = 0;

  for (const path of slidePaths(zip)) {
    index += 1;
    const entry = zip.read(path);
    const root = parseXml(entryText(entry), path);
    const shapes = [...root.getElementsByTagNameNS("*", "sp")] as Element[];

    const titleLines: string[] = [];
    const bodyLines: string[] = [];
    for (const shape of shapes) {
      const lines = shapeText(shape);
      if (lines.length === 0) continue;
      if (titleLines.length === 0 && isTitleShape(shape)) {
        titleLines.push(...lines);
      } else {
        bodyLines.push(...lines);
      }
    }

    slides.push({
      id: `slide-import-${index}`,
      title: titleLines[0] ?? bodyLines.shift() ?? `Trang chiếu ${index}`,
      body: bodyLines.join("\n"),
    });
  }

  if (slides.length === 0) {
    throw new Error("Tệp trình chiếu không có trang nào.");
  }
  return { slides };
}
