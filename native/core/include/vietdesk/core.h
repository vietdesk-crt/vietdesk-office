/*
 * VietDesk Core - C ABI công khai.
 *
 * QUY TẮC ABI (bắt buộc, không được phá vỡ):
 *  - Mọi hàm là `extern "C"`, không có symbol mang theo tên C++.
 *  - Không đưa std::string / std::vector / exception qua biên giới.
 *  - Chuỗi vào là UTF-8 (const char*, len). Chuỗi ra cấp phát bằng vd_buf
 *    và PHẢI được giải phóng bằng vd_buf_free().
 *  - Mã lỗi luôn là số nguyên âm/khác 0; 0 là thành công.
 *
 * Module hiện có:
 *  - vietnamese: chuẩn hóa NFC, bỏ thanh điệu, bỏ dấu (tìm kiếm không dấu)
 *  - charset:    phát hiện bảng mã, chuyển đổi (khung mở rộng cho TCVN3/VNI)
 *  - formula:    tính bảng tính, tham chiếu ô/vùng, SUM/MIN/MAX/AVERAGE
 */
#ifndef VIETDESK_CORE_H
#define VIETDESK_CORE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define VD_OK 0
#define VD_ERR_INVALID_ARG 1
#define VD_ERR_INVALID_UTF8 2
#define VD_ERR_UNSUPPORTED 3
#define VD_ERR_OUT_OF_MEMORY 4
#define VD_ERR_INTERNAL 5

typedef struct vd_buf {
  uint8_t *ptr; /* NULL khi len == 0 */
  size_t len;   /* số byte thực tế */
  size_t cap;   /* dung lượng cấp phát (nội bộ) */
} vd_buf;

typedef enum vd_charset {
  VD_CHARSET_UNICODE = 0,
  VD_CHARSET_TCVN3 = 1,
  VD_CHARSET_VNI = 2,
  VD_CHARSET_VIQR = 3
} vd_charset;

/* Phiên bản lõi, ví dụ "0.2.0". Con trỏ tĩnh, KHÔNG được free. */
const char *vd_core_version(void);

/* --- Tiếng Việt ---------------------------------------------------------- */

/* Ghép chuỗi đã tách dấu (NFD) thành dạng dựng sẵn (NFC).
 * Ví dụ: "e" + U+0302 + U+0301  ->  "ế" (U+1EBF). */
int32_t vd_vietnamese_compose(const uint8_t *in, size_t in_len, vd_buf *out);

/* Bỏ thanh điệu, giữ dấu cấu tạo chữ.
 * Ví dụ: "Tiếng Việt" -> "Tiêng Viêt". Dùng cho so khớp mờ. */
int32_t vd_vietnamese_strip_tones(const uint8_t *in, size_t in_len, vd_buf *out);

/* Bỏ toàn bộ dấu, kể cả ă â ê ô ơ ư đ.
 * Ví dụ: "Tiếng Việt" -> "Tieng Viet". Dùng cho tìm kiếm không dấu. */
int32_t vd_vietnamese_remove_diacritics(const uint8_t *in, size_t in_len,
                                        vd_buf *out);

/* --- Bảng mã ------------------------------------------------------------- */

/* Đoán bảng mã của một đoạn byte. Hiện hỗ trợ phân biệt Unicode / TCVN3. */
int32_t vd_vietnamese_detect_charset(const uint8_t *in, size_t in_len,
                                     vd_charset *out);

/* Chuyển đổi bảng mã. Hiện chỉ Unicode -> Unicode.
 * TCVN3/VNI trả VD_ERR_UNSUPPORTED cho tới khi bảng mã được đăng ký. */
int32_t vd_charset_convert(vd_charset src, vd_charset dst, const uint8_t *in,
                           size_t in_len, vd_buf *out);

/* --- Bảng tính ----------------------------------------------------------- */

/* Một ô đầu vào. `id` là mã ô kiểu Excel ("A1"), `raw` là giá trị thô
 * (UTF-8) — có thể là "=SUM(A1:A5)" hoặc văn bản/số. */
typedef struct vd_cell_input {
  const uint8_t *id;
  size_t id_len;
  const uint8_t *raw;
  size_t raw_len;
} vd_cell_input;

/* Kết quả một ô. Chuỗi do lõi cấp phát và chỉ được giải phóng bằng
 * vd_sheet_result_free() — không dùng vd_buf_free() cho từng trường. */
typedef struct vd_cell_result {
  uint8_t *id;
  size_t id_len;
  uint8_t *display;
  size_t display_len;
  int32_t has_numeric; /* 0 = không có, 1 = dùng được `numeric` */
  double numeric;
  uint8_t *error; /* NULL/0 khi ô không lỗi */
  size_t error_len;
} vd_cell_result;

typedef struct vd_sheet_result {
  vd_cell_result *cells;
  size_t len;
  size_t cap; /* nội bộ */
} vd_sheet_result;

/* Tính toàn bộ bảng. Kết quả giữ đúng thứ tự đầu vào.
 * Lỗi cấp ô nằm trong `error` của ô đó (display = "#LỖI"); mã trả về chỉ
 * báo lỗi ở mức lời gọi (tham số, UTF-8, bộ nhớ). */
int32_t vd_formula_compute(const vd_cell_input *cells, size_t len,
                           vd_sheet_result *out);

/* Giải phóng toàn bộ kết quả. Idempotent. */
void vd_sheet_result_free(vd_sheet_result *result);

/* Giải phóng bộ đệm do lõi cấp phát. Idempotent. */
void vd_buf_free(vd_buf *buf);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* VIETDESK_CORE_H */
