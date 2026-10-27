# Quy Tắc Về Vòng Đời Server & Giải Phóng Port 1420

1. **Nguyên tắc dừng tuyệt đối**:
   - Khi người dùng bấm `Ctrl + C` trên terminal, mọi tiến trình Vite / Node liên quan đến server phải được ngắt hoàn toàn.
   - Không để lại bất kỳ tiến trình nào chạy ngầm ở port 1420.

2. **Cơ chế tự động dọn dẹp**:
   - Script `predev` tự động chạy `fuser -k 1420/tcp 2>/dev/null || true` trước khi khởi động dev server để đảm bảo không bị lỗi `Port 1420 is already in use`.
   - Script `npm run dev:stop` được cung cấp để giải phóng cưỡng chế port 1420 bất cứ lúc nào.

3. **Hành vi của Agent**:
   - Agent không chiếm port của người dùng trong background tasks.
   - Luôn kill các tiến trình tạm thời ngay sau khi hoàn tất kiểm tra.
