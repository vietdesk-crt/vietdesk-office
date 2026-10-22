import { kindFromFileName } from "@vietdesk/ipc-contract";
import type { RecentEntry } from "@vietdesk/ipc-contract";
import { normalizeForSearch } from "@vietdesk/vietnamese";
import { useMemo, useState } from "react";
import { APPS, APP_IDS, HOME_CARDS, appDisplay } from "./apps";
import type { AppId } from "./apps";
import type { Draft } from "./drafts";
import { formatFileSize, formatRelativeTime } from "./format";
import { VietDeskLogo } from "./Logo";
import { useWeather } from "./weather";

export interface HomeProps {
  recents: RecentEntry[];
  loading: boolean;
  error: string | null;
  theme?: "light" | "dark";
  drafts?: Draft[];
  onCreate: (kind: AppId) => void;
  onOpenRecent: (entry: RecentEntry) => void;
  onOpenFile: () => void;
  onTogglePin: (entry: RecentEntry) => void;
  onRemove: (entry: RecentEntry) => void;
  onClearAll: () => void;
  onRestoreDraft?: (draft: Draft) => void;
  onDiscardDraft?: (draft: Draft) => void;
}

const WEEKDAY_FMT = new Intl.DateTimeFormat("vi-VN", { weekday: "long" });
const DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Trang chủ dùng chung (kiểu WPS Start Center / LibreOffice Start Center).
 *
 * Chỉ trình bày + lọc cục bộ; mọi thao tác đi qua callback để App quyết định
 * điều hướng và ghi lịch sử.
 */
export function Home({
  recents,
  loading,
  error,
  theme = "light",
  drafts = [],
  onCreate,
  onOpenRecent,
  onOpenFile,
  onTogglePin,
  onRemove,
  onClearAll,
  onRestoreDraft,
  onDiscardDraft,
}: HomeProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeForSearch(query);
  const weather = useWeather();

  const filtered = useMemo(() => {
    if (!normalizedQuery) {
      return recents;
    }
    return recents.filter((entry) =>
      normalizeForSearch(`${entry.name} ${entry.path ?? ""}`).includes(
        normalizedQuery,
      ),
    );
  }, [recents, normalizedQuery]);

  const pinnedCount = recents.filter((entry) => entry.pinned).length;

  const docStats = useMemo(() => {
    const counts = { writer: 0, sheets: 0, slides: 0 };
    for (const entry of recents) {
      const kind =
        entry.kind === "unknown" ? kindFromFileName(entry.name) : entry.kind;
      if (kind === "writer" || kind === "sheets" || kind === "slides") {
        counts[kind] += 1;
      }
    }
    return counts;
  }, [recents]);

  return (
    <div className="vd-home">
      {/* Họa tiết hệ mặt trời trang trí (thuần trang trí, không tương tác) */}
      <div className="vd-home__orbits" aria-hidden="true">
        <span className="vd-home__orbit-sun" />
        <span className="vd-home__orbit vd-home__orbit--1">
          <i className="vd-home__planet vd-home__planet--n is-writer" />
        </span>
        <span className="vd-home__orbit vd-home__orbit--2">
          <i className="vd-home__planet vd-home__planet--n is-sheets" />
          <i className="vd-home__planet vd-home__planet--s is-moon" />
        </span>
        <span className="vd-home__orbit vd-home__orbit--3">
          <i className="vd-home__planet vd-home__planet--e is-slides" />
          <i className="vd-home__planet vd-home__planet--n is-dust" />
        </span>
        <span className="vd-home__orbit vd-home__orbit--4">
          <i className="vd-home__planet vd-home__planet--w is-saturn" />
          <i className="vd-home__planet vd-home__planet--s is-dust" />
        </span>
        <span className="vd-home__orbit vd-home__orbit--5">
          <i className="vd-home__planet vd-home__planet--e is-moon" />
          <i className="vd-home__planet vd-home__planet--n is-dust" />
          <i className="vd-home__planet vd-home__planet--s is-dust is-dust--alt" />
        </span>
        <span className="vd-home__orbit vd-home__orbit--6">
          <i className="vd-home__planet vd-home__planet--n is-cream" />
          <i className="vd-home__planet vd-home__planet--s is-dust" />
        </span>
        {/* Mưa thiên thạch hai bên lề */}
        <span className="vd-home__meteor vd-home__meteor--1" />
        <span className="vd-home__meteor vd-home__meteor--2" />
        <span className="vd-home__meteor vd-home__meteor--3" />
        <span className="vd-home__meteor vd-home__meteor--4" />
        <span className="vd-home__meteor vd-home__meteor--5" />
        <span className="vd-home__meteor vd-home__meteor--6" />
      </div>
      <div className="vd-home__inner">
      <header className="vd-home__hero">
        <div className="vd-home__brand-header">
          <div className="vd-home__brand-badge">
            <VietDeskLogo size={28} theme={theme} aria-hidden="true" />
            <div className="vd-home__brand-meta">
              <span className="vd-home__eyebrow">VietDesk Office</span>
              <span className="vd-home__tagline">Bản sắc Việt · Bộ ứng dụng văn phòng</span>
            </div>
          </div>
        </div>
        <div className="vd-home__hero-body">
          <div>
            <h1>Hôm nay bạn muốn soạn gì?</h1>
            <p className="vd-home__lead">
              Một không gian chung cho văn bản, bảng tính và trình chiếu — đầy đủ
              tiếng Việt, chuẩn văn bản hành chính.
            </p>
          </div>
          <div className="vd-home__today-wrap">
            {weather ? (
              <span
                className="vd-home__weather"
                title={
                  weather.place
                    ? `${weather.description} · ${weather.place}`
                    : weather.description
                }
              >
                <span className="vd-home__weather-icon" aria-hidden="true">
                  {weather.icon}
                </span>
                <strong>{weather.temperatureC}°C</strong>
                <span>{weather.description}</span>
              </span>
            ) : null}
            <div className="vd-home__today" aria-label="Ngày hôm nay">
              <span className="vd-home__today-weekday">
                {WEEKDAY_FMT.format(new Date())}
              </span>
              <strong className="vd-home__today-date">
                {DATE_FMT.format(new Date())}
              </strong>
            </div>
          </div>
        </div>
        {recents.length > 0 && !loading ? (
          <div className="vd-home__stats">
            {APP_IDS.map((kind) => (
              <span className={`vd-home__stat is-${kind}`} key={kind}>
                <span className="vd-home__stat-dot" aria-hidden="true" />
                <strong>{docStats[kind]}</strong>
                <span>{APPS[kind].label}</span>
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {drafts.length > 0 ? (
        <section
          className="vd-home__section vd-drafts"
          aria-labelledby="vd-drafts-heading"
        >
          <div className="vd-home__section-head">
            <h2 id="vd-drafts-heading">Bản nháp chưa lưu</h2>
            <span className="vd-home__count">{drafts.length} bản</span>
          </div>
          <ul className="vd-draft-list">
            {drafts.map((draft) => (
              <li className="vd-draft" key={draft.id}>
                <span
                  className={`vd-recent__badge is-${draft.kind}`}
                  aria-hidden="true"
                >
                  {APPS[draft.kind].glyph}
                </span>
                <span className="vd-draft__info">
                  <span className="vd-draft__name">{draft.name}</span>
                  <span className="vd-draft__meta">
                    <span>{APPS[draft.kind].label}</span>
                    <span>·</span>
                    <span>{draft.path ?? "chưa lưu vào đĩa"}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(draft.updatedAt)}</span>
                  </span>
                </span>
                <span className="vd-draft__actions">
                  <button
                    type="button"
                    className="vd-button"
                    onClick={() => onRestoreDraft?.(draft)}
                  >
                    Khôi phục
                  </button>
                  <button
                    type="button"
                    className="vd-icon"
                    title="Xoá bản nháp"
                    aria-label={`Xoá bản nháp ${draft.name}`}
                    onClick={() => onDiscardDraft?.(draft)}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="vd-home__section" aria-labelledby="vd-create-heading">
        <div className="vd-home__section-head">
          <h2 id="vd-create-heading">Tạo mới</h2>
          <span className="vd-home__count">{HOME_CARDS.length} định dạng</span>
        </div>

        <div className="vd-cards">
          {HOME_CARDS.map((card) => (
            <button
              type="button"
              key={card.kind}
              className={`vd-card is-${card.kind}`}
              onClick={() => onCreate(card.kind)}
            >
              <span className="vd-card__glyph" aria-hidden="true">
                {APPS[card.kind].glyph}
              </span>
              <span className="vd-card__title">{card.title}</span>
              <span className="vd-card__desc">{card.description}</span>
              <span className="vd-card__formats">{card.formats}</span>
            </button>
          ))}
        </div>
      </section>

      <section
        className="vd-home__section"
        id="vd-recents"
        aria-labelledby="vd-recent-heading"
      >
        <div className="vd-home__section-head">
          <h2 id="vd-recent-heading">Gần đây</h2>
          <span className="vd-home__count">
            {recents.length} tệp{pinnedCount > 0 ? ` · ${pinnedCount} đã ghim` : ""}
          </span>

          <div className="vd-home__section-actions">
            <input
              type="search"
              className="vd-home__search"
              placeholder="Lọc theo tên hoặc đường dẫn…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Lọc tệp gần đây"
            />
            <button type="button" className="vd-button is-primary" onClick={onOpenFile}>
              Mở tệp…
            </button>
          </div>
        </div>

        {error ? <p className="vd-home__error">Không đọc được lịch sử: {error}</p> : null}

        {loading ? (
          <p className="vd-home__placeholder">Đang tải danh sách…</p>
        ) : filtered.length === 0 ? (
          <div className="vd-home__empty">
            <p>
              {recents.length === 0
                ? "Chưa có tệp nào. Hãy tạo mới hoặc mở một tệp để bắt đầu."
                : "Không có tệp nào khớp với từ khoá."}
            </p>
            {recents.length === 0 ? (
              <p className="vd-home__empty-hint">
                Tệp bạn mở sẽ xuất hiện ở đây, kể cả sau khi khởi động lại ứng dụng.
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="vd-recents">
            {filtered.map((entry) => {
              const kind =
                entry.kind === "unknown"
                  ? kindFromFileName(entry.name)
                  : entry.kind;
              const meta = appDisplay(kind);
              const size = formatFileSize(entry.size);
              const missing = entry.path !== null && !entry.exists;

              return (
                <li
                  className={`vd-recent${entry.pinned ? " is-pinned" : ""}`}
                  key={entry.id}
                >
                  <button
                    type="button"
                    className="vd-recent__open"
                    onClick={() => onOpenRecent(entry)}
                  >
                    <span
                      className={`vd-recent__badge is-${kind}`}
                      aria-hidden="true"
                    >
                      {meta.glyph}
                    </span>
                    <span className="vd-recent__info">
                      <span className="vd-recent__name">{entry.name}</span>
                      <span className="vd-recent__meta">
                        <span className="vd-recent__kind">{meta.label}</span>
                        <span>·</span>
                        <span className="vd-recent__path">
                          {entry.path ?? "Chưa lưu vào đĩa"}
                        </span>
                        {size ? (
                          <>
                            <span>·</span>
                            <span>{size}</span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span>{formatRelativeTime(entry.openedAt)}</span>
                        {missing ? (
                          <span className="vd-recent__missing">không tìm thấy</span>
                        ) : null}
                      </span>
                    </span>
                  </button>

                  <div className="vd-recent__actions">
                    <button
                      type="button"
                      className={`vd-icon${entry.pinned ? " is-active" : ""}`}
                      title={entry.pinned ? "Bỏ ghim" : "Ghim lên đầu"}
                      aria-pressed={entry.pinned}
                      onClick={() => onTogglePin(entry)}
                    >
                      {entry.pinned ? "★" : "☆"}
                    </button>
                    <button
                      type="button"
                      className="vd-icon"
                      title="Xoá khỏi danh sách (không xoá tệp)"
                      onClick={() => onRemove(entry)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {recents.length > 0 && !loading ? (
          <div className="vd-home__foot">
            <button type="button" className="vd-link" onClick={onClearAll}>
              Xoá lịch sử gần đây
            </button>
          </div>
        ) : null}
      </section>
      </div>
    </div>
  );
}
