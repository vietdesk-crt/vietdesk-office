import {
  RECENT_LIMIT_OPTIONS,
  type CoreInfo,
} from "@vietdesk/ipc-contract";
import {
  Check,
  History,
  Info,
  Languages,
  Loader2,
  Palette,
  RefreshCw,
  Sun,
  Trash2,
} from "lucide-react";
import { type ThemePreference } from "./settings";

export interface SettingsProps {
  themePreference: ThemePreference;
  onThemePreference: (preference: ThemePreference) => void;

  recentLimit: number;
  onRecentLimit: (limit: number) => void;
  recentCount: number;
  pinnedCount: number;
  /** null khi chạy bằng localStorage (trình duyệt). */
  storePath: string | null;
  onClearRecents: () => void;

  core: CoreInfo | null;
  coreError: string | null;
  refreshingCore: boolean;
  onRefreshCore: () => void;
}

const APP_VERSION = "0.1.0";

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  {
    value: "light",
    label: "Sáng",
    description: "Nền sáng ấm, rõ nét, tối ưu cho môi trường văn phòng thuần Việt.",
    icon: Sun,
  },
];

/**
 * Trang Cài đặt dành cho người dùng.
 *
 * Chỉ hiển thị những lựa chọn thật sự có tác dụng, diễn đạt bằng ngôn ngữ
 * thường ngày; thông tin kỹ thuật (đường dẫn lưu, bộ xử lý) được thu gọn
 * trong mục “Thông tin…” để không làm rối giao diện.
 */
export function Settings({
  themePreference,
  onThemePreference,
  recentLimit,
  onRecentLimit,
  recentCount,
  pinnedCount,
  storePath,
  onClearRecents,
  core,
  coreError,
  refreshingCore,
  onRefreshCore,
}: SettingsProps) {
  const coreState = coreError ? "error" : core ? "ready" : "checking";
  const coreLabel = coreError
    ? "Tạm gián đoạn"
    : core
      ? "Sẵn sàng"
      : "Đang kiểm tra…";
  const coreDescription = coreError
    ? "Công cụ tiếng Việt chưa phản hồi. Bạn vẫn có thể soạn thảo; hãy thử kiểm tra lại hoặc khởi động lại ứng dụng."
    : core
      ? "Kiểm tra chính tả, chuẩn hoá dấu và xử lý văn bản tiếng Việt đang hoạt động bình thường."
      : "Đang kết nối tới bộ xử lý tiếng Việt…";

  const runtimeDetail =
    core?.runtime === "c++"
      ? `Bộ xử lý gốc ${core.version}`
      : core
        ? "Bộ xử lý dự phòng trên trình duyệt"
        : coreError ?? "Đang kết nối…";

  const recentSummary =
    recentCount === 0
      ? "Chưa có tệp nào. Danh sách sẽ tự cập nhật khi bạn mở tài liệu."
      : `Đang lưu ${recentCount} tệp${
          pinnedCount > 0 ? `, trong đó ${pinnedCount} tệp đã ghim` : ""
        }. Khi vượt mức, tệp lâu nhất sẽ tự ẩn.`;

  return (
    <div className="vd-settings">
      <div className="vd-settings__inner">
        <header className="vd-settings__hero">
          <h1>Cài đặt</h1>
          <p className="vd-settings__lead">
            Tuỳ chỉnh giao diện và cách VietDesk quản lý tệp gần đây. Thay đổi
            được lưu tự động trên máy này.
          </p>
        </header>

        <section
          className="vd-settings__panel"
          aria-labelledby="vd-settings-theme"
        >
          <h2 id="vd-settings-theme" className="vd-settings__panel-title">
            <span className="vd-settings__panel-icon">
              <Palette size={16} aria-hidden="true" />
            </span>
            Giao diện
          </h2>
          <p className="vd-settings__panel-desc">
            Ứng dụng sử dụng chuẩn giao diện Sáng tối ưu cho môi trường văn phòng tiếng Việt.
          </p>

          <div
            className="vd-theme-options"
            role="radiogroup"
            aria-label="Chế độ màu"
          >
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = themePreference === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`vd-theme-option${active ? " is-active" : ""}`}
                  onClick={() => onThemePreference(option.value)}
                >
                  <span
                    className={`vd-theme-option__preview vd-theme-option__preview--${option.value}`}
                    aria-hidden="true"
                  />
                  <span className="vd-theme-option__label">
                    <Icon size={15} aria-hidden="true" />
                    {option.label}
                    {active ? (
                      <Check
                        size={15}
                        className="vd-theme-option__check"
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                  <span className="vd-theme-option__desc">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section
          className="vd-settings__panel"
          aria-labelledby="vd-settings-recents"
        >
          <h2 id="vd-settings-recents" className="vd-settings__panel-title">
            <span className="vd-settings__panel-icon">
              <History size={16} aria-hidden="true" />
            </span>
            Tệp gần đây
          </h2>
          <p className="vd-settings__panel-desc">
            VietDesk ghi nhớ những tệp bạn mở để bạn quay lại nhanh từ trang
            chủ.
          </p>

          <div className="vd-setting">
            <div className="vd-setting__text">
              <span className="vd-setting__label">Hiển thị tối đa</span>
              <span className="vd-setting__desc">{recentSummary}</span>
            </div>

            <div
              className="vd-segmented"
              role="radiogroup"
              aria-label="Số tệp gần đây tối đa"
            >
              {RECENT_LIMIT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={recentLimit === option}
                  className={`vd-segmented__item${recentLimit === option ? " is-active" : ""}`}
                  onClick={() => onRecentLimit(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="vd-setting">
            <div className="vd-setting__text">
              <span className="vd-setting__label">Xoá danh sách gần đây</span>
              <span className="vd-setting__desc">
                Chỉ xoá lịch sử trong ứng dụng. Tệp trên máy của bạn không bị
                ảnh hưởng.
              </span>
            </div>

            <div className="vd-setting__control">
              <button
                type="button"
                className="vd-button is-danger"
                onClick={onClearRecents}
                disabled={recentCount === 0}
              >
                <Trash2 size={14} aria-hidden="true" />
                Xoá lịch sử
              </button>
            </div>
          </div>

          <details className="vd-settings__details">
            <summary>Nơi lưu lịch sử</summary>
            <dl>
              <dt>Vị trí</dt>
              <dd>
                {storePath ? (
                  <code>{storePath}</code>
                ) : (
                  "Lưu trong trình duyệt trên máy này"
                )}
              </dd>
              <dt>Đang lưu</dt>
              <dd>
                {recentCount} tệp
                {pinnedCount > 0 ? ` · ${pinnedCount} đã ghim` : ""}
              </dd>
            </dl>
          </details>
        </section>

        <section
          className="vd-settings__panel"
          aria-labelledby="vd-settings-language"
        >
          <h2 id="vd-settings-language" className="vd-settings__panel-title">
            <span className="vd-settings__panel-icon">
              <Languages size={16} aria-hidden="true" />
            </span>
            Tiếng Việt
          </h2>
          <p className="vd-settings__panel-desc">
            Kiểm tra chính tả, chuẩn hoá dấu và xử lý văn bản tiếng Việt ngay
            trên máy.
          </p>

          <div className="vd-setting">
            <div className="vd-setting__text">
              <span className={`vd-settings__status is-${coreState}`}>
                <span className="vd-settings__status-dot" aria-hidden="true" />
                {coreLabel}
              </span>
              <span className="vd-setting__desc">{coreDescription}</span>
            </div>

            <div className="vd-setting__control">
              <button
                type="button"
                className="vd-button"
                onClick={onRefreshCore}
                disabled={refreshingCore}
              >
                {refreshingCore ? (
                  <Loader2 size={14} className="vd-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw size={14} aria-hidden="true" />
                )}
                {coreError ? "Thử lại" : "Kiểm tra lại"}
              </button>
            </div>
          </div>

          <details className="vd-settings__details">
            <summary>Thông tin kỹ thuật</summary>
            <dl>
              <dt>Bộ xử lý</dt>
              <dd>{runtimeDetail}</dd>
              {coreError ? (
                <>
                  <dt>Chi tiết</dt>
                  <dd>{coreError}</dd>
                </>
              ) : null}
            </dl>
          </details>
        </section>

        <section
          className="vd-settings__panel"
          aria-labelledby="vd-settings-about"
        >
          <h2 id="vd-settings-about" className="vd-settings__panel-title">
            <span className="vd-settings__panel-icon">
              <Info size={16} aria-hidden="true" />
            </span>
            Giới thiệu
          </h2>

          <div className="vd-settings__about-card">
            <img
              src="/vietdesk-app-icon.png"
              alt="VietDesk App Icon"
              className="vd-settings__app-icon"
              width={56}
              height={56}
            />
            <div className="vd-settings__about-brand">
              <div className="vd-settings__wordmark-stage">
                <img
                  src="/vietdesk-wordmark-banner.png"
                  alt="VietDesk - Bộ ứng dụng văn phòng Việt"
                  className="vd-settings__wordmark-img"
                  height={32}
                />
              </div>
              <span className="vd-settings__app-name">VietDesk Office</span>
              <span className="vd-settings__app-meta">
                Phiên bản {APP_VERSION} · Bộ ứng dụng văn phòng tiếng Việt thuần khiết
              </span>
            </div>
          </div>

          <p className="vd-settings__about-text">
            Soạn văn bản, bảng tính và trình chiếu với đầy đủ tiếng Việt. Tài
            liệu của bạn được lưu trên máy này và không gửi lên máy chủ.
          </p>

          <dl className="vd-settings__facts">
            <div>
              <dt>Định dạng hỗ trợ</dt>
              <dd>
                VietDesk (.vdx) · Word (.docx) · Excel (.xlsx) · PowerPoint
                (.pptx) · OpenDocument (.odt, .ods, .odp)
              </dd>
            </div>
            <div>
              <dt>Tự lưu</dt>
              <dd>Bản nháp được lưu sau 1,5 giây khi đang soạn</dd>
            </div>
            <div>
              <dt>Dữ liệu</dt>
              <dd>Lưu trên máy của bạn</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
