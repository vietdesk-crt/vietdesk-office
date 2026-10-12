# VietDesk Office Suite

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Architecture: Master Blueprint](https://img.shields.io/badge/Architecture-Master%20Blueprint-brightgreen.svg)](docs/VIETDESK_SYSTEM_ARCHITECTURE.md)
[![Platform: Desktop & Web](https://img.shields.io/badge/Platform-Tauri%202.0%20%7C%20Web-orange.svg)]()

**VietDesk** là bộ ứng dụng văn phòng thế hệ mới (Next-Gen Office Suite) được thiết kế chuyên biệt cho người dùng và doanh nghiệp Việt Nam — mang đến hiệu năng vượt trội, chuẩn hóa văn bản hành chính (Nghị định 30/2020/NĐ-CP), khả năng tương thích định dạng chuẩn ECMA-376 (OOXML) và định hướng tiến hóa thành **Hệ điều hành Văn phòng Tự trị (Autonomous Office Agent)**.

---

## 🏛️ Tài liệu Kiến trúc Hệ thống & Luồng Logic Chi tiết

Toàn bộ bản thiết kế kỹ thuật, sơ đồ khối và 14 luồng logic hoàn chỉnh đã được quy chuẩn và ban hành tại:
* 📄 **[Tài liệu Thiết kế Kiến trúc & 14 Luồng Logic Chi tiết (ARCHITECTURE.md)](ARCHITECTURE.md)**
* 📁 **[Docs: VIETDESK_SYSTEM_ARCHITECTURE.md](docs/VIETDESK_SYSTEM_ARCHITECTURE.md)**

---

## 🚀 Lộ trình Tiến hóa 4 Cấp độ (The 4-Tier Evolution)

```
┌────────────────────────────────────────────────────────────────────────┐
│ 👑 CỬA CUỐI: AUTONOMOUS OFFICE AGENT (Hệ Điều Hành Tự Trị)             │
│   - Multi-Agent Orchestrator (Legal, Financial Auditor, Cross-Doc)     │
│   - Document AST Tooling (Thao tác trực tiếp cây cú pháp JSON)         │
│   - Single Source of Truth (Đồng bộ chéo Word - Excel - Slide)         │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │
┌───────────────────────────────────┴────────────────────────────────────┐
│ ⚡ CẤP ĐỘ 3: ULTIMATE (Enterprise Distributed Cloud Grid)              │
│   - Real-time CRDT Collab (< 30ms latency, Yjs / Hocuspocus)           │
│   - Time-Machine Version History & MinIO S3 Object Storage             │
│   - Dynamic Watermark, DLP Security & Granular RBAC Permissions        │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │
┌───────────────────────────────────┴────────────────────────────────────┐
│ 💼 CẤP ĐỘ 2: PRO (Standard Suite & Chuẩn Nghị định 30)                 │
│   - Virtual Paged Canvas Engine (Ngắt trang A4 milimet in ấn)          │
│   - Round-Trip OOXML 2 chiều (.docx / .xlsx chuẩn ECMA-376)            │
│   - Accounting Suite (400+ hàm, =DOCSO, Căn lề in ấn Fit-to-Page)      │
│   - Ký số USB Token CA phần cứng (PKCS#11) & Đóng dấu điện tử          │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │
┌───────────────────────────────────┴────────────────────────────────────┐
│ 🚀 CẤP ĐỘ 1: BASIC (The Bulletproof Native Desktop)                    │
│   - Khởi động < 0.5s, RAM < 80MB trên nền Tauri 2.0 (Rust Core)        │
│   - 100% Offline-First, Native File System I/O an toàn (Atomic Save)   │
│   - WASM Charset Mapper: Chuyển đổi tự động VNI/TCVN3 -> Unicode       │
│   - WASM SymSpell: Soát lỗi chính tả tiếng Việt nội bộ 70.000 từ       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 14 Luồng Logic Nghiệp vụ Cốt lõi (Core Logic Flows)

Hệ thống được thiết kế dựa trên 14 chu trình logic khép kín:

| Phân tầng | Mã luồng | Tên Luồng Logic | Mục tiêu & Cơ chế xử lý |
| :--- | :---: | :--- | :--- |
| **Tầng 1 (Basic)** | `F-1.1` | **Khởi động & Crash Recovery** | Cơ chế Write-Ahead Log (WAL) khôi phục 100% dữ liệu khi mất điện. |
| | `F-1.2` | **Đánh chặn Clipboard WASM** | Tự động chuyển đổi mã VNI/TCVN3 sang Unicode khi nhấn `Ctrl+V`. |
| | `F-1.3` | **Ghi đĩa nguyên tử (Atomic Save)** | Ghi file `.tmp` $\to$ `fsync` $\to$ đổi tên 1 micro-giây, chống hỏng file. |
| **Tầng 2 (Pro)** | `F-2.1` | **Phân trang ảo A4 thời gian thực** | Đo lường font metrics, kiểm soát Widow/Orphan, ngắt trang milimet. |
| | `F-2.2` | **Chuyển đổi 2 chiều OOXML** | Đọc/ghi `.docx`/`.xlsx` tương thích tuyệt đối với Microsoft Office. |
| | `F-2.3` | **Ký số Token USB PKCS#11** | Tích hợp USB Token CA, mã băm SHA-256 niêm phong tài liệu NĐ30. |
| | `F-2.4` | **Kế toán & Căn lề in ấn** | Hàm tùy biến `=DOCSO`, Fit-to-page ép bảng tính vừa 1 trang A4. |
| **Tầng 3 (Ultimate)** | `F-3.1` | **Đồng bộ CRDT Đa điểm** | Cụm WebSocket Yjs đồng bộ hàng trăm người dùng độ trễ $< 30\text{ms}$. |
| | `F-3.2` | **Ngoại tuyến & Đồng bộ bù** | Hàng đợi IndexedDB tự hòa giải xung đột theo Vector khi có mạng lại. |
| | `F-3.3` | **Lịch sử phiên bản Time-Machine**| Snapshot Debounce lên MinIO S3, tua lại lịch sử sửa đổi bất kỳ lúc nào. |
| | `F-3.4` | **DLP & Watermark động** | WebGL watermark chìm chống chụp trộm màn hình và chống rò rỉ. |
| **Tầng 4 (Agent)** | `F-4.1` | **Phân rã mục tiêu (StateGraph)**| Nhận lệnh tự nhiên $\to$ lập Đồ thị tác vụ liên hoàn giữa các Sub-Agents. |
| | `F-4.2` | **Thao tác Cây AST & Thẩm định NĐ30**| Agent tương tác trực tiếp JSON AST, tự kiểm toán thể thức hành chính. |
| | `F-4.3` | **Đồng bộ chéo đa tài liệu** | Sửa số liệu trong Sheets $\to$ Word và Slides tự động cập nhật số liệu. |
| | `F-4.4` | **Kiểm duyệt con người (HITL)** | Trình giao diện Diff so sánh thay đổi $\to$ Lãnh đạo ký số ban hành. |

---

## 📂 Cấu trúc Dự án (Repository Structure)

```
vietdesk-office/
├── docs/                                  # Tài liệu kiến trúc và đặc tả chi tiết
│   └── VIETDESK_SYSTEM_ARCHITECTURE.md   # Bản đặc tả kỹ thuật chi tiết
├── writer/                                # Module Soạn thảo văn bản (Chuẩn NĐ30)
├── sheets/                                # Module Bảng tính (Kế toán & =DOCSO)
├── slides/                                # Module Trình chiếu bài thuyết trình
├── ARCHITECTURE.md                        # Kiến trúc hệ thống tổng thể
├── LICENSE                                # Giấy phép phần mềm MIT
└── README.md                              # Giới thiệu tổng quan dự án
```

---

## 🛠️ Đóng góp & Phát triển

Mọi ý kiến đóng góp, báo cáo lỗi hoặc đề xuất tính năng xin vui lòng mở Issue hoặc Pull Request trên repository:
👉 [https://github.com/vietdesk-crt/vietdesk-office](https://github.com/vietdesk-crt/vietdesk-office)

---

## 📄 Giấy phép

Dự án được phát hành theo giấy phép [MIT License](LICENSE).
