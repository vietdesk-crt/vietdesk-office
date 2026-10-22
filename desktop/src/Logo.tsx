import type { SVGProps } from "react";

export interface VietDeskLogoProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
  theme?: "light" | "dark";
}

/**
 * Biểu trưng chính thức VietDesk Office (Phương án 1 - Dải Lụa Chữ V).
 * Hỗ trợ cả 2 chế độ hiển thị:
 * - light: Màu son mài cổ điển cho nền sáng (#F8F6F0 / Giấy Dó).
 * - dark: Màu son mài có độ phát quang nhẹ (#E2544B / #FCE1A8) cho nền tối (#181517 / Cánh Gián).
 */
export function VietDeskLogo({
  size = 24,
  theme = "light",
  className,
  ...props
}: VietDeskLogoProps) {
  const isDark = theme === "dark";

  const redPrimary = isDark ? "#E2544B" : "#C24138";
  const redSecondary = isDark ? "#BA332B" : "#B8362F";
  const goldPrimary = isDark ? "#FCE1A8" : "#D49A42";
  const goldSecondary = isDark ? "#E8BA6B" : "#FCE1A8";

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <g transform="translate(0, 10)">
        {/* Cánh trái: Đỏ son mài mềm mại */}
        <path
          d="M 121,120 C 136,120 171,150 191,210 C 211,270 231,355 256,395 C 231,375 181,290 151,220 C 131,175 111,135 121,120 Z"
          fill={redPrimary}
        />
        <path
          d="M 121,120 C 151,108 196,130 216,185 C 234,235 246,325 256,395 C 241,340 218,245 186,185 C 164,145 136,124 121,120 Z"
          fill={redSecondary}
          opacity="0.85"
        />

        {/* Cánh phải: Dải giấy văn phòng vàng mật ong thanh thoát */}
        <path
          d="M 256,395 C 276,345 311,255 351,185 C 378,140 404,120 391,120 C 376,120 351,145 326,195 C 296,255 271,335 256,395 Z"
          fill={goldPrimary}
        />
        <path
          d="M 256,395 C 282,335 331,235 381,160 C 401,130 416,128 408,135 C 386,155 341,250 288,340 C 271,368 261,385 256,395 Z"
          fill={goldSecondary}
          opacity="0.85"
        />

        {/* Ngôi sao vàng dịu */}
        <polygon
          points="331,105 337,119 351,119 340,127 344,142 331,133 318,142 322,127 311,119 325,119"
          fill={goldPrimary}
        />

        {/* Điểm kết nối nhẹ */}
        <circle cx="256" cy="395" r="5" fill={goldPrimary} />
      </g>
    </svg>
  );
}
