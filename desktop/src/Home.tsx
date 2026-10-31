import { kindFromFileName } from "@vietdesk/ipc-contract";
import type { RecentEntry } from "@vietdesk/ipc-contract";
import { normalizeForSearch } from "@vietdesk/vietnamese";
import { useMemo, useState } from "react";
import { APPS, HOME_CARDS, appDisplay } from "./apps";
import type { AppId } from "./apps";
import type { Draft } from "./drafts";
import { formatFileSize, formatRelativeTime } from "./format";
import { HOME_TEMPLATES } from "./templates";
import { List, LayoutGrid, Search, FileUp, Trash2, X } from "lucide-react";

interface DeleteConfirmTarget {
  type: "recent" | "draft" | "clear-all";
  name: string;
  detail: string;
  onConfirm: () => void;
}

export interface HomeProps {
  recents: RecentEntry[];
  loading: boolean;
  error: string | null;
  theme?: "light" | "dark";
  drafts?: Draft[];
  onCreate: (kind: AppId, initialContent?: unknown, customName?: string) => void;
  onOpenRecent: (entry: RecentEntry) => void;
  onOpenFile: () => void;
  onTogglePin: (entry: RecentEntry) => void;
  onRemove: (entry: RecentEntry) => void;
  onClearAll: () => void;
  onRestoreDraft?: (draft: Draft) => void;
  onDiscardDraft?: (draft: Draft) => void;
}

type RecentFilter = "all" | "pinned" | "writer" | "sheets" | "slides";

export function Home({
  recents,
  loading,
  error,
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
  const [filter, setFilter] = useState<RecentFilter>("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [confirmDelete, setConfirmDelete] = useState<DeleteConfirmTarget | null>(null);
  const normalizedQuery = normalizeForSearch(query);

  const filtered = useMemo(() => {
    let list = recents;
    if (filter === "pinned") {
      list = list.filter((entry) => entry.pinned);
    } else if (filter === "writer" || filter === "sheets" || filter === "slides") {
      list = list.filter((entry) => {
        const kind = entry.kind === "unknown" ? kindFromFileName(entry.name) : entry.kind;
        return kind === filter;
      });
    }

    if (!normalizedQuery) {
      return list;
    }
    return list.filter((entry) =>
      normalizeForSearch(`${entry.name} ${entry.path ?? ""}`).includes(
        normalizedQuery,
      ),
    );
  }, [recents, filter, normalizedQuery]);

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

  const [templateFilter, setTemplateFilter] = useState<"all" | "writer" | "sheets" | "slides">("all");

  const filteredTemplates = useMemo(() => {
    if (templateFilter === "all") return HOME_TEMPLATES;
    return HOME_TEMPLATES.filter((tpl) => tpl.appId === templateFilter);
  }, [templateFilter]);

  return (
    <div className="vd-home">
      <div className="vd-home__backdrop" aria-hidden="true" />
      <div className="vd-home__inner">
        {/* HERO SECTION - Thiết kế đồng bộ theo ảnh mẫu bản sắc Việt */}
        <header className="vd-home__hero">
          <div className="vd-home__hero-trong-dong" aria-hidden="true" />
          <div className="vd-home__hero-body">
            <div className="vd-home__hero-text">
              {/* Eyebrow badge từ ảnh mẫu */}
              <div className="vd-home__eyebrow-wrap">
                <span className="vd-home__eyebrow-pill">
                  <span className="vd-home__eyebrow-dot" aria-hidden="true">●</span>
                  Miễn phí · Không quảng cáo · Không cần đăng ký
                </span>
              </div>

              {/* Tiêu đề 2 dòng chuẩn chữ và màu ảnh mẫu */}
              <h1 className="vd-home__hero-title">
                Viết, tính toán, thuyết trình –<br />
                <span className="vd-home__hero-accent">miễn phí cho người Việt</span>
              </h1>

              {/* Lời dẫn văn bản chuẩn theo ảnh mẫu */}
              <p className="vd-home__lead">
                VietDesk là bộ văn phòng gồm <strong>Writer</strong> (viết văn bản), <strong>Sheets</strong> (bảng tính) và <strong>Slides</strong> (slide thuyết trình), gói gọn trong một ứng dụng duy nhất trên máy tính của bạn. Mở là làm việc ngay — không tốn tiền, không quảng cáo, không cần Internet.
              </p>

              {/* Hai nút hành động CTA theo ảnh mẫu */}
              <div className="vd-home__cta-row">
                <button
                  type="button"
                  className="vd-button is-primary vd-home__quick-open-btn vd-home__btn-primary"
                  onClick={onOpenFile}
                >
                  <FileUp size={16} strokeWidth={2} aria-hidden="true" />
                  <span>Dùng thử miễn phí</span>
                </button>
                <button
                  type="button"
                  className="vd-home__btn-secondary"
                  onClick={() => {
                    document.getElementById("vd-create-heading")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Xem làm được gì
                </button>
              </div>
            </div>
          </div>

          {/* Search bar 48px */}
          <div className="vd-home__search-row">
            <div className="vd-home__smart-search-box">
              <span className="vd-home__smart-search-icon" aria-hidden="true">
                <Search size={16} strokeWidth={2} />
              </span>
              <input
                type="search"
                className="vd-home__smart-search-input"
                placeholder="Tìm kiếm tài liệu, công văn, bảng tính... (Lọc nhanh theo tên hoặc đường dẫn)"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Tìm kiếm tài liệu"
              />
              {query ? (
                <button
                  type="button"
                  className="vd-home__search-clear"
                  onClick={() => setQuery("")}
                  title="Xóa tìm kiếm"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>

          {/* Feature badges as small pills below search */}
          <div className="vd-home__hero-pills">
            <span className="vd-home__hero-pill">Miễn phí 100%</span>
            <span className="vd-home__hero-pill">Không quảng cáo</span>
            <span className="vd-home__hero-pill">Không cần mạng</span>
            <span className="vd-home__hero-pill">Dữ liệu nằm trên máy bạn</span>
          </div>
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
                      onClick={() =>
                        setConfirmDelete({
                          type: "draft",
                          name: draft.name,
                          detail:
                            "Bản nháp này chưa được lưu chính thức. Khi xoá, nội dung tạm thời này sẽ bị mất hoàn toàn và không thể khôi phục lại được.",
                          onConfirm: () => onDiscardDraft?.(draft),
                        })
                      }
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* CREATE NEW SECTION (3 cards in a row, equal visual weight, 64x64 icon, title, 2-line desc, format tags) */}
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
                <div className="vd-card__icon-box" aria-hidden="true">
                  <span className="vd-card__glyph">
                    {APPS[card.kind].glyph}
                  </span>
                </div>
                <div className="vd-card__content">
                  <strong className="vd-card__title">{card.title}</strong>
                  <p className="vd-card__desc">{card.description}</p>
                  <div className="vd-card__format-tags">
                    {card.kind === "writer" ? (
                      <>
                        <span className="vd-format-tag">.vdx</span>
                        <span className="vd-format-tag">.docx</span>
                        <span className="vd-format-tag">.odt</span>
                        <span className="vd-format-tag">.pdf</span>
                      </>
                    ) : card.kind === "sheets" ? (
                      <>
                        <span className="vd-format-tag">.vdx</span>
                        <span className="vd-format-tag">.xlsx</span>
                        <span className="vd-format-tag">.ods</span>
                        <span className="vd-format-tag">.csv</span>
                      </>
                    ) : (
                      <>
                        <span className="vd-format-tag">.vdx</span>
                        <span className="vd-format-tag">.pptx</span>
                        <span className="vd-format-tag">.odp</span>
                        <span className="vd-format-tag">16:9</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* RECENT FILES (Table view with name, type, modified date, size; empty state with large illustration + CTA) */}
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
              <div className="vd-home__view-toggle" role="group" aria-label="Kiểu hiển thị danh sách">
                <button
                  type="button"
                  className={`vd-home__view-btn${viewMode === "list" ? " is-active" : ""}`}
                  onClick={() => setViewMode("list")}
                  title="Dạng bảng danh sách"
                  aria-label="Xem dạng bảng danh sách"
                >
                  <List size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`vd-home__view-btn${viewMode === "grid" ? " is-active" : ""}`}
                  onClick={() => setViewMode("grid")}
                  title="Dạng lưới thẻ"
                  aria-label="Xem dạng lưới thẻ"
                >
                  <LayoutGrid size={16} aria-hidden="true" />
                </button>
              </div>
              <button type="button" className="vd-button is-primary" onClick={onOpenFile}>
                Mở tệp…
              </button>
            </div>
          </div>

          {recents.length > 0 && (
            <div className="vd-home__filter-bar" role="tablist" aria-label="Bộ lọc tệp gần đây">
              <button
                type="button"
                role="tab"
                aria-selected={filter === "all"}
                className={`vd-home__filter-btn${filter === "all" ? " is-active" : ""}`}
                onClick={() => setFilter("all")}
              >
                Tất cả ({recents.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "pinned"}
                className={`vd-home__filter-btn${filter === "pinned" ? " is-active" : ""}`}
                onClick={() => setFilter("pinned")}
              >
                Đã ghim ({pinnedCount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "writer"}
                className={`vd-home__filter-btn${filter === "writer" ? " is-active" : ""}`}
                onClick={() => setFilter("writer")}
              >
                Văn bản ({docStats.writer})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "sheets"}
                className={`vd-home__filter-btn${filter === "sheets" ? " is-active" : ""}`}
                onClick={() => setFilter("sheets")}
              >
                Bảng tính ({docStats.sheets})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "slides"}
                className={`vd-home__filter-btn${filter === "slides" ? " is-active" : ""}`}
                onClick={() => setFilter("slides")}
              >
                Trình chiếu ({docStats.slides})
              </button>
            </div>
          )}

          {error ? <p className="vd-home__error">Không đọc được lịch sử: {error}</p> : null}

          {loading ? (
            <p className="vd-home__placeholder">Đang tải danh sách…</p>
          ) : filtered.length === 0 ? (
            <div className="vd-home__empty-state">
              <div className="vd-home__empty-illustration" aria-hidden="true">
                <svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="14" y="24" width="60" height="46" rx="8" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" />
                  <path d="M14 34C14 28.4772 18.4772 24 24 24H36L42 30H64C69.5228 30 74 34.4772 74 40V62C74 67.5228 69.5228 72 64 72H24C18.4772 72 14 67.5228 14 62V34Z" fill="#ffffff" stroke="#1a56db" strokeWidth="2" />
                  <line x1="28" y1="46" x2="52" y2="46" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
                  <line x1="28" y1="54" x2="44" y2="54" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="58" cy="20" r="4" fill="#059669" opacity="0.6" />
                  <circle cx="70" cy="28" r="2.5" fill="#dc2626" opacity="0.5" />
                </svg>
              </div>
              <h3 className="vd-home__empty-title">
                {recents.length === 0
                  ? "Chưa có tệp nào"
                  : "Không có tệp nào khớp với từ khoá"}
              </h3>
              <p className="vd-home__empty-desc">
                {recents.length === 0
                  ? "Tài liệu bạn mở hoặc tạo mới sẽ xuất hiện tại đây để bạn tiếp tục công việc nhanh chóng."
                  : "Hãy thử kiểm tra lại từ khoá tìm kiếm hoặc chọn bộ lọc khác."}
              </p>
              {recents.length === 0 ? (
                <button
                  type="button"
                  className="vd-button is-primary vd-home__empty-cta"
                  onClick={onOpenFile}
                >
                  Mở tệp từ máy…
                </button>
              ) : null}
            </div>
          ) : viewMode === "list" ? (
            /* Table view with name, type, modified date, size */
            <div className="vd-recent-table-wrap">
              <table className="vd-recent-table" aria-label="Bảng tệp gần đây">
                <thead>
                  <tr>
                    <th scope="col" className="col-name">Tên tệp</th>
                    <th scope="col" className="col-type">Loại</th>
                    <th scope="col" className="col-date">Ngày sửa</th>
                    <th scope="col" className="col-size">Kích thước</th>
                    <th scope="col" className="col-actions"><span className="vd-visually-hidden">Thao tác</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => {
                    const kind = entry.kind === "unknown" ? kindFromFileName(entry.name) : entry.kind;
                    const meta = appDisplay(kind);
                    const size = formatFileSize(entry.size);
                    const missing = entry.path !== null && !entry.exists;
                    return (
                      <tr key={entry.id} className={`vd-recent-row is-${kind}${entry.pinned ? " is-pinned" : ""}`}>
                        <td className="col-name">
                          <button
                            type="button"
                            className="vd-recent__open-link"
                            onClick={() => onOpenRecent(entry)}
                          >
                            <span className={`vd-recent__badge is-${kind}`} aria-hidden="true">
                              {meta.glyph}
                            </span>
                            <span className="vd-recent__name-wrap">
                              <strong className="vd-recent__name">{entry.name}</strong>
                              <span className="vd-recent__path" title={entry.path ?? "Chưa lưu vào đĩa"}>
                                {entry.path ?? "Chưa lưu vào đĩa"}
                              </span>
                              {missing ? <span className="vd-recent__missing">không tìm thấy</span> : null}
                            </span>
                          </button>
                        </td>
                        <td className="col-type">
                          <span className={`vd-recent-type-pill is-${kind}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="col-date">
                          <span className="vd-recent-date">{formatRelativeTime(entry.openedAt)}</span>
                        </td>
                        <td className="col-size">
                          <span className="vd-recent-size">{size || "—"}</span>
                        </td>
                        <td className="col-actions">
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
                              aria-label={`Xoá ${entry.name} khỏi danh sách gần đây`}
                              onClick={() =>
                                setConfirmDelete({
                                  type: "recent",
                                  name: entry.name,
                                  detail:
                                    "Tệp này sẽ được xoá khỏi danh sách tài liệu mở gần đây. Tệp gốc trên đĩa máy tính của bạn vẫn được giữ nguyên an toàn.",
                                  onConfirm: () => onRemove(entry),
                                })
                              }
                            >
                              ×
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="vd-recents vd-recents--grid">
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
                    className={`vd-recent-card is-${kind}${entry.pinned ? " is-pinned" : ""}`}
                    key={entry.id}
                  >
                    <button
                      type="button"
                      className="vd-recent-card__body"
                      onClick={() => onOpenRecent(entry)}
                    >
                      <div className={`vd-recent-card__banner is-${kind}`}>
                        <span className={`vd-recent__badge is-${kind}`} aria-hidden="true">
                          {meta.glyph}
                        </span>
                        <span className="vd-recent-card__kind-tag">{meta.label}</span>
                      </div>
                      <div className="vd-recent-card__info">
                        <strong className="vd-recent__name vd-recent-card__title" title={entry.name}>
                          {entry.name}
                        </strong>
                        <span className="vd-recent-card__path" title={entry.path ?? "Chưa lưu vào đĩa"}>
                          {entry.path ?? "Chưa lưu vào đĩa"}
                        </span>
                        <div className="vd-recent-card__footer">
                          <span>{formatRelativeTime(entry.openedAt)}</span>
                          {size ? <span>· {size}</span> : null}
                          {missing ? <span className="vd-recent__missing">không tìm thấy</span> : null}
                        </div>
                      </div>
                    </button>
                    <div className="vd-recent-card__actions">
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
                        aria-label={`Xoá ${entry.name} khỏi danh sách gần đây`}
                        onClick={() =>
                          setConfirmDelete({
                            type: "recent",
                            name: entry.name,
                            detail:
                              "Tệp này sẽ được xoá khỏi danh sách tài liệu mở gần đây. Tệp gốc trên đĩa máy tính của bạn vẫn được giữ nguyên an toàn.",
                            onConfirm: () => onRemove(entry),
                          })
                        }
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
            <div className="vd-recents__footer">
              <span className="vd-recents__hint">
                <span className="vd-recents__hint-dot" aria-hidden="true" />
                Lưu trữ an toàn trên máy bạn · Chuẩn bảo mật nội bộ
              </span>
              <button
                type="button"
                className="vd-link vd-recents__clear-btn"
                onClick={() =>
                  setConfirmDelete({
                    type: "clear-all",
                    name: "toàn bộ lịch sử gần đây",
                    detail:
                      "Hành động này sẽ dọn sạch toàn bộ danh sách tài liệu đã mở gần đây. Các tệp gốc trên đĩa máy tính vẫn được giữ nguyên không bị thay đổi.",
                    onConfirm: () => onClearAll(),
                  })
                }
              >
                Xoá lịch sử gần đây
              </button>
            </div>
          ) : null}
        </section>

        {/* TEMPLATES (4 cards per row max, larger thumbnails 160x120px, full title visible, category tabs) */}
        <section className="vd-home__section vd-home__templates-section" aria-labelledby="vd-templates-heading">
          <div className="vd-home__section-head">
            <div className="vd-home__section-title-wrap">
              <h2 id="vd-templates-heading">Mẫu tài liệu chuẩn Việt</h2>
              <span className="vd-home__count">{filteredTemplates.length} mẫu</span>
            </div>

            <div className="vd-templates__tabs" role="tablist" aria-label="Lọc mẫu tài liệu">
              <button
                type="button"
                role="tab"
                aria-selected={templateFilter === "all"}
                className={`vd-templates__tab${templateFilter === "all" ? " is-active" : ""}`}
                onClick={() => setTemplateFilter("all")}
              >
                Tất cả
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={templateFilter === "writer"}
                className={`vd-templates__tab is-writer${templateFilter === "writer" ? " is-active" : ""}`}
                onClick={() => setTemplateFilter("writer")}
              >
                Văn bản ({HOME_TEMPLATES.filter((t) => t.appId === "writer").length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={templateFilter === "sheets"}
                className={`vd-templates__tab is-sheets${templateFilter === "sheets" ? " is-active" : ""}`}
                onClick={() => setTemplateFilter("sheets")}
              >
                Bảng tính ({HOME_TEMPLATES.filter((t) => t.appId === "sheets").length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={templateFilter === "slides"}
                className={`vd-templates__tab is-slides${templateFilter === "slides" ? " is-active" : ""}`}
                onClick={() => setTemplateFilter("slides")}
              >
                Trình chiếu ({HOME_TEMPLATES.filter((t) => t.appId === "slides").length})
              </button>
            </div>
          </div>

          <div className="vd-templates-grid-wrap">
            <div className="vd-templates-grid">
              {filteredTemplates.map((tpl) => (
                <button
                  type="button"
                  key={tpl.id}
                  className={`vd-template-card is-${tpl.appId}`}
                  onClick={() => onCreate(tpl.appId, tpl.getContent(), tpl.documentName)}
                  title={`${tpl.title} — ${tpl.description}`}
                >
                  {/* Larger Thumbnail Preview (160x120px) */}
                  <div className={`vd-template-card__preview is-${tpl.appId}`} aria-hidden="true">
                    {tpl.appId === "writer" ? (
                      <div className="vd-template-preview__paper">
                        <div className="vd-template-preview__line is-header" />
                        <div className="vd-template-preview__subline" />
                        <div className="vd-template-preview__divider" />
                        <div className="vd-template-preview__line is-title" />
                        <div className="vd-template-preview__body">
                          <div className="vd-template-preview__line" />
                          <div className="vd-template-preview__line is-short" />
                          <div className="vd-template-preview__line" />
                        </div>
                        <div className="vd-template-preview__seal" />
                      </div>
                    ) : tpl.appId === "sheets" ? (
                      <div className="vd-template-preview__paper is-sheet">
                        <div className="vd-template-preview__sheet-header" />
                        <div className="vd-template-preview__sheet-grid">
                          <span /><span /><span />
                          <span /><span /><span />
                          <span /><span /><span />
                          <span className="is-total" /><span className="is-total" /><span className="is-total" />
                        </div>
                      </div>
                    ) : (
                      <div className="vd-template-preview__slide">
                        <div className="vd-template-preview__slide-header" />
                        <div className="vd-template-preview__slide-body">
                          <div className="vd-template-preview__slide-card is-primary" />
                          <div className="vd-template-preview__slide-card is-secondary" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="vd-template-card__info">
                    <div className="vd-template-card__header">
                      <span className={`vd-template-card__badge is-${tpl.appId}`}>
                        {APPS[tpl.appId].glyph} {tpl.badge}
                      </span>
                      <span className="vd-template-card__app">{APPS[tpl.appId].label}</span>
                    </div>
                    {/* Full title visible, no truncation */}
                    <strong className="vd-template-card__title">{tpl.title}</strong>
                    <p className="vd-template-card__desc">{tpl.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ECOSYSTEM SHOWCASE BANNER - Tích hợp Biểu trưng & Logo chuẩn nhận diện */}
        <div className="vd-home__ecosystem-banner">
          <div className="vd-home__ecosystem-left">
            <img
              src="/vietdesk-app-icon.png"
              alt="Biểu trưng VietDesk"
              className="vd-home__ecosystem-icon"
              width={48}
              height={48}
            />
            <div className="vd-home__ecosystem-text">
              <img
                src="/vietdesk-wordmark-banner.png"
                alt="VietDesk - Bộ ứng dụng văn phòng Việt"
                className="vd-home__ecosystem-wordmark-img"
                height={26}
              />
              <p className="vd-home__ecosystem-desc">
                Bộ ứng dụng văn phòng tiếng Việt độc lập · Bảo mật dữ liệu nội bộ trên máy · Chuẩn thể thức NĐ 30/2020
              </p>
            </div>
          </div>
          <div className="vd-home__ecosystem-badges">
            <span className="vd-ecosystem-tag is-writer">Writer · Soạn thảo</span>
            <span className="vd-ecosystem-tag is-sheets">Sheets · Bảng tính</span>
            <span className="vd-ecosystem-tag is-slides">Slides · Trình chiếu</span>
          </div>
        </div>
      </div>

      {confirmDelete ? (
        <div
          className="vd-confirm-modal__backdrop"
          role="presentation"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="vd-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vd-confirm-modal-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setConfirmDelete(null);
            }}
          >
            <div className="vd-confirm-modal__header">
              <div className="vd-confirm-modal__icon-wrap" aria-hidden="true">
                <Trash2 size={22} className="vd-confirm-modal__icon" />
              </div>
              <div className="vd-confirm-modal__title-box">
                <h3 id="vd-confirm-modal-title" className="vd-confirm-modal__title">
                  {confirmDelete.type === "draft"
                    ? "Xác nhận xoá bản nháp"
                    : confirmDelete.type === "clear-all"
                      ? "Xác nhận xoá toàn bộ lịch sử"
                      : "Xác nhận xoá tệp gần đây"}
                </h3>
                <span className="vd-confirm-modal__target-name" title={confirmDelete.name}>
                  {confirmDelete.name}
                </span>
              </div>
              <button
                type="button"
                className="vd-confirm-modal__close-btn"
                onClick={() => setConfirmDelete(null)}
                aria-label="Đóng hộp thoại"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <p className="vd-confirm-modal__detail">{confirmDelete.detail}</p>

            <div className="vd-confirm-modal__actions">
              <button
                type="button"
                className="vd-confirm-modal__btn vd-confirm-modal__btn--cancel"
                onClick={() => setConfirmDelete(null)}
                autoFocus
              >
                Huỷ bỏ
              </button>
              <button
                type="button"
                className="vd-confirm-modal__btn vd-confirm-modal__btn--danger"
                onClick={() => {
                  const action = confirmDelete.onConfirm;
                  setConfirmDelete(null);
                  action();
                }}
              >
                Xác nhận xoá
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
