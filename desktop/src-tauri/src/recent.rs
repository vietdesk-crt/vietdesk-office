//! Danh sách tệp gần đây, lưu trong thư mục cấu hình ứng dụng.
//!
//! Vì sao làm ở Rust chứ không phải C++? Đây là mối quan tâm của *vỏ ứng dụng*
//! (đường dẫn hệ điều hành, thư mục cấu hình, kiểm tra tệp tồn tại) — không
//! phải nghiệp vụ văn phòng. Lõi C++ không cần biết người dùng mở tệp nào.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const MAX_ENTRIES: usize = 20;
const STORE_FILE: &str = "recent-files.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DocumentKind {
    Writer,
    Sheets,
    Slides,
    Unknown,
}

impl DocumentKind {
    /// Khoá ổn định dùng trong `id`, khớp với phía TypeScript.
    fn key(self) -> &'static str {
        match self {
            DocumentKind::Writer => "writer",
            DocumentKind::Sheets => "sheets",
            DocumentKind::Slides => "slides",
            DocumentKind::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    /// Đường dẫn tuyệt đối, hoặc `unsaved:<kind>:<tên>`.
    pub id: String,
    /// `None` khi tài liệu chưa lưu vào đĩa.
    pub path: Option<String>,
    pub name: String,
    pub kind: DocumentKind,
    pub pinned: bool,
    /// Unix epoch milliseconds.
    pub opened_at: u64,
    pub size: Option<u64>,
    pub exists: bool,
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("không xác định được thư mục cấu hình: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("không tạo được thư mục cấu hình: {error}"))?;
    Ok(dir.join(STORE_FILE))
}

fn load(app: &AppHandle) -> Vec<RecentEntry> {
    let Ok(path) = store_path(app) else {
        return Vec::new();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return Vec::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn save(app: &AppHandle, entries: &[RecentEntry]) -> Result<(), String> {
    let path = store_path(app)?;
    let payload = serde_json::to_string_pretty(entries)
        .map_err(|error| format!("không mã hoá được danh sách: {error}"))?;

    // Ghi qua tệp tạm rồi đổi tên: tránh để lại JSON hỏng nếu mất điện.
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, payload)
        .map_err(|error| format!("không ghi được danh sách: {error}"))?;
    fs::rename(&temp, &path).map_err(|error| format!("không cập nhật được danh sách: {error}"))
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn refresh_metadata(entry: &mut RecentEntry) {
    match entry.path.as_deref() {
        Some(path) => match fs::metadata(path) {
            Ok(metadata) => {
                entry.exists = true;
                entry.size = Some(metadata.len());
            }
            Err(_) => {
                entry.exists = false;
                entry.size = None;
            }
        },
        None => {
            entry.exists = false;
            entry.size = None;
        }
    }
}

fn sort_entries(entries: &mut [RecentEntry]) {
    entries.sort_by(|a, b| {
        b.pinned
            .cmp(&a.pinned)
            .then_with(|| b.opened_at.cmp(&a.opened_at))
    });
}

/// Danh sách hiện tại, đã cập nhật trạng thái tồn tại của từng tệp.
#[tauri::command]
pub fn recent_list(app: AppHandle) -> Result<Vec<RecentEntry>, String> {
    let mut entries = load(&app);
    for entry in &mut entries {
        refresh_metadata(entry);
    }
    sort_entries(&mut entries);
    Ok(entries)
}

/// Ghi nhận tệp vừa mở/tạo. Trùng `id` thì cập nhật, giữ nguyên trạng thái ghim.
#[tauri::command]
pub fn recent_remember(
    app: AppHandle,
    path: Option<String>,
    name: String,
    kind: DocumentKind,
    limit: Option<u32>,
) -> Result<Vec<RecentEntry>, String> {
    let id = path
        .clone()
        .unwrap_or_else(|| format!("unsaved:{}:{}", kind.key(), name));

    let mut entries = load(&app);
    let pinned = entries
        .iter()
        .find(|entry| entry.id == id)
        .map(|entry| entry.pinned)
        .unwrap_or(false);
    entries.retain(|entry| entry.id != id);

    let mut entry = RecentEntry {
        id,
        path,
        name,
        kind,
        pinned,
        opened_at: now_millis(),
        size: None,
        exists: false,
    };
    refresh_metadata(&mut entry);
    entries.push(entry);

    sort_entries(&mut entries);
    let limit = limit
        .map(|value| value.clamp(1, 200) as usize)
        .unwrap_or(MAX_ENTRIES);
    entries.truncate(limit);
    save(&app, &entries)?;
    Ok(entries)
}

/// Đường dẫn tệp JSON lưu lịch sử — hiển thị trong Cài đặt.
#[tauri::command]
pub fn recent_store_path(app: AppHandle) -> Result<String, String> {
    Ok(store_path(&app)?.to_string_lossy().into_owned())
}

/// Ghim/bỏ ghim một tệp để nó luôn đứng đầu danh sách.
#[tauri::command]
pub fn recent_set_pinned(
    app: AppHandle,
    id: String,
    pinned: bool,
) -> Result<Vec<RecentEntry>, String> {
    let mut entries = load(&app);
    for entry in &mut entries {
        if entry.id == id {
            entry.pinned = pinned;
        }
    }
    sort_entries(&mut entries);
    save(&app, &entries)?;
    Ok(entries)
}

/// Xoá một tệp khỏi danh sách (không đụng tới tệp trên đĩa).
#[tauri::command]
pub fn recent_forget(app: AppHandle, id: String) -> Result<Vec<RecentEntry>, String> {
    let mut entries = load(&app);
    entries.retain(|entry| entry.id != id);
    save(&app, &entries)?;
    Ok(entries)
}

/// Xoá toàn bộ lịch sử.
#[tauri::command]
pub fn recent_clear(app: AppHandle) -> Result<Vec<RecentEntry>, String> {
    save(&app, &[])?;
    Ok(Vec::new())
}
