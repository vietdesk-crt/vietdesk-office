# Quy Định Quản Lý Tiến Trình & Server (Process & Server Lifecycle Rules)

## 1. Dọn Dẹp Tiến Trình Khi Nhấn Ctrl+C / Hủy Lệnh
- Khi người dùng gửi lệnh hủy, dừng tiến trình (`Ctrl + C`, `SIGINT`, `SIGTERM`), toàn bộ các tiến trình máy chủ (bao gồm Vite dev server, sub-processes) PHẢI lập tức dừng hoàn toàn.
- Tuyệt đối không để sót tiến trình chạy ngầm mồ côi (orphan / daemon background process) chiếm dụng cổng mạng.
- Cổng `1420` (port mặc định của Vietdesk Office) phải được giải phóng ngay lập tức khi dừng server.

## 2. Quy Tắc Đối Với AI Agent
- Agent KHÔNG ĐƯỢC chạy dev server ở chế độ daemon nền lâu dài (`IsDaemon: true`) gây chiếm port của người dùng trên terminal chính.
- Khi Agent cần khởi chạy server để kiểm tra hoặc chạy subagent, Agent PHẢI dừng tiến trình (`kill` task) và giải phóng cổng `1420` ngay sau khi kiểm tra xong.
- Trước khi chạy bất kỳ lệnh dev server nào, hệ thống phải kích hoạt kiểm tra và dọn sạch cổng bằng script `predev` (`fuser -k 1420/tcp 2>/dev/null || true`).

## 3. Khắc Phục Nhanh Khi Kẹt Cổng
- Nếu xuất hiện lỗi `Port 1420 is already in use`, chạy ngay lệnh:
  ```bash
  npm run dev:stop
  ```
  hoặc
  ```bash
  fuser -k 1420/tcp
  ```
