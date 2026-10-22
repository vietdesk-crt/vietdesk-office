import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createSlideId, createDefaultSlides } from "./model";
import type { Slide } from "./model";

export interface SlidesEditorProps {
  /** Danh sách slide đã lưu trong tệp `.vdx`. */
  initialSlides?: Slide[];
  /** Gọi sau mỗi thay đổi để vỏ ứng dụng đánh dấu "chưa lưu" và tự lưu. */
  onChange?: (slides: Slide[]) => void;
}

/**
 * Trình chiếu: danh sách slide (thêm / nhân đôi / xóa / đổi thứ tự)
 * + khung soạn 16:9 + chế độ trình chiếu toàn màn hình (F5).
 *
 * Chưa có transition, theme, hay layout master — những phần đó cần mô hình
 * dữ liệu riêng và sẽ do lõi OOXML (native/core/modules/ooxml) định nghĩa.
 */
export function SlidesEditor({ initialSlides, onChange }: SlidesEditorProps) {
  const initial = initialSlides ?? createDefaultSlides();
  const [slides, setSlides] = useState<Slide[]>(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id ?? "");
  const [presenting, setPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
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

  const updateSlide = (patch: Partial<Pick<Slide, "title" | "body">>) => {
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
      title: "Tiêu đề mới",
      body: "Nội dung...",
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
              <span className="vd-slides__number">{index + 1}</span>
              <span className="vd-slides__thumb-title">{slide.title}</span>
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
          <span className="vd-slides__hint">
            F5 — trình chiếu · ←/→ — chuyển slide khi trình chiếu
          </span>
          <button
            type="button"
            className="vd-button"
            onClick={startPresent}
            disabled={slides.length === 0}
          >
            ▶ Trình chiếu
          </button>
        </div>
        <div className="vd-slides__canvas">
          {selected ? (
            <>
              <textarea
                className="vd-slides__title"
                value={selected.title}
                onChange={(event) => updateSlide({ title: event.target.value })}
                rows={1}
                spellCheck
                lang="vi"
                aria-label="Tiêu đề slide"
              />
              <textarea
                className="vd-slides__body"
                value={selected.body}
                onChange={(event) => updateSlide({ body: event.target.value })}
                rows={6}
                spellCheck
                lang="vi"
                aria-label="Nội dung slide"
              />
            </>
          ) : null}
        </div>
        <div className="vd-slides__status">
          <span>
            Slide {selectedIndex + 1}/{slides.length}
          </span>
          <span>16:9 · chưa hỗ trợ hiệu ứng</span>
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
              <div className="vd-present__canvas">
                <div className="vd-present__title">{current.title}</div>
                <div className="vd-present__body">{current.body}</div>
              </div>
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
