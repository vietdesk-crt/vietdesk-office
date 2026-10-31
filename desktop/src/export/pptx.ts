/**
 * Xuất tài liệu Slides sang `.pptx` (OpenXML PresentationML).
 *
 * Mở trực tiếp và tương thích chuẩn ECMA-376 / ISO/IEC 29500 (OpenXML).
 */

import { isRecord } from "@vietdesk/ipc-contract";
import { createZip, type ZipEntryInput } from "./binary";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function isPowerPointDocumentPath(path: string | null): boolean {
  return typeof path === "string" && /\.(pptx|ppt)$/i.test(path);
}

interface SlideItem {
  id?: string;
  title?: string;
  body?: string;
  background?: string | null;
}

function extractSlides(content: unknown): SlideItem[] {
  if (isRecord(content) && Array.isArray(content.slides)) {
    return content.slides.map((s, idx) => {
      if (isRecord(s)) {
        return {
          id: typeof s.id === "string" ? s.id : `slide-${idx + 1}`,
          title: typeof s.title === "string" ? s.title : `Trang chiếu ${idx + 1}`,
          body: typeof s.body === "string" ? s.body : "",
          background: typeof s.background === "string" ? s.background : null,
        };
      }
      return { id: `slide-${idx + 1}`, title: `Trang chiếu ${idx + 1}`, body: "" };
    });
  }
  return [{ id: "slide-1", title: "Trình chiếu mới", body: "Nội dung trình chiếu" }];
}

/**
 * Tạo byte tệp `.pptx` chuẩn OpenXML.
 */
export function slidesPptxBytes(content: unknown, _title?: string): Uint8Array {
  const slides = extractSlides(content);
  const slideCount = Math.max(1, slides.length);

  // 1. [Content_Types].xml
  let contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`;

  for (let i = 1; i <= slideCount; i += 1) {
    contentTypesXml += `\n  <Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  }
  contentTypesXml += `\n</Types>`;

  // 2. _rels/.rels
  const packageRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

  // 3. ppt/presentation.xml & ppt/_rels/presentation.xml.rels
  let sldIdLstXml = "";
  let presRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`;

  for (let i = 1; i <= slideCount; i += 1) {
    const rId = `rId${i + 1}`;
    sldIdLstXml += `\n    <p:sldId id="${255 + i}" r:id="${rId}"/>`;
    presRelsXml += `\n  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`;
  }
  presRelsXml += `\n</Relationships>`;

  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>${sldIdLstXml}
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;

  // 4. Slide Master & Layout
  const slideMaster1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>`;

  const slideMasterRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

  const slideLayout1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="titleAndContent">
  <p:cSld name="Title and Content">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
</p:sldLayout>`;

  const slideLayoutRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

  const entries: ZipEntryInput[] = [
    { name: "[Content_Types].xml", bytes: new TextEncoder().encode(contentTypesXml) },
    { name: "_rels/.rels", bytes: new TextEncoder().encode(packageRelsXml) },
    { name: "ppt/presentation.xml", bytes: new TextEncoder().encode(presentationXml) },
    { name: "ppt/_rels/presentation.xml.rels", bytes: new TextEncoder().encode(presRelsXml) },
    { name: "ppt/slideMasters/slideMaster1.xml", bytes: new TextEncoder().encode(slideMaster1Xml) },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", bytes: new TextEncoder().encode(slideMasterRelsXml) },
    { name: "ppt/slideLayouts/slideLayout1.xml", bytes: new TextEncoder().encode(slideLayout1Xml) },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", bytes: new TextEncoder().encode(slideLayoutRelsXml) },
  ];

  // 5. Build từng slide XML
  for (let i = 0; i < slideCount; i += 1) {
    const slide = slides[i] ?? { title: `Trang chiếu ${i + 1}`, body: "" };
    const slideNumber = i + 1;

    let bodyParasXml = "";
    const bodyLines = (slide.body ?? "").split("\n").filter((l) => l.trim().length > 0);
    if (bodyLines.length === 0) {
      bodyParasXml = `<a:p><a:r><a:rPr lang="vi-VN" sz="1800"/><a:t></a:t></a:r></a:p>`;
    } else {
      for (const line of bodyLines) {
        bodyParasXml += `\n          <a:p><a:r><a:rPr lang="vi-VN" sz="1800"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`;
      }
    }

    // Tùy chỉnh màu nền slide nếu có hex hợp lệ
    let bgXml = "";
    if (slide.background && /^#[0-9a-fA-F]{6}$/i.test(slide.background)) {
      const hex = slide.background.slice(1);
      bgXml = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></p:bgPr></p:bg>`;
    }

    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    ${bgXml}
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:cNvSpPr><p:ph type="title"/></p:cNvSpPr>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="838200" y="600000"/><a:ext cx="10515600" cy="1100000"/></a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="vi-VN" sz="3600" b="1"/>
              <a:t>${escapeXml(slide.title ?? "")}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content 2"/>
          <p:cNvSpPr><p:ph type="body" idx="1"/></p:cNvSpPr>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="838200" y="1900000"/><a:ext cx="10515600" cy="4500000"/></a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          ${bodyParasXml}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

    const slideRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

    entries.push({
      name: `ppt/slides/slide${slideNumber}.xml`,
      bytes: new TextEncoder().encode(slideXml),
    });
    entries.push({
      name: `ppt/slides/_rels/slide${slideNumber}.xml.rels`,
      bytes: new TextEncoder().encode(slideRelsXml),
    });
  }

  return createZip(entries);
}
