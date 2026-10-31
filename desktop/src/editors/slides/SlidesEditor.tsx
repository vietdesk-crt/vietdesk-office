import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Play, Sparkles, Printer, Plus } from "lucide-react";
import {
  SLIDE_LAYOUTS,
  SLIDE_THEMES,
  SLIDE_TRANSITIONS,
  createDefaultSlides,
  createSlideId,
  slideBodyLines,
  slideFromFrameLayout,
} from "./model";
import type { Slide, SlideLayout, SlideTransition } from "./model";
import {
  autoFrameLayoutFromMarkdown,
  layoutSlideBlocks,
  parseMarkdownToAST,
} from "./autoframing";
import type { ASTBlock, AutoFrameLayoutResult, SlideArchetype } from "./autoframing";

export interface SlidesEditorProps {
  /** Danh sách slide đã lưu trong tệp `.vdx`. */
  initialSlides?: Slide[];
  /** Gọi sau mỗi thay đổi để vỏ ứng dụng đánh dấu "chưa lưu" và tự lưu. */
  onChange?: (slides: Slide[]) => void;
  title?: string;
  documentPath?: string | null;
  saveStatus?: string;
  dirty?: boolean;
}

const LAYOUT_LABELS: Record<SlideLayout, string> = {
  title: "Slide tiêu đề",
  "title-content": "Tiêu đề và nội dung",
  section: "Ngăn cách",
  "title-only": "Chỉ tiêu đề",
  blank: "Trống",
};

const TRANSITION_LABELS: Record<SlideTransition, string> = {
  fade: "Mờ dần (Fade)",
  slide: "Trượt ngang (Slide)",
  zoom: "Thu phóng (Zoom)",
  none: "Không hiệu ứng",
};

function backgroundStyle(slide: Slide): CSSProperties {
  if (!slide.background) return {};
  // Tự động đảo màu chữ theo độ sáng nền để đảm bảo độ tương phản cao.
  return { background: slide.background, color: readableTextColor(slide.background) };
}

function hexChannels(color: string): number[] {
  const hex = color.slice(1);
  const full =
    hex.length <= 4
      ? hex
          .slice(0, 3)
          .split("")
          .map((c) => parseInt(c + c, 16))
      : [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return full.slice(0, 3).map((value) => (Number.isFinite(value) ? value : 0));
}

function readableTextColor(color: string): string {
  const [red, green, blue] = hexChannels(color);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance < 0.55 ? "#f7f7f5" : "#1a1a1a";
}

interface SlideTableData {
  headers: string[];
  rows: string[][];
  hasOverflowLink?: boolean;
  overflowLabel?: string;
}

function AutoFrameView({ layout }: { layout: AutoFrameLayoutResult }) {
  const { archetype, elements } = layout;

  if (archetype === "HERO_STATEMENT") {
    const heading = elements.find((el) => el.type === "heading");
    const text = elements.find((el) => el.type === "text");
    return (
      <div className="vd-autoframing-hero" data-archetype={archetype}>
        <div className="vd-autoframing-hero__title">
          {heading?.content || "(Chưa đặt tiêu đề)"}
        </div>
        {text ? (
          <div className="vd-autoframing-hero__subtitle">{text.content}</div>
        ) : null}
      </div>
    );
  }

  if (archetype === "SPLIT_TWO_COLUMN") {
    const heading = elements.find((el) => el.type === "heading");
    const textEl = elements.find((el) => el.type === "text" && el.x < 900);
    const rightEl = elements.find((el) => el.x >= 900);
    let tableData: SlideTableData | null = null;
    if (rightEl?.type === "table" && rightEl.metadata) {
      tableData = rightEl.metadata as unknown as SlideTableData;
    }

    return (
      <div className="vd-autoframing-split" data-archetype={archetype}>
        {heading ? (
          <div className="vd-autoframing-heading">{heading.content}</div>
        ) : null}
        <div className="vd-autoframing-split__columns">
          <div className="vd-autoframing-split__col-left">
            {textEl?.content}
          </div>
          <div className="vd-autoframing-split__col-right">
            {tableData ? (
              <div className="vd-autoframing-table-wrap">
                <table className="vd-autoframing-table">
                  <thead>
                    <tr>
                      {tableData.headers.map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tableData.hasOverflowLink ? (
                  <div className="vd-autoframing-overflow-link">
                    {tableData.overflowLabel || "Xem bảng dữ liệu chi tiết trên Sheet"}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="vd-autoframing-split__col-left">{rightEl?.content}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (archetype === "CARD_GRID") {
    const heading = elements.find((el) => el.type === "heading");
    const cards = elements.filter((el) => el.type === "card");
    return (
      <div className="vd-autoframing-cards" data-archetype={archetype}>
        {heading ? (
          <div className="vd-autoframing-heading">{heading.content}</div>
        ) : null}
        <div
          className="vd-autoframing-cards__grid"
          style={{ gridTemplateColumns: `repeat(${cards.length || 3}, 1fr)` }}
        >
          {cards.map((card, idx) => (
            <div key={card.id || idx} className="vd-autoframing-card">
              <div className="vd-autoframing-card__body">{card.content}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (archetype === "METRIC_CALLOUT") {
    const heading = elements.find((el) => el.type === "heading");
    const numEls = elements.filter((el) => el.type === "metric_number");
    const lblEls = elements.filter((el) => el.type === "metric_label");

    return (
      <div className="vd-autoframing-metric" data-archetype={archetype}>
        {heading ? (
          <div className="vd-autoframing-heading">{heading.content}</div>
        ) : null}
        <div
          className="vd-autoframing-metric__row"
          style={{ gridTemplateColumns: `repeat(${numEls.length || 1}, 1fr)` }}
        >
          {numEls.map((num, idx) => {
            const lbl = lblEls[idx];
            return (
              <div key={num.id || idx} className="vd-autoframing-metric__item">
                <div className="vd-autoframing-metric__number">{num.content}</div>
                <div className="vd-autoframing-metric__label">
                  {lbl?.content || ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // CLASSIC_STACK fallback
  const heading = elements.find((el) => el.type === "heading");
  const bodyText = elements.find((el) => el.type === "text");
  return (
    <div className="vd-autoframing-classic" data-archetype={archetype}>
      {heading ? (
        <div className="vd-autoframing-heading">{heading.content}</div>
      ) : null}
      <div className="vd-autoframing-divider" />
      <div className="vd-autoframing-body">{bodyText?.content}</div>
    </div>
  );
}

function computeFrameLayoutForSlide(
  title: string,
  body: string,
  archetype?: SlideArchetype,
): AutoFrameLayoutResult {
  const lines = slideBodyLines(body);
  const blocks: ASTBlock[] = [];
  if (title.trim()) {
    blocks.push({ id: "slide-h", type: "heading", level: 1, text: title.trim() });
  }
  lines.forEach((line, idx) => {
    blocks.push({ id: `slide-p-${idx}`, type: "paragraph", text: line });
  });
  if (blocks.length === 0) {
    blocks.push({ id: "slide-empty-h", type: "heading", level: 1, text: "(Chưa đặt tiêu đề)" });
  }
  return layoutSlideBlocks(blocks, archetype);
}

/** Nội dung slide theo layout — dùng chung cho khung xem và trình chiếu. */
function SlideContent({ slide }: { slide: Slide }) {
  if (slide.frameLayout) {
    return <AutoFrameView layout={slide.frameLayout} />;
  }

  const lines = slideBodyLines(slide.body);
  const showBody =
    slide.layout === "title" ||
    slide.layout === "title-content" ||
    slide.layout === "section";

  return (
    <>
      {slide.layout !== "blank" ? (
        <div className="vd-slide__title">{slide.title || "(Chưa đặt tiêu đề)"}</div>
      ) : null}
      {showBody ? (
        slide.layout === "title-content" && lines.length > 0 ? (
          <ul className="vd-slide__bullets">
            {lines.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        ) : (
          <div className="vd-slide__subtitle">{lines.join("\n")}</div>
        )
      ) : null}
    </>
  );
}

interface PresentationOutroProps {
  slides: Slide[];
  elapsedSeconds: number;
  onRestart: () => void;
  onBack: () => void;
  onExit: () => void;
}

function PresentationOutro({
  slides,
  elapsedSeconds,
  onRestart,
  onBack,
  onExit,
}: PresentationOutroProps) {
  const [copied, setCopied] = useState(false);

  const archetypesCount = useMemo(() => {
    let count = 0;
    const set = new Set<string>();
    for (const s of slides) {
      if (s.frameLayout?.archetype) {
        set.add(s.frameLayout.archetype);
        count += 1;
      }
    }
    return { unique: set.size, totalFramed: count };
  }, [slides]);

  const copySummary = () => {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const timeFormatted = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    const lines = [
      `# Báo Cáo Thuyết Trình: ${slides[0]?.title || "Trình chiếu VietDesk"}`,
      `- Tổng số slide: ${slides.length}`,
      `- Thời lượng: ${timeFormatted}`,
      `- Số slide Auto-Framing: ${archetypesCount.totalFramed}/${slides.length}`,
      `- Danh mục slide:`,
      ...slides.map((s, idx) => `  ${idx + 1}. ${s.title || "Slide " + (idx + 1)}`),
      `\n*Tạo bởi VietDesk HyperCanvas Office — Bản sắc Việt, tốc độ 60-120 FPS*`,
    ].join("\n");

    navigator.clipboard?.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  };

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeFormatted = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div className="vd-present-outro" onClick={(e) => e.stopPropagation()}>
      <div className="vd-present-outro__glow" aria-hidden="true" />
      <div className="vd-present-outro__card">
        <div className="vd-present-outro__badge">
          <span className="vd-present-outro__badge-dot" aria-hidden="true" />
          KẾT THÚC BÀI THUYẾT TRÌNH · END OF PRESENTATION
        </div>

        <h1 className="vd-present-outro__title">
          Thuyết Trình Hoàn Tất
        </h1>
        <p className="vd-present-outro__subtitle">
          Bài trình chiếu đã được truyền tải trọn vẹn trên không gian Universal Canvas của VietDesk Office.
        </p>

        <div className="vd-present-outro__grid">
          <div className="vd-present-outro__metric">
            <span className="vd-present-outro__metric-value">{slides.length}</span>
            <span className="vd-present-outro__metric-label">Tổng số Slide</span>
          </div>
          <div className="vd-present-outro__metric">
            <span className="vd-present-outro__metric-value">{timeFormatted}</span>
            <span className="vd-present-outro__metric-label">Thời gian thuyết trình</span>
          </div>
          <div className="vd-present-outro__metric">
            <span className="vd-present-outro__metric-value">100%</span>
            <span className="vd-present-outro__metric-label">Tiến độ hoàn thành</span>
          </div>
          <div className="vd-present-outro__metric">
            <span className="vd-present-outro__metric-value">
              {archetypesCount.unique > 0 ? `${archetypesCount.unique} kiểu` : "Chuẩn"}
            </span>
            <span className="vd-present-outro__metric-label">Auto-Framing CSP</span>
          </div>
        </div>

        <div className="vd-present-outro__actions">
          <button
            type="button"
            className="vd-button is-primary"
            onClick={onRestart}
            title="Bắt đầu lại từ slide đầu tiên (Home hoặc phím R)"
          >
            Trình chiếu lại từ đầu (R)
          </button>
          <button
            type="button"
            className="vd-button"
            onClick={onBack}
            title="Quay lại slide trước (‹)"
          >
            ‹ Slide trước
          </button>
          <button
            type="button"
            className="vd-button"
            onClick={copySummary}
            title="Sao chép báo cáo tóm tắt bài thuyết trình vào clipboard"
          >
            {copied ? "✓ Đã sao chép báo cáo!" : "Sao chép tóm tắt"}
          </button>
          <button
            type="button"
            className="vd-button"
            onClick={onExit}
            title="Thoát chế độ trình chiếu (Esc)"
          >
            Thoát (Esc)
          </button>
        </div>

        <div className="vd-present-outro__footer">
          VietDesk HyperCanvas Office · Chuẩn mực 16:9 · Hiệu năng 60–120 FPS
        </div>
      </div>
    </div>
  );
}

/**
 * Trình chiếu: danh sách slide (thêm / nhân đôi / xóa / đổi thứ tự) + khung
 * soạn 16:9 theo layout + màu nền + ghi chú diễn giả + chế độ trình chiếu toàn
 * màn hình (F5).
 *
 * Chưa có transition, ảnh nền, và đối tượng tự do trên canvas — những phần đó
 * cần mô hình dữ liệu riêng và sẽ do lõi OOXML định nghĩa.
 */
export function SlidesEditor({
  initialSlides,
  onChange,
  title,
  documentPath,
  saveStatus,
  dirty,
}: SlidesEditorProps) {
  const initial = initialSlides ?? createDefaultSlides();
  const [slides, setSlides] = useState<Slide[]>(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id ?? "");
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);
  const [dragOverSlideId, setDragOverSlideId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [autoFrameModalOpen, setAutoFrameModalOpen] = useState(false);
  const [markdownInput, setMarkdownInput] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [laserActive, setLaserActive] = useState(false);
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [ribbonTab, setRibbonTab] = useState<"home" | "design" | "autoframing">("home");
  const [slideViewMode, setSlideViewMode] = useState<"filmstrip" | "grid">("filmstrip");
  const [notesExpanded, setNotesExpanded] = useState(true);
  const onChangeRef = useRef(onChange);
  const presentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const selected = slides.find((slide) => slide.id === selectedId) ?? slides[0];
  const selectedIndex = slides.findIndex((slide) => slide.id === selected?.id);

  const commit = (next: Slide[], nextSelectedId?: string) => {
    setSlides(next);
    onChangeRef.current?.(next);
    if (nextSelectedId !== undefined) {
      setSelectedId(nextSelectedId);
    }
  };

  const updateSlide = (patch: Partial<Omit<Slide, "id">>) => {
    if (!selected) {
      return;
    }
    const updatedTitle = patch.title !== undefined ? patch.title : selected.title;
    const updatedBody = patch.body !== undefined ? patch.body : selected.body;

    let nextFrameLayout =
      patch.frameLayout !== undefined ? patch.frameLayout : selected.frameLayout;

    if (
      selected.frameLayout &&
      (patch.title !== undefined || patch.body !== undefined) &&
      patch.frameLayout === undefined
    ) {
      nextFrameLayout = computeFrameLayoutForSlide(updatedTitle, updatedBody);
    }

    commit(
      slides.map((slide) =>
        slide.id === selected.id
          ? { ...slide, ...patch, frameLayout: nextFrameLayout }
          : slide,
      ),
    );
  };

  const applyThemeToAll = () => {
    if (!selected) {
      return;
    }
    const bg = selected.background;
    const trans = selected.transition;
    commit(
      slides.map((slide) => ({
        ...slide,
        background: bg,
        ...(trans !== undefined ? { transition: trans } : {}),
      })),
    );
  };

  const addSlide = () => {
    const title = "Tiêu đề mới";
    const body = "Nội dung...";
    const slide: Slide = {
      id: createSlideId(),
      layout: "title-content",
      title,
      body,
      background: null,
      notes: "",
      frameLayout: computeFrameLayoutForSlide(title, body),
    };
    const at = Math.max(selectedIndex, 0) + 1;
    commit([...slides.slice(0, at), slide, ...slides.slice(at)], slide.id);
  };

  const duplicateSlide = (id: string) => {
    const index = slides.findIndex((slide) => slide.id === id);
    if (index < 0) {
      return;
    }
    const copy: Slide = { ...slides[index], id: createSlideId() };
    commit(
      [...slides.slice(0, index + 1), copy, ...slides.slice(index + 1)],
      copy.id,
    );
  };

  const deleteSlide = (id: string) => {
    if (slides.length <= 1) {
      return;
    }
    const index = slides.findIndex((slide) => slide.id === id);
    if (index < 0) {
      return;
    }
    const next = slides.filter((slide) => slide.id !== id);
    const fallback =
      next[Math.min(index, next.length - 1)] ?? next[0] ?? slides[0];
    commit(next, fallback.id);
  };

  const moveSlide = (id: string, delta: number) => {
    const index = slides.findIndex((slide) => slide.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= slides.length) {
      return;
    }
    const next = [...slides];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const handleDragStart = (id: string, e: React.DragEvent) => {
    setDraggedSlideId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (id: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverSlideId !== id) {
      setDragOverSlideId(id);
    }
  };

  const handleDragLeave = (id: string) => {
    if (dragOverSlideId === id) {
      setDragOverSlideId(null);
    }
  };

  const handleDrop = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverSlideId(null);
    const sourceId = draggedSlideId || e.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId) return;

    const sourceIndex = slides.findIndex((s) => s.id === sourceId);
    const targetIndex = slides.findIndex((s) => s.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const next = [...slides];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    commit(next, sourceId);
    setDraggedSlideId(null);
  };

  const handleDragEnd = () => {
    setDraggedSlideId(null);
    setDragOverSlideId(null);
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const startPresent = () => {
    if (slides.length === 0) {
      return;
    }
    setPresentIndex(Math.max(selectedIndex, 0));
    setShowNotes(false);
    setPresenting(true);
  };

  const stopPresent = () => {
    setPresenting(false);
    exitFullscreen();
  };

  const stepPresent = (delta: number) => {
    setPresentIndex((index) =>
      Math.min(Math.max(index + delta, 0), slides.length),
    );
  };

  useEffect(() => {
    if (!presenting) {
      setElapsedSeconds(0);
      setLaserActive(false);
      setLaserPos(null);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [presenting]);

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!presenting) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        stopPresent();
        return;
      }
      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        setShowNotes((value) => !value);
        return;
      }
      if (event.key === "l" || event.key === "L") {
        event.preventDefault();
        setLaserActive((active) => !active);
        return;
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        setPresentIndex(0);
        return;
      }
      if (
        event.key === "ArrowRight" ||
        event.key === "ArrowDown" ||
        event.key === "PageDown" ||
        event.key === " " ||
        event.key === "Enter"
      ) {
        event.preventDefault();
        stepPresent(1);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        stepPresent(-1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setPresentIndex(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setPresentIndex(slides.length);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [presenting, slides.length]);

  useEffect(() => {
    if (!presenting) {
      return;
    }
    // Overlay vừa mới render — lúc này ref mới tồn tại để xin toàn màn hình.
    presentRef.current?.requestFullscreen?.().catch(() => {});
    // Trình duyệt tiêu phím Esc để thoát fullscreen mà không phát keydown
    // tới trang — nghe fullscreenchange để một lần Esc cũng thoát trình chiếu.
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        stopPresent();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [presenting]);

  useEffect(() => () => exitFullscreen(), []);

  useEffect(() => {
    if (presenting) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F5") {
        event.preventDefault();
        startPresent();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [presenting, slides.length, selectedIndex]);

  const isOutro = presentIndex >= slides.length;
  const current = slides[Math.min(presentIndex, slides.length - 1)];

  return (
    <div className="vd-slides">
      <aside className="vd-slides__list" aria-label="Danh sách slide">
        {slides.map((slide, index) => {
          const isDragging = draggedSlideId === slide.id;
          const isDragOver = dragOverSlideId === slide.id;
          return (
            <div
              key={slide.id}
              draggable
              onDragStart={(e) => handleDragStart(slide.id, e)}
              onDragOver={(e) => handleDragOver(slide.id, e)}
              onDragLeave={() => handleDragLeave(slide.id)}
              onDrop={(e) => handleDrop(slide.id, e)}
              onDragEnd={handleDragEnd}
              className={`vd-slides__thumb${
                slide.id === selected?.id ? " is-selected" : ""
              }${isDragging ? " is-dragging" : ""}${
                isDragOver ? " is-drag-over" : ""
              }`}
            >
              <button
                type="button"
                className="vd-slides__thumb-main"
                onClick={() => setSelectedId(slide.id)}
                aria-current={slide.id === selected?.id}
              >
              <span
                className={`vd-slides__thumb-frame${
                  slide.background ? " has-background" : ""
                }`}
                style={slide.background ? { background: slide.background } : undefined}
              >
                <span className="vd-slides__number">{index + 1}</span>
              </span>
              <span className="vd-slides__thumb-text">
                <span className="vd-slides__thumb-title">{slide.title}</span>
                <span className="vd-slides__thumb-layout">
                  {LAYOUT_LABELS[slide.layout]}
                </span>
              </span>
            </button>
            <div className="vd-slides__thumb-actions">
              <button
                type="button"
                className="vd-slides__action"
                title="Chuyển lên trên"
                aria-label="Chuyển slide lên trên"
                disabled={index === 0}
                onClick={() => moveSlide(slide.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="vd-slides__action"
                title="Chuyển xuống dưới"
                aria-label="Chuyển slide xuống dưới"
                disabled={index === slides.length - 1}
                onClick={() => moveSlide(slide.id, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="vd-slides__action"
                title="Nhân đôi slide"
                aria-label="Nhân đôi slide"
                onClick={() => duplicateSlide(slide.id)}
              >
                ⧉
              </button>
              <button
                type="button"
                className="vd-slides__action is-danger"
                title="Xóa slide"
                aria-label="Xóa slide"
                disabled={slides.length <= 1}
                onClick={() => deleteSlide(slide.id)}
              >
                ×
              </button>
            </div>
          </div>
          );
        })}
        <button type="button" className="vd-slides__add" onClick={addSlide}>
          + Thêm slide
        </button>
      </aside>

      <section className="vd-slides__stage">
        {/* --- Slides Ribbon Tab Strip (Chuẩn văn phòng hiện đại) --- */}
        <div className="vd-slides__tab-strip" role="tablist" aria-label="Thanh tab Slides">
          <div className="vd-slides__tabs-left">
            <button
              type="button"
              role="tab"
              aria-selected={ribbonTab === "home"}
              className={`vd-slides__tab-btn${ribbonTab === "home" ? " is-active" : ""}`}
              onClick={() => setRibbonTab("home")}
            >
              Trang chủ
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ribbonTab === "design"}
              className={`vd-slides__tab-btn${ribbonTab === "design" ? " is-active" : ""}`}
              onClick={() => setRibbonTab("design")}
            >
              Thiết kế & Nền
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ribbonTab === "autoframing"}
              className={`vd-slides__tab-btn${ribbonTab === "autoframing" ? " is-active" : ""}`}
              onClick={() => setRibbonTab("autoframing")}
            >
              Auto-Framing 16:9
            </button>
          </div>
          <div className="vd-slides__tabs-right">
            <button
              type="button"
              className="vd-slides__present-btn"
              onClick={startPresent}
              disabled={slides.length === 0}
              title="Bắt đầu trình chiếu toàn màn hình với Presenter Studio (Phím F5)"
            >
              <Play size={13} fill="currentColor" aria-hidden="true" />
              <span>Trình chiếu (F5)</span>
            </button>
          </div>
        </div>

        {/* --- Slides Ribbon Toolbar --- */}
        <div className="vd-slides__toolbar" role="toolbar" aria-label="Thanh công cụ trình chiếu">
          {ribbonTab === "home" && (
            <div className="vd-slides__tools">
              <label className="vd-slides__tool">
                <span className="vd-slides__tool-label">Bố cục slide</span>
                <select
                  className="vd-slides__select"
                  value={selected?.layout ?? "title-content"}
                  onChange={(event) =>
                    updateSlide({ layout: event.target.value as SlideLayout })
                  }
                  disabled={!selected}
                  aria-label="Kiểu slide"
                >
                  {SLIDE_LAYOUTS.map((layout) => (
                    <option key={layout} value={layout}>
                      {LAYOUT_LABELS[layout]}
                    </option>
                  ))}
                </select>
              </label>

              <div className="vd-slides__tool-actions">
                <button
                  type="button"
                  className="vd-button"
                  onClick={addSlide}
                  title="Thêm slide mới"
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>Thêm slide</span>
                </button>
                <button
                  type="button"
                  className={`vd-button${slideViewMode === "grid" ? " is-active" : ""}`}
                  onClick={() => setSlideViewMode((m) => (m === "grid" ? "filmstrip" : "grid"))}
                  title="Chuyển chế độ xem lưới toàn bộ slide (Xem lưới)"
                >
                  <span>{slideViewMode === "grid" ? "Xem đơn" : "Xem lưới"}</span>
                </button>
                <button
                  type="button"
                  className="vd-button"
                  onClick={() => window.print()}
                  title="In hoặc xuất PDF toàn bộ bài trình chiếu"
                >
                  <Printer size={14} aria-hidden="true" />
                  <span>In / Xuất PDF</span>
                </button>
              </div>
            </div>
          )}

          {ribbonTab === "design" && (
            <div className="vd-slides__tools">
              <label className="vd-slides__tool">
                <span className="vd-slides__tool-label">Hiệu ứng chuyển</span>
                <select
                  className="vd-slides__select"
                  value={selected?.transition ?? "fade"}
                  onChange={(event) =>
                    updateSlide({ transition: event.target.value as SlideTransition })
                  }
                  disabled={!selected}
                  aria-label="Hiệu ứng chuyển slide"
                >
                  {SLIDE_TRANSITIONS.map((trans) => (
                    <option key={trans} value={trans}>
                      {TRANSITION_LABELS[trans]}
                    </option>
                  ))}
                </select>
              </label>

              <div className="vd-slides__tool" role="group" aria-label="Màu nền slide">
                <span className="vd-slides__tool-label">Chủ đề & Nền</span>
                <div className="vd-slides__swatches">
                  {SLIDE_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      className={`vd-slides__swatch${
                        selected?.background === theme.background ? " is-active" : ""
                      }`}
                      style={{ background: theme.background }}
                      title={`${theme.name} (${theme.background})`}
                      aria-label={`Đặt nền ${theme.name}`}
                      disabled={!selected}
                      onClick={() => updateSlide({ background: theme.background })}
                    />
                  ))}
                  <input
                    type="color"
                    className="vd-slides__color"
                    value={selected?.background ?? "#ffffff"}
                    onChange={(event) =>
                      updateSlide({ background: event.target.value })
                    }
                    disabled={!selected}
                    aria-label="Màu nền tùy chỉnh"
                  />
                  <button
                    type="button"
                    className="vd-slides__clear-bg"
                    disabled={!selected?.background}
                    onClick={() => updateSlide({ background: null })}
                  >
                    Xóa nền
                  </button>
                  <button
                    type="button"
                    className="vd-slides__apply-all"
                    title="Áp dụng nền và hiệu ứng cho toàn bộ bài trình chiếu"
                    disabled={!selected}
                    onClick={applyThemeToAll}
                  >
                    Áp dụng tất cả
                  </button>
                </div>
              </div>
            </div>
          )}

          {ribbonTab === "autoframing" && (
            <div className="vd-slides__tools">
              <button
                type="button"
                className="vd-button is-primary"
                onClick={() => {
                  setMarkdownInput(
                    selected ? `# ${selected.title}\n\n${selected.body}` : ""
                  );
                  setAutoFrameModalOpen(true);
                }}
                title="Tự động đóng khung và dàn trang 16:9 theo chuẩn HC-Office"
              >
                <Sparkles size={14} aria-hidden="true" />
                <span>Kích hoạt Auto-Framing 16:9</span>
              </button>
              <span className="vd-slides__autoframing-hint">
                Tự động bố cục 5 Archetypes (Hero, Split Column, Cards, Timeline, Stats) không cần Internet/Copilot.
              </span>
            </div>
          )}
        </div>

        {slideViewMode === "grid" ? (
          <div className="vd-slides__grid-view" role="region" aria-label="Xem lưới slide">
            <div className="vd-slides__grid-container">
              {slides.map((s, index) => (
                <div
                  key={s.id}
                  className={`vd-slides__grid-card${s.id === selected?.id ? " is-active" : ""}`}
                  onClick={() => {
                    setSelectedId(s.id);
                    setSlideViewMode("filmstrip");
                  }}
                  title="Nhấn để mở và chỉnh sửa slide"
                >
                  <div className="vd-slides__grid-card-head">
                    <span className="vd-slides__grid-num">{index + 1}</span>
                    <span className="vd-slides__grid-layout">{LAYOUT_LABELS[s.layout]}</span>
                  </div>
                  <div
                    className="vd-slides__grid-preview"
                    style={s.background ? { background: s.background } : undefined}
                  >
                    <strong className="vd-slides__grid-title">{s.title || "(Chưa có tiêu đề)"}</strong>
                    <p className="vd-slides__grid-body">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : selected ? (
          <>
            {selected.frameLayout ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "min(100%, calc((100vh - 380px) * 16 / 9))", alignSelf: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="vd-autoframing-badge">
                    Điểm thị giác: {selected.frameLayout.score}/100
                  </span>
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: "var(--vd-muted)" }}>Archetype:</span>
                    <select
                      value={selected.frameLayout.archetype}
                      onChange={(e) => {
                        const arch = e.target.value as SlideArchetype;
                        updateSlide({
                          frameLayout: computeFrameLayoutForSlide(selected.title, selected.body, arch),
                        });
                      }}
                      className="vd-select"
                      style={{ padding: "2px 6px", fontSize: 12 }}
                    >
                      <option value="HERO_STATEMENT">Hero Statement (Tiêu điểm)</option>
                      <option value="SPLIT_TWO_COLUMN">Split 2-Column (2 Cột)</option>
                      <option value="CARD_GRID">Card Grid (Lưới thẻ)</option>
                      <option value="METRIC_CALLOUT">Metric Callout (Số liệu)</option>
                      <option value="CLASSIC_STACK">Classic Stack (Xếp tầng)</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="vd-button is-small"
                    onClick={() =>
                      updateSlide({
                        frameLayout: computeFrameLayoutForSlide(selected.title, selected.body),
                      })
                    }
                    style={{ fontSize: 11, padding: "2px 8px" }}
                    title="Tự động so khớp CSP tối ưu nhất"
                  >
                    Tự động (CSP)
                  </button>
                  <button
                    type="button"
                    className="vd-button is-small"
                    onClick={() => updateSlide({ frameLayout: undefined })}
                    style={{ fontSize: 11, padding: "2px 8px" }}
                  >
                    Bỏ Auto-Framing
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "flex-end", width: "min(100%, calc((100vh - 380px) * 16 / 9))", alignSelf: "center", marginBottom: 6 }}>
                <button
                  type="button"
                  className="vd-button is-small is-primary"
                  onClick={() =>
                    updateSlide({
                      frameLayout: computeFrameLayoutForSlide(selected.title, selected.body),
                    })
                  }
                  style={{ fontSize: 11, padding: "2px 10px" }}
                >
                  Bật Auto-Framing 16:9
                </button>
              </div>
            )}
            <div
              className={`vd-slides__canvas vd-slide--${selected.layout}`}
              style={backgroundStyle(selected)}
            >
              <SlideContent slide={selected} />
            </div>
            <div className="vd-slides__fields">
              <label className="vd-slides__field">
                <span className="vd-slides__field-label">Tiêu đề</span>
                <input
                  className="vd-slides__input"
                  value={selected.title}
                  onChange={(event) => updateSlide({ title: event.target.value })}
                  lang="vi"
                />
              </label>
              <label className="vd-slides__field">
                <span className="vd-slides__field-label">Nội dung</span>
                <textarea
                  className="vd-slides__textarea"
                  value={selected.body}
                  onChange={(event) => updateSlide({ body: event.target.value })}
                  rows={4}
                  spellCheck
                  lang="vi"
                  placeholder="Mỗi dòng là một gạch đầu dòng"
                />
              </label>
              <div className="vd-slides__field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span className="vd-slides__field-label" style={{ marginBottom: 0 }}>Ghi chú diễn giả</span>
                  <button
                    type="button"
                    className="vd-button is-small"
                    style={{ fontSize: 11, padding: "1px 6px" }}
                    onClick={() => setNotesExpanded((exp) => !exp)}
                  >
                    {notesExpanded ? "Thu gọn" : "Mở rộng"}
                  </button>
                </div>
                {notesExpanded && (
                  <textarea
                    className="vd-slides__textarea vd-slides__notes"
                    value={selected.notes}
                    onChange={(event) => updateSlide({ notes: event.target.value })}
                    rows={2}
                    spellCheck
                    lang="vi"
                    placeholder="Không hiện khi trình chiếu"
                  />
                )}
              </div>
            </div>
          </>
        ) : null}
        <div className="vd-slides__status">
          <div className="vd-slides__status-left">
            {saveStatus ? (
              <span
                className={`vd-slides__status-save${dirty ? " is-dirty" : " is-clean"}`}
                title={dirty ? "Có thay đổi chưa lưu" : "Tài liệu đã được lưu"}
              >
                <span className="vd-status-dot" />
                {saveStatus}
              </span>
            ) : null}
            {title ? (
              <span className="vd-slides__status-title" title={documentPath ?? title}>
                {title}
              </span>
            ) : null}
            <span>
              Slide {selectedIndex + 1}/{slides.length}
            </span>
          </div>
          <span className="vd-slides__hint">
            F5 — trình chiếu · ←/→ — chuyển slide · Esc — thoát
          </span>
        </div>
      </section>

      {presenting && (current || isOutro)
        ? createPortal(
            <div
              ref={presentRef}
              className={`vd-present${laserActive ? " is-laser-active" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label="Chế độ trình chiếu"
              onClick={() => {
                if (!isOutro) stepPresent(1);
              }}
              onMouseMove={(e) => {
                if (laserActive) {
                  setLaserPos({ x: e.clientX, y: e.clientY });
                }
              }}
            >
              <div
                className="vd-present__progress"
                style={{
                  width: `${((Math.min(presentIndex + 1, slides.length)) / slides.length) * 100}%`,
                }}
              />

              {laserActive && laserPos ? (
                <div
                  className="vd-present__laser"
                  style={{ left: laserPos.x, top: laserPos.y }}
                />
              ) : null}

              {isOutro ? (
                <PresentationOutro
                  slides={slides}
                  elapsedSeconds={elapsedSeconds}
                  onRestart={() => setPresentIndex(0)}
                  onBack={() => setPresentIndex(slides.length - 1)}
                  onExit={stopPresent}
                />
              ) : (
                <div
                  key={current.id}
                  className={`vd-present__canvas vd-slide--${current.layout} vd-present__canvas--${
                    current.transition ?? "fade"
                  }`}
                  style={backgroundStyle(current)}
                >
                  <SlideContent slide={current} />
                </div>
              )}

              {showNotes && !isOutro ? (
                <div
                  className="vd-present__notes"
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className="vd-present__notes-label">
                    Ghi chú diễn giả (nhấn phím S để ẩn)
                  </span>
                  <div className="vd-present__notes-text">
                    {current.notes.trim() || "— chưa có ghi chú —"}
                  </div>
                </div>
              ) : null}

              <div
                className="vd-present__hud"
                onClick={(event) => event.stopPropagation()}
              >
                <span className="vd-present__timer" title="Thời gian thuyết trình">
                  ⏱ {formatTimer(elapsedSeconds)}
                </span>
                <span className="vd-present__counter">
                  {isOutro
                    ? `Kết thúc (${slides.length}/${slides.length})`
                    : `${presentIndex + 1}/${slides.length}`}
                </span>
                {!isOutro && (
                  <span className="vd-present__badge">
                    {TRANSITION_LABELS[current.transition ?? "fade"]}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => stepPresent(-1)}
                  disabled={presentIndex === 0}
                  aria-label="Slide trước"
                >
                  ‹ Trước
                </button>
                <button
                  type="button"
                  onClick={() => stepPresent(1)}
                  disabled={isOutro}
                  aria-label="Slide sau"
                >
                  Sau ›
                </button>
                <button
                  type="button"
                  className={laserActive ? "is-active" : ""}
                  onClick={() => setLaserActive((active) => !active)}
                  title="Con trỏ Laser (Phím L)"
                  aria-label="Bật/Tắt con trỏ Laser"
                >
                  {laserActive ? "🔴 Tắt Laser" : "⭕ Laser (L)"}
                </button>
                {!isOutro && (
                  <button
                    type="button"
                    onClick={() => setShowNotes((v) => !v)}
                    aria-label="Hiện hoặc ẩn ghi chú diễn giả"
                  >
                    {showNotes ? "Ẩn ghi chú (S)" : "Ghi chú (S)"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={stopPresent}
                  aria-label="Thoát trình chiếu"
                >
                  Thoát (Esc)
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {autoFrameModalOpen ? (
        <div className="vd-modal-overlay" onClick={() => setAutoFrameModalOpen(false)}>
          <div className="vd-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="vd-modal-header">
              <h3 className="vd-modal-title">Tự Động Đóng Khung & Dàn Trang 16:9 (Auto-Framing)</h3>
              <button
                type="button"
                className="vd-button is-small"
                onClick={() => setAutoFrameModalOpen(false)}
              >
                Đóng
              </button>
            </div>
            <div className="vd-modal-body">
              <p style={{ margin: 0, fontSize: 13, color: "var(--vd-muted)" }}>
                Hệ thống tự động nhận diện ngữ nghĩa, đánh giá ngân sách không gian (1920x1080), khớp 5 Archetype hình học và tính toán cỡ chữ bằng Binary Search.
              </p>

              {selected ? (
                <div style={{ padding: 12, background: "rgba(0,0,0,0.03)", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>Slide hiện tại:</strong> {selected.title || "(Chưa đặt tiêu đề)"}
                  </div>
                  <button
                    type="button"
                    className="vd-button is-primary is-small"
                    onClick={() => {
                      const text = `${selected.title}\n\n${selected.body}`;
                      const blocks = parseMarkdownToAST(text);
                      const layout = layoutSlideBlocks(blocks);
                      updateSlide({
                        frameLayout: layout,
                        notes: `Auto-Framing 16:9: ${layout.archetype} (Điểm thị giác: ${layout.score}/100)`,
                      });
                      setAutoFrameModalOpen(false);
                    }}
                  >
                    Tối ưu Slide hiện tại
                  </button>
                </div>
              ) : null}

              <label className="vd-slides__field">
                <span className="vd-slides__field-label">
                  Hoặc nhập văn bản / Markdown để tự động tạo toàn bộ Slide Deck:
                </span>
                <textarea
                  className="vd-slides__textarea"
                  value={markdownInput}
                  onChange={(e) => setMarkdownInput(e.target.value)}
                  rows={6}
                  placeholder="# Tiêu đề 1&#10;Nội dung văn bản...&#10;&#10;---&#10;&#10;## Thống kê&#10;[Metric: 99.8% | Doanh thu đạt chuẩn]&#10;&#10;---&#10;&#10;## So sánh&#10;| Chỉ tiêu | Quý 1 | Quý 2 |&#10;|---|---|---|&#10;| Doanh thu | 10 tỷ | 15 tỷ |"
                />
              </label>
            </div>
            <div className="vd-modal-footer">
              <button
                type="button"
                className="vd-button"
                onClick={() => setAutoFrameModalOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="vd-button is-primary"
                onClick={() => {
                  if (markdownInput.trim().length === 0) return;
                  const deck = autoFrameLayoutFromMarkdown(markdownInput, "Bài thuyết trình");
                  const newSlides = deck.slides.map((res) => slideFromFrameLayout(res));
                  if (newSlides.length > 0) {
                    commit(newSlides, newSlides[0].id);
                    setAutoFrameModalOpen(false);
                  }
                }}
              >
                Tạo Slide Deck 16:9
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
