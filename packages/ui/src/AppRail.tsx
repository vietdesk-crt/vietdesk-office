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
  active: string;
  onSelect: (id: string) => void;
  footer?: ReactNode;
}

/**
 * Thanh điều hướng dọc kiểu WPS: Trang chủ + ba ứng dụng + tiện ích.
 * Chỉ trình bày, không giữ state.
 */
export function AppRail({ items, active, onSelect, footer }: AppRailProps) {
  return (
    <nav className="vd-rail" aria-label="Điều hướng chính">
      <div className="vd-rail__items">
        {items.map((item) => (
          <div key={item.id}>
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
      {footer ? <div className="vd-rail__footer">{footer}</div> : null}
    </nav>
  );
}
