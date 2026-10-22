//! Lớp command của Tauri — mỏng nhất có thể.
//!
//! Mỗi command ở đây chỉ: nhận dữ liệu từ WebView → gọi `vietdesk-core-bridge`
//! hoặc module vỏ (`recent`) → đổi lỗi sang `String` cho UI. Không viết thuật
//! toán nghiệp vụ ở tầng này.

use std::collections::HashMap;

use vietdesk_core_bridge as core;

mod asset;
mod document;
mod recent;

/// Phiên bản lõi C++ (ví dụ "0.2.0").
#[tauri::command]
fn core_version() -> String {
    core::version()
}

/// Ghép dấu tách rời thành ký tự dựng sẵn (NFC).
#[tauri::command]
fn vietnamese_compose(text: String) -> Result<String, String> {
    core::compose_nfc(&text).map_err(|error| error.to_string())
}

/// Bỏ thanh điệu, giữ dấu cấu tạo chữ.
#[tauri::command]
fn vietnamese_strip_tones(text: String) -> Result<String, String> {
    core::strip_tones(&text).map_err(|error| error.to_string())
}

/// Bỏ toàn bộ dấu (tìm kiếm không dấu).
#[tauri::command]
fn vietnamese_remove_diacritics(text: String) -> Result<String, String> {
    core::remove_diacritics(&text).map_err(|error| error.to_string())
}

/// Kết quả một ô gửi sang WebView.
#[derive(serde::Serialize)]
struct SheetCellResultDto {
    display: String,
    numeric: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Tính bảng tính bằng engine C++.
#[tauri::command]
fn sheet_compute(
    cells: HashMap<String, String>,
) -> Result<HashMap<String, SheetCellResultDto>, String> {
    let computed = core::compute_sheet(&cells).map_err(|error| error.to_string())?;
    Ok(computed
        .into_iter()
        .map(|(id, cell)| {
            (
                id,
                SheetCellResultDto {
                    display: cell.display,
                    numeric: cell.numeric,
                    error: cell.error,
                },
            )
        })
        .collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            core_version,
            vietnamese_compose,
            vietnamese_strip_tones,
            vietnamese_remove_diacritics,
            sheet_compute,
            recent::recent_list,
            recent::recent_remember,
            recent::recent_set_pinned,
            recent::recent_forget,
            recent::recent_clear,
            recent::recent_store_path,
            document::document_read,
            document::document_read_binary,
            document::document_write,
            document::document_write_binary,
            asset::asset_read_base64,
            asset::asset_write,
        ])
        .run(tauri::generate_context!())
        .expect("không khởi động được VietDesk");
}
