import type { ReactNode } from "react";

export interface RailItem {
  id: string;
  label: string;
  /** Ký tự đại diện cho icon (chưa dùng icon font để tránh phụ thuộc). */
  glyph: string;
  /** Vẽ vạch ngăn cách phía trên mục này. */
  separatorBefore?: boolean;
  disabled?: boolean;
}

export interface AppRailProps {
  items: RailItem[];
  bottomItems?: RailItem[];
  active: string;
  onSelect: (id: string) => void;
  footer?: ReactNode;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

/**
 * Thanh điều hướng dọc chuẩn bộ ứng dụng văn phòng: 64px thu gọn / 240px mở rộng.
 * Trang chủ, Writer, Sheets, Slides, Cài đặt.
 */
export function AppRail({
  items,
  bottomItems,
  active,
  onSelect,
  footer,
  expanded = false,
  onToggleExpand,
}: AppRailProps) {
  return (
    <nav
      className={`vd-rail${expanded ? " is-expanded" : ""}`}
      aria-label="Điều hướng chính"
      data-expanded={expanded}
    >
      <div className="vd-rail__top">
        {onToggleExpand ? (
          <button
            type="button"
            className="vd-rail__toggle-btn"
            onClick={onToggleExpand}
            title={expanded ? "Thu gọn thanh bên (64px)" : "Mở rộng thanh bên (240px)"}
            aria-label={expanded ? "Thu gọn thanh bên" : "Mở rộng thanh bên"}
          >
            <span className="vd-rail__toggle-icon" aria-hidden="true">
              {expanded ? "«" : "»"}
            </span>
            {expanded ? <span className="vd-rail__toggle-text">Thu gọn</span> : null}
          </button>
        ) : null}
        <div className="vd-rail__items">
          {items.map((item) => (
            <div key={item.id} className="vd-rail__item-wrap">
              {item.separatorBefore ? <div className="vd-rail__separator" /> : null}
              <button
                type="button"
                className={`vd-rail__item is-${item.id}${active === item.id ? " is-active" : ""}`}
                aria-current={active === item.id ? "page" : undefined}
                title={item.label}
                disabled={item.disabled}
                onClick={() => onSelect(item.id)}
              >
                <span className="vd-rail__glyph" aria-hidden="true">
                  {item.glyph}
                </span>
                <span className="vd-rail__label">{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="vd-rail__footer">
        {footer}
        {bottomItems?.map((item) => (
          <div key={item.id} className="vd-rail__item-wrap" style={{ width: "100%" }}>
            {item.separatorBefore ? <div className="vd-rail__separator" /> : null}
            <button
              type="button"
              className={`vd-rail__item is-${item.id}${active === item.id ? " is-active" : ""}`}
              aria-current={active === item.id ? "page" : undefined}
              title={item.label}
              disabled={item.disabled}
              onClick={() => onSelect(item.id)}
            >
              <span className="vd-rail__glyph" aria-hidden="true">
                {item.glyph}
              </span>
              <span className="vd-rail__label">{item.label}</span>
            </button>
          </div>
        ))}
      </div>
    </nav>
  );
}
