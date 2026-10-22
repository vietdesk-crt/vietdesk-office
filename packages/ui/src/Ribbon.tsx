import type { ReactNode } from "react";

export interface RibbonItem {
  id: string;
  label: string;
  /** Ký tự/biểu tượng ngắn thay cho icon font. */
  glyph?: string;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

export interface RibbonGroup {
  id: string;
  label: string;
  items: RibbonItem[];
}

export interface RibbonProps {
  groups: RibbonGroup[];
  /** Nội dung bên phải thanh ribbon (ví dụ trạng thái lõi). */
  trailing?: ReactNode;
}

/**
 * Thanh Ribbon theo ngữ cảnh. Không chứa logic — chỉ trình bày.
 * Mọi hành động đi qua `onSelect`, nhờ vậy cùng một Ribbon dùng được cho
 * cả bản web và bản desktop.
 */
export function Ribbon({ groups, trailing }: RibbonProps) {
  return (
    <div className="vd-ribbon" role="toolbar" aria-label="Ribbon">
      {groups.map((group) => (
        <div className="vd-ribbon__group" key={group.id}>
          <div className="vd-ribbon__items">
            {group.items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`vd-ribbon__item${item.active ? " is-active" : ""}`}
                title={item.hint ?? item.label}
                disabled={item.disabled}
                aria-pressed={item.active ?? false}
                onClick={item.onSelect}
              >
                {item.glyph ? (
                  <span className="vd-ribbon__glyph" aria-hidden="true">
                    {item.glyph}
                  </span>
                ) : null}
                <span className="vd-ribbon__label">{item.label}</span>
              </button>
            ))}
          </div>
          {group.label ? (
            <div className="vd-ribbon__caption">{group.label}</div>
          ) : null}
        </div>
      ))}
      {trailing ? <div className="vd-ribbon__trailing">{trailing}</div> : null}
    </div>
  );
}
