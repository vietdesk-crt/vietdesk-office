import {
  KIND_GLYPH,
  KIND_LABEL,
  kindFromFileName,
} from "@vietdesk/ipc-contract";
import type { RecentEntry } from "@vietdesk/ipc-contract";
import { normalizeForSearch } from "@vietdesk/vietnamese";
import { useMemo, useState } from "react";
import type { Draft } from "./drafts";
import { formatFileSize, formatRelativeTime } from "./format";
import { VietDeskLogo } from "./Logo";

export type CreatableKind = "writer" | "sheets" | "slides";

interface CreateCard {
  kind: CreatableKind;
  title: string;
  description: string;
  formats: string;
}

const CARDS: CreateCard[] = [
  {
    kind: "writer",
    title: "Văn bản",
    description: "Công văn, quyết định, biên bản — chuẩn NĐ30.",
    formats: "Lưu .vdx · DOCX đang phát triển",
  },
  {
    kind: "sheets",
    title: "Bảng tính",
    description: "Bảng lương, dự toán, công thức và số tiền VND.",
    formats: "Lưu .vdx · XLSX đang phát triển",
  },
  {
    kind: "slides",
    title: "Trình chiếu",
    description: "Bài giảng, báo cáo, khung 16:9.",
    formats: "Lưu .vdx · PPTX đang phát triển",
  },
];

export interface HomeProps {
  recents: RecentEntry[];
  loading: boolean;
  error: string | null;
  theme?: "light" | "dark";
  drafts?: Draft[];
  onCreate: (kind: CreatableKind) => void;
  onOpenRecent: (entry: RecentEntry) => void;
  onOpenFile: () => void;
  onTogglePin: (entry: RecentEntry) => void;
  onRemove: (entry: RecentEntry) => void;
  onClearAll: () => void;
  onRestoreDraft?: (draft: Draft) => void;
  onDiscardDraft?: (draft: Draft) => void;
}

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

  return (
    <div className="vd-home">
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
        <h1>Hôm nay bạn muốn soạn gì?</h1>
        <p className="vd-home__lead">
          Một không gian chung cho văn bản, bảng tính và trình chiếu — đầy đủ
          tiếng Việt, chuẩn văn bản hành chính.
        </p>
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
                  {KIND_GLYPH[draft.kind]}
                </span>
                <span className="vd-draft__info">
                  <span className="vd-draft__name">{draft.name}</span>
                  <span className="vd-draft__meta">
                    <span>{KIND_LABEL[draft.kind]}</span>
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
          <span className="vd-home__count">3 định dạng</span>
        </div>

        <div className="vd-cards">
          {CARDS.map((card) => (
            <button
              type="button"
              key={card.kind}
              className={`vd-card is-${card.kind}`}
              onClick={() => onCreate(card.kind)}
            >
              <span className="vd-card__glyph" aria-hidden="true">
                {KIND_GLYPH[card.kind]}
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
              const size = formatFileSize(entry.size);
              const missing = entry.path !== null && !entry.exists;

              return (
                <li className="vd-recent" key={entry.id}>
                  <button
                    type="button"
                    className="vd-recent__open"
                    onClick={() => onOpenRecent(entry)}
                  >
                    <span
                      className={`vd-recent__badge is-${kind}`}
                      aria-hidden="true"
                    >
                      {KIND_GLYPH[kind]}
                    </span>
                    <span className="vd-recent__info">
                      <span className="vd-recent__name">{entry.name}</span>
                      <span className="vd-recent__meta">
                        <span className="vd-recent__kind">{KIND_LABEL[kind]}</span>
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
  );
}
