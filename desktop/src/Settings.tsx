import {
  RECENT_LIMIT_OPTIONS,
  type CoreInfo,
} from "@vietdesk/ipc-contract";
import {
  Cpu,
  History,
  Info,
  Loader2,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Sun,
  Trash2,
} from "lucide-react";
import type { ThemePreference } from "./settings";

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

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
  { value: "system", label: "Theo hệ thống", icon: Monitor },
];

/**
 * Trang Cài đặt.
 *
 * Nguyên tắc: mỗi điều khiển ở đây phải thật sự có tác dụng. Những mục chưa
 * làm được (đồng bộ đám mây, kiểu gõ, mẫu NĐ30) không hiển thị để tránh
 * giao diện giả.
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
  const runtime =
    core?.runtime === "c++"
      ? `Lõi C++ ${core.version}`
      : core
        ? "Bản web (fallback TypeScript)"
        : coreError
          ? "Không kết nối được lõi"
          : "Đang kiểm tra…";

  return (
    <div className="vd-settings">
      <header className="vd-settings__hero">
        <p className="vd-settings__eyebrow">VietDesk Office</p>
        <h1>Cài đặt</h1>
        <p className="vd-settings__lead">
          Tuỳ chọn giao diện, lịch sử tệp và trạng thái lõi xử lý. Mọi thay đổi
          được lưu ngay trên máy này.
        </p>
      </header>

      <section className="vd-settings__panel" aria-labelledby="vd-settings-theme">
        <h2 id="vd-settings-theme" className="vd-settings__panel-title">
          <Palette size={15} aria-hidden="true" />
          Giao diện
        </h2>

        <div className="vd-setting">
          <div className="vd-setting__text">
            <span className="vd-setting__label">Chế độ màu</span>
            <span className="vd-setting__desc">
              “Theo hệ thống” sẽ tự đổi khi bạn bật chế độ tối của hệ điều hành.
            </span>
          </div>

          <div
            className="vd-segmented"
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
                  className={`vd-segmented__item${active ? " is-active" : ""}`}
                  onClick={() => onThemePreference(option.value)}
                >
                  <Icon size={14} aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="vd-settings__panel"
        aria-labelledby="vd-settings-recents"
      >
        <h2 id="vd-settings-recents" className="vd-settings__panel-title">
          <History size={15} aria-hidden="true" />
          Tệp gần đây
        </h2>

        <div className="vd-setting">
          <div className="vd-setting__text">
            <span className="vd-setting__label">Số tệp hiển thị</span>
            <span className="vd-setting__desc">
              Danh sách đang có {recentCount} tệp
              {pinnedCount > 0 ? `, ${pinnedCount} đã ghim` : ""}. Tệp cũ nhất
              sẽ bị loại khi vượt mức.
            </span>
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
            <span className="vd-setting__label">Nơi lưu lịch sử</span>
            <span className="vd-setting__desc">
              {storePath
                ? "Tệp JSON trong thư mục cấu hình của ứng dụng."
                : "Chế độ trình duyệt: lưu trong localStorage của trang."}
            </span>
            <code className="vd-setting__path">
              {storePath ?? "localStorage · vietdesk.recent.v1"}
            </code>
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
      </section>

      <section className="vd-settings__panel" aria-labelledby="vd-settings-core">
        <h2 id="vd-settings-core" className="vd-settings__panel-title">
          <Cpu size={15} aria-hidden="true" />
          Lõi xử lý
        </h2>

        <div className="vd-setting">
          <div className="vd-setting__text">
            <span className="vd-setting__label">Trạng thái</span>
            <span className="vd-setting__desc">
              {coreError
                ? coreError
                : core
                  ? "Lõi đang phản hồi. Các thao tác tiếng Việt chạy trong tiến trình gốc, không qua JavaScript."
                  : "Đang kiểm tra kết nối tới lõi…"}
            </span>
            <span
              className={`vd-setting__badge${
                core?.runtime === "c++"
                  ? " is-ok"
                  : coreError
                    ? " is-error"
                    : " is-muted"
              }`}
            >
              {runtime}
            </span>
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
              Kiểm tra lại
            </button>
          </div>
        </div>
      </section>

      <section className="vd-settings__panel" aria-labelledby="vd-settings-about">
        <h2 id="vd-settings-about" className="vd-settings__panel-title">
          <Info size={15} aria-hidden="true" />
          Giới thiệu
        </h2>

        <dl className="vd-settings__about">
          <dt>Ứng dụng</dt>
          <dd>VietDesk Office 0.1.0</dd>
          <dt>Vỏ desktop</dt>
          <dd>Tauri 2 · React 18 · TypeScript</dd>
          <dt>Lõi</dt>
          <dd>C++17 qua C ABI · cầu nối Rust</dd>
          <dt>Tiếng Việt</dt>
          <dd>Unicode NFC · bảng 12 nguyên âm × 6 thanh điệu</dd>
          <dt>Lưu trữ</dt>
          <dd>
            Định dạng gốc .vdx (JSON) · tự lưu sau 1,5 giây · khôi phục bản nháp
            khi mở lại
          </dd>
          <dt>Còn thiếu</dt>
          <dd>
            Engine bố cục A4, đọc/ghi OOXML, bảng mã TCVN3/VNI, xuất PDF — xem
            README.
          </dd>
        </dl>
      </section>
    </div>
  );
}
