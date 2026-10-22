import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { SLIDE_LAYOUTS, createDefaultSlides, createSlideId, slideBodyLines } from "./model";
import type { Slide, SlideLayout } from "./model";

export interface SlidesEditorProps {
  /** Danh sách slide đã lưu trong tệp `.vdx`. */
  initialSlides?: Slide[];
  /** Gọi sau mỗi thay đổi để vỏ ứng dụng đánh dấu "chưa lưu" và tự lưu. */
  onChange?: (slides: Slide[]) => void;
}

const LAYOUT_LABELS: Record<SlideLayout, string> = {
  title: "Slide tiêu đề",
  "title-content": "Tiêu đề và nội dung",
  section: "Ngăn cách",
  "title-only": "Chỉ tiêu đề",
  blank: "Trống",
};

/** Bảng màu nhanh lấy cảm hứng từ theme của Google Slides / WPS. */
const BACKGROUND_PRESETS = [
  "#ffffff",
  "#f5f3ce",
  "#d7e3fc",
  "#fad2cf",
  "#c9daf8",
  "#1e1e3f",
  "#0f766e",
  "#3c4043",
];

function backgroundStyle(slide: Slide): CSSProperties {
  if (!slide.background) return {};
  // Tự động đảo màu chữ theo độ sáng nền (giống WPS khi đổi màu slide).
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

/** Nội dung slide theo layout — dùng chung cho khung xem và trình chiếu. */
function SlideContent({ slide }: { slide: Slide }) {
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

/**
 * Trình chiếu: danh sách slide (thêm / nhân đôi / xóa / đổi thứ tự) + khung
 * soạn 16:9 theo layout + màu nền + ghi chú diễn giả + chế độ trình chiếu toàn
 * màn hình (F5).
 *
 * Chưa có transition, ảnh nền, và đối tượng tự do trên canvas — những phần đó
 * cần mô hình dữ liệu riêng và sẽ do lõi OOXML định nghĩa.
 */
export function SlidesEditor({ initialSlides, onChange }: SlidesEditorProps) {
  const initial = initialSlides ?? createDefaultSlides();
  const [slides, setSlides] = useState<Slide[]>(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id ?? "");
  const [presenting, setPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
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
    commit(
      slides.map((slide) =>
        slide.id === selected.id ? { ...slide, ...patch } : slide,
      ),
    );
  };

  const addSlide = () => {
    const slide: Slide = {
      id: createSlideId(),
      layout: "title-content",
      title: "Tiêu đề mới",
      body: "Nội dung...",
      background: null,
      notes: "",
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
      Math.min(Math.max(index + delta, 0), slides.length - 1),
    );
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
        setPresentIndex(slides.length - 1);
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

  const current = slides[Math.min(presentIndex, slides.length - 1)];

  return (
    <div className="vd-slides">
      <aside className="vd-slides__list" aria-label="Danh sách slide">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`vd-slides__thumb${
              slide.id === selected?.id ? " is-selected" : ""
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
        ))}
        <button type="button" className="vd-slides__add" onClick={addSlide}>
          + Thêm slide
        </button>
      </aside>

      <section className="vd-slides__stage">
        <div className="vd-slides__toolbar">
          <div className="vd-slides__tools">
            <label className="vd-slides__tool">
              <span className="vd-slides__tool-label">Kiểu</span>
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
            <div className="vd-slides__tool" role="group" aria-label="Màu nền slide">
              <span className="vd-slides__tool-label">Nền</span>
              <div className="vd-slides__swatches">
                {BACKGROUND_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`vd-slides__swatch${
                      selected?.background === color ? " is-active" : ""
                    }`}
                    style={{ background: color }}
                    title={color}
                    aria-label={`Đặt nền ${color}`}
                    disabled={!selected}
                    onClick={() => updateSlide({ background: color })}
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
              </div>
            </div>
          </div>
          <button
            type="button"
            className="vd-button is-primary"
            onClick={startPresent}
            disabled={slides.length === 0}
          >
            ▶ Trình chiếu
          </button>
        </div>

        {selected ? (
          <>
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
              <label className="vd-slides__field">
                <span className="vd-slides__field-label">Ghi chú diễn giả</span>
                <textarea
                  className="vd-slides__textarea vd-slides__notes"
                  value={selected.notes}
                  onChange={(event) => updateSlide({ notes: event.target.value })}
                  rows={2}
                  spellCheck
                  lang="vi"
                  placeholder="Không hiện khi trình chiếu"
                />
              </label>
            </div>
          </>
        ) : null}
        <div className="vd-slides__status">
          <span>
            Slide {selectedIndex + 1}/{slides.length}
          </span>
          <span className="vd-slides__hint">
            F5 — trình chiếu · ←/→ — chuyển slide · Esc — thoát
          </span>
        </div>
      </section>

      {presenting && current
        ? createPortal(
            <div
              ref={presentRef}
              className="vd-present"
              role="dialog"
              aria-modal="true"
              aria-label="Chế độ trình chiếu"
              onClick={() => stepPresent(1)}
            >
              <div
                className={`vd-present__canvas vd-slide--${current.layout}`}
                style={backgroundStyle(current)}
              >
                <SlideContent slide={current} />
              </div>
              {showNotes ? (
                <div
                  className="vd-present__notes"
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className="vd-present__notes-label">
                    Ghi chú diễn giả (S để ẩn)
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
                <span>
                  {Math.min(presentIndex, slides.length - 1) + 1}/{slides.length}
                </span>
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
                  disabled={presentIndex >= slides.length - 1}
                  aria-label="Slide sau"
                >
                  Sau ›
                </button>
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
    </div>
  );
}
