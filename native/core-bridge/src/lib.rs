//! Wrapper an toàn (safe) quanh C ABI của lõi C++ VietDesk.
//!
//! Toàn bộ `unsafe` của dự án tập trung ở file này. Phía trên (Tauri command,
//! UI) chỉ nhìn thấy API Rust với `Result` và `&str`.
//!
//! Quy ước: mỗi lời gọi C đều kiểm tra mã lỗi, và mọi `vd_buf` đều được giải
//! phóng kể cả khi lỗi — không rò rỉ bộ nhớ.

use std::collections::HashMap;
use std::ffi::{c_char, CStr};
use std::fmt;
use std::os::raw::c_int;
use std::ptr;

/// Bộ đệm do lõi C++ cấp phát. Phải giải phóng bằng `vd_buf_free`.
#[repr(C)]
struct VdBuf {
    ptr: *mut u8,
    len: usize,
    cap: usize,
}

/// Một ô đầu vào cho engine công thức.
#[repr(C)]
struct VdCellInput {
    id: *const u8,
    id_len: usize,
    raw: *const u8,
    raw_len: usize,
}

/// Kết quả một ô do lõi C++ cấp phát.
#[repr(C)]
struct VdCellResult {
    id: *mut u8,
    id_len: usize,
    display: *mut u8,
    display_len: usize,
    has_numeric: i32,
    numeric: f64,
    error: *mut u8,
    error_len: usize,
}

#[repr(C)]
struct VdSheetResult {
    cells: *mut VdCellResult,
    len: usize,
    cap: usize,
}

/// Kết quả tính của một ô, đã chuyển sang kiểu Rust an toàn.
#[derive(Debug, Clone, PartialEq)]
pub struct SheetCellResult {
    /// Chuỗi hiển thị (đã định dạng vi-VN nếu là số).
    pub display: String,
    /// Giá trị số, `None` nếu ô trống/chữ/lỗi.
    pub numeric: Option<f64>,
    /// Thông điệp lỗi tiếng Việt nếu công thức không hợp lệ.
    pub error: Option<String>,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Charset {
    Unicode = 0,
    Tcvn3 = 1,
    Vni = 2,
    Viqr = 3,
}

extern "C" {
    fn vd_core_version() -> *const c_char;

    fn vd_vietnamese_compose(input: *const u8, len: usize, out: *mut VdBuf) -> c_int;
    fn vd_vietnamese_strip_tones(input: *const u8, len: usize, out: *mut VdBuf) -> c_int;
    fn vd_vietnamese_remove_diacritics(input: *const u8, len: usize, out: *mut VdBuf) -> c_int;
    fn vd_vietnamese_detect_charset(input: *const u8, len: usize, out: *mut Charset) -> c_int;
    fn vd_charset_convert(
        src: Charset,
        dst: Charset,
        input: *const u8,
        len: usize,
        out: *mut VdBuf,
    ) -> c_int;

    fn vd_formula_compute(
        cells: *const VdCellInput,
        len: usize,
        out: *mut VdSheetResult,
    ) -> c_int;
    fn vd_sheet_result_free(result: *mut VdSheetResult);

    fn vd_buf_free(buf: *mut VdBuf);
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreError {
    InvalidArgument,
    InvalidUtf8,
    Unsupported,
    OutOfMemory,
    Internal,
    Unknown(i32),
}

impl fmt::Display for CoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CoreError::InvalidArgument => write!(f, "tham số không hợp lệ"),
            CoreError::InvalidUtf8 => write!(f, "chuỗi không phải UTF-8 hợp lệ"),
            CoreError::Unsupported => write!(f, "thao tác chưa được hỗ trợ"),
            CoreError::OutOfMemory => write!(f, "hết bộ nhớ"),
            CoreError::Internal => write!(f, "lỗi nội bộ lõi C++"),
            CoreError::Unknown(code) => write!(f, "mã lỗi không xác định: {code}"),
        }
    }
}

impl std::error::Error for CoreError {}

fn from_code(code: i32) -> CoreError {
    match code {
        1 => CoreError::InvalidArgument,
        2 => CoreError::InvalidUtf8,
        3 => CoreError::Unsupported,
        4 => CoreError::OutOfMemory,
        5 => CoreError::Internal,
        other => CoreError::Unknown(other),
    }
}

/// Giải phóng bộ đệm và chuyển nội dung sang `String`.
///
/// # Safety
/// `buf` phải do lõi C++ cấp phát và chưa từng được giải phóng.
unsafe fn take_string(buf: VdBuf) -> String {
    let mut owned = buf;
    let value = if owned.ptr.is_null() || owned.len == 0 {
        String::new()
    } else {
        let bytes = std::slice::from_raw_parts(owned.ptr, owned.len);
        String::from_utf8_lossy(bytes).into_owned()
    };
    vd_buf_free(&mut owned as *mut VdBuf);
    value
}

fn call_string(
    f: unsafe extern "C" fn(*const u8, usize, *mut VdBuf) -> c_int,
    input: &str,
) -> Result<String, CoreError> {
    let mut buf = VdBuf {
        ptr: std::ptr::null_mut(),
        len: 0,
        cap: 0,
    };
    let code = unsafe { f(input.as_ptr(), input.len(), &mut buf as *mut VdBuf) };
    // Giải phóng trước khi trả lỗi để không rò rỉ khi lõi cấp phát một phần.
    let value = unsafe { take_string(buf) };
    if code != 0 {
        return Err(from_code(code));
    }
    Ok(value)
}

/// Phiên bản lõi C++, ví dụ `"0.2.0"`.
pub fn version() -> String {
    unsafe {
        let ptr = vd_core_version();
        if ptr.is_null() {
            return String::new();
        }
        CStr::from_ptr(ptr).to_string_lossy().into_owned()
    }
}

/// Ghép dấu tách rời thành ký tự dựng sẵn (NFC) theo quy tắc tiếng Việt.
pub fn compose_nfc(input: &str) -> Result<String, CoreError> {
    call_string(vd_vietnamese_compose, input)
}

/// Bỏ thanh điệu, giữ dấu cấu tạo chữ: `"Tiếng"` → `"Tiêng"`.
pub fn strip_tones(input: &str) -> Result<String, CoreError> {
    call_string(vd_vietnamese_strip_tones, input)
}

/// Bỏ toàn bộ dấu: `"Tiếng Việt"` → `"Tieng Viet"`.
pub fn remove_diacritics(input: &str) -> Result<String, CoreError> {
    call_string(vd_vietnamese_remove_diacritics, input)
}

/// Đoán bảng mã của chuỗi byte.
pub fn detect_charset(input: &[u8]) -> Result<Charset, CoreError> {
    let mut charset = Charset::Unicode;
    let code = unsafe { vd_vietnamese_detect_charset(input.as_ptr(), input.len(), &mut charset) };
    if code != 0 {
        return Err(from_code(code));
    }
    Ok(charset)
}

/// Chuyển đổi bảng mã. TCVN3/VNI hiện trả `Unsupported`.
pub fn convert_charset(src: Charset, dst: Charset, input: &str) -> Result<String, CoreError> {
    let mut buf = VdBuf {
        ptr: std::ptr::null_mut(),
        len: 0,
        cap: 0,
    };
    let code = unsafe {
        vd_charset_convert(
            src,
            dst,
            input.as_ptr(),
            input.len(),
            &mut buf as *mut VdBuf,
        )
    };
    let value = unsafe { take_string(buf) };
    if code != 0 {
        return Err(from_code(code));
    }
    Ok(value)
}

/// Chuyển kết quả do lõi cấp phát sang kiểu Rust rồi giải phóng cả bảng.
///
/// # Safety
/// `result` phải do `vd_formula_compute` cấp phát và chưa từng được giải phóng.
unsafe fn take_sheet(mut result: VdSheetResult) -> Vec<(String, SheetCellResult)> {
    let mut cells = Vec::new();
    if !result.cells.is_null() {
        for index in 0..result.len {
            let cell = &*result.cells.add(index);
            let id = bytes_to_string(cell.id, cell.id_len);
            let display = bytes_to_string(cell.display, cell.display_len);
            let error = if cell.error.is_null() || cell.error_len == 0 {
                None
            } else {
                Some(bytes_to_string(cell.error, cell.error_len))
            };
            let numeric = if cell.has_numeric != 0 {
                Some(cell.numeric)
            } else {
                None
            };
            cells.push((
                id,
                SheetCellResult {
                    display,
                    numeric,
                    error,
                },
            ));
        }
    }
    vd_sheet_result_free(&mut result as *mut VdSheetResult);
    cells
}

/// # Safety
/// `data` phải trỏ tới ít nhất `len` byte hợp lệ, hoặc `len == 0`.
unsafe fn bytes_to_string(data: *const u8, len: usize) -> String {
    if data.is_null() || len == 0 {
        return String::new();
    }
    let bytes = std::slice::from_raw_parts(data, len);
    String::from_utf8_lossy(bytes).into_owned()
}

/// Tính toàn bộ bảng tính bằng engine C++.
///
/// `cells` là bản đồ mã ô → chuỗi thô (`"=SUM(A1:A3)"`, `"1.234,5"`, chữ…).
/// Kết quả giữ đủ mọi ô đầu vào; lỗi công thức nằm trong `error` của ô đó.
pub fn compute_sheet(
    cells: &HashMap<String, String>,
) -> Result<HashMap<String, SheetCellResult>, CoreError> {
    let entries: Vec<(&str, &str)> = cells
        .iter()
        .map(|(id, raw)| (id.as_str(), raw.as_str()))
        .collect();
    let inputs: Vec<VdCellInput> = entries
        .iter()
        .map(|(id, raw)| VdCellInput {
            id: id.as_ptr(),
            id_len: id.len(),
            raw: raw.as_ptr(),
            raw_len: raw.len(),
        })
        .collect();

    let mut result = VdSheetResult {
        cells: ptr::null_mut(),
        len: 0,
        cap: 0,
    };
    let pointer = if inputs.is_empty() {
        ptr::null()
    } else {
        inputs.as_ptr()
    };
    let code = unsafe { vd_formula_compute(pointer, inputs.len(), &mut result) };
    // Luôn giải phóng, kể cả khi lõi trả lỗi (khi đó bảng rỗng).
    let computed = unsafe { take_sheet(result) };
    if code != 0 {
        return Err(from_code(code));
    }
    Ok(computed.into_iter().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_duoc_truyen_tu_cpp() {
        assert_eq!(version(), "0.2.0");
    }

    #[test]
    fn compose_ghep_dau_dung() {
        // "Nguye" + U+0302 + U+0303 + "n" -> "Nguyễn"
        let out = compose_nfc("Nguye\u{0302}\u{0303}n").expect("compose");
        assert_eq!(out, "Nguyễn");
    }

    #[test]
    fn strip_tones_giu_dau_cau_tao() {
        assert_eq!(strip_tones("Tiếng Việt").unwrap(), "Tiêng Viêt");
    }

    #[test]
    fn remove_diacritics_dung_cho_tim_kiem() {
        assert_eq!(remove_diacritics("Đường phố").unwrap(), "Duong pho");
    }

    #[test]
    fn nhan_dien_bang_ma() {
        assert_eq!(detect_charset(b"Xin chao").unwrap(), Charset::Unicode);
        assert_eq!(detect_charset(&[0xFF, 0xFE]).unwrap(), Charset::Tcvn3);
    }

    #[test]
    fn charset_chua_ho_tro_tra_unsupported() {
        assert_eq!(
            convert_charset(Charset::Unicode, Charset::Tcvn3, "Việt").unwrap_err(),
            CoreError::Unsupported
        );
    }

    fn sheet(entries: &[(&str, &str)]) -> HashMap<String, SheetCellResult> {
        let cells: HashMap<String, String> = entries
            .iter()
            .map(|(id, raw)| ((*id).to_string(), (*raw).to_string()))
            .collect();
        compute_sheet(&cells).expect("compute_sheet")
    }

    #[test]
    fn formula_tinh_so_hoc_va_hien_thi_vi_vn() {
        let result = sheet(&[("A1", "=1+2*3"), ("A2", "=1234.5")]);
        assert_eq!(result["A1"].numeric, Some(7.0));
        assert_eq!(result["A1"].display, "7");
        assert_eq!(result["A2"].display, "1.234,5");
        assert_eq!(result["A2"].numeric, Some(1234.5));
    }

    #[test]
    fn formula_tham_chieu_va_vung() {
        let result = sheet(&[
            ("A1", "10"),
            ("A2", "2"),
            ("A3", "3"),
            ("B1", "=A1+A2"),
            ("B2", "=SUM(A1:A3)"),
            ("B3", "=AVERAGE(A2:A3)"),
            ("B4", "=MIN(A2:A3)"),
            ("B5", "=MAX(A2:A3)"),
        ]);
        assert_eq!(result["B1"].numeric, Some(12.0));
        assert_eq!(result["B2"].numeric, Some(15.0));
        assert_eq!(result["B3"].numeric, Some(2.5));
        assert_eq!(result["B4"].numeric, Some(2.0));
        assert_eq!(result["B5"].numeric, Some(3.0));
    }

    #[test]
    fn formula_loi_duoc_tra_ve_theo_tung_o() {
        let result = sheet(&[("A1", "=1/0"), ("A2", "=A1+1"), ("A3", "=A1")]);
        assert_eq!(result["A1"].display, "#LỖI");
        assert_eq!(result["A1"].numeric, None);
        assert_eq!(result["A1"].error.as_deref(), Some("Chia cho 0"));
        assert_eq!(result["A2"].error.as_deref(), Some("Chia cho 0"));
        assert_eq!(result["A3"].error.as_deref(), Some("Chia cho 0"));
    }

    #[test]
    fn formula_phat_hien_tham_chieu_vong() {
        let result = sheet(&[("A1", "=B1"), ("B1", "=A1")]);
        assert_eq!(result["A1"].error.as_deref(), Some("Tham chiếu vòng"));
        assert_eq!(result["B1"].error.as_deref(), Some("Tham chiếu vòng"));
    }

    #[test]
    fn formula_giu_van_ban_va_bo_qua_o_trong() {
        let result = sheet(&[
            ("A1", "Tiếng Việt"),
            ("A2", "1.234,56"),
            ("A3", "   "),
            ("B1", "=SUM(A2:A3)"),
        ]);
        assert_eq!(result["A1"].display, "Tiếng Việt");
        assert_eq!(result["A1"].numeric, None);
        assert_eq!(result["A2"].numeric, Some(1234.56));
        assert_eq!(result["A3"].display, "");
        assert_eq!(result["B1"].numeric, Some(1234.56));
    }

    #[test]
    fn formula_bang_rong_khong_loi() {
        let result = compute_sheet(&HashMap::new()).expect("rong");
        assert!(result.is_empty());
    }
}
