//! Đọc/ghi tệp tài liệu `.vdx`.
//!
//! Vì sao ở Rust chứ không phải C++? Đây là I/O hệ điều hành: đường dẫn, quyền
//! truy cập, ghi nguyên tử. Lõi C++ chỉ nhận chuỗi đã đọc và trả chuỗi đã mã
//! hoá — nó không cần biết tệp nằm ở đâu.
//!
//! Ghi nguyên tử: nội dung được ghi vào tệp tạm cùng thư mục, `sync_all()` rồi
//! `rename()` đè lên tệp đích. Mất điện giữa chừng sẽ để lại tệp tạm, không bao
//! giờ để lại tệp `.vdx` cụt.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Cùng giới hạn với `MAX_DOCUMENT_BYTES` phía TypeScript.
const MAX_BYTES: u64 = 32 * 1024 * 1024;

fn ensure_parent(path: &Path) -> Result<(), String> {
    match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => fs::create_dir_all(parent)
            .map_err(|error| format!("Không tạo được thư mục {}: {error}", parent.display())),
        _ => Ok(()),
    }
}

/// Đọc tài liệu dạng UTF-8, chặn tệp quá lớn trước khi nạp vào bộ nhớ.
#[tauri::command]
pub fn document_read(path: String) -> Result<String, String> {
    let target = PathBuf::from(&path);
    let metadata =
        fs::metadata(&target).map_err(|error| format!("Không mở được tệp: {error}"))?;

    if !metadata.is_file() {
        return Err("Đường dẫn không phải là tệp.".to_string());
    }
    if metadata.len() > MAX_BYTES {
        return Err(format!(
            "Tệp quá lớn ({} MB). Giới hạn hiện tại là 32 MB.",
            metadata.len() / (1024 * 1024)
        ));
    }

    fs::read_to_string(&target).map_err(|error| {
        if error.kind() == std::io::ErrorKind::InvalidData {
            "Tệp không phải văn bản UTF-8.".to_string()
        } else {
            format!("Không đọc được tệp: {error}")
        }
    })
}

/// Ghi tài liệu nguyên tử (tệp tạm → `rename`).
#[tauri::command]
pub fn document_write(path: String, contents: String) -> Result<(), String> {
    if contents.len() as u64 > MAX_BYTES {
        return Err("Nội dung vượt quá 32 MB.".to_string());
    }

    let target = PathBuf::from(&path);
    ensure_parent(&target)?;

    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document.vdx");
    let temp = target.with_file_name(format!(".{file_name}.{}.tmp", std::process::id()));

    {
        let mut file = fs::File::create(&temp)
            .map_err(|error| format!("Không tạo được tệp tạm: {error}"))?;
        file.write_all(contents.as_bytes())
            .map_err(|error| format!("Không ghi được nội dung: {error}"))?;
        // Đảm bảo dữ liệu xuống đĩa trước khi đổi tên.
        file.sync_all()
            .map_err(|error| format!("Không đồng bộ được tệp: {error}"))?;
    }

    if let Err(error) = fs::rename(&temp, &target) {
        // Windows không cho `rename` đè tệp đã tồn tại.
        if target.exists() {
            fs::remove_file(&target)
                .map_err(|error| format!("Không thay được tệp cũ: {error}"))?;
            fs::rename(&temp, &target)
                .map_err(|error| format!("Không cập nhật được tệp: {error}"))?;
        } else {
            let _ = fs::remove_file(&temp);
            return Err(format!("Không ghi được tệp: {error}"));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!(
            "vietdesk-doc-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("tạo thư mục tạm");
        dir
    }

    #[test]
    fn ghi_va_doc_lai_utf8() {
        let dir = temp_dir();
        let path = dir.join("tài liệu.vdx");
        let payload = "{\"tiếng\":\"Việt\"}\n";

        document_write(path.to_string_lossy().into_owned(), payload.to_string()).expect("ghi");
        let read = document_read(path.to_string_lossy().into_owned()).expect("đọc");

        assert_eq!(read, payload);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn ghi_de_len_va_khong_de_lai_tep_tam() {
        let dir = temp_dir();
        let path = dir.join("bao-cao.vdx");

        document_write(path.to_string_lossy().into_owned(), "một".to_string()).expect("lần 1");
        document_write(path.to_string_lossy().into_owned(), "hai".to_string()).expect("lần 2");

        let read = document_read(path.to_string_lossy().into_owned()).expect("đọc");
        assert_eq!(read, "hai");

        let leftovers: Vec<_> = fs::read_dir(&dir)
            .expect("đọc thư mục")
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "còn tệp tạm: {leftovers:?}");

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn bao_loi_khi_tep_khong_ton_tai() {
        let dir = temp_dir();
        let missing = dir.join("khong-co.vdx");
        let error = document_read(missing.to_string_lossy().into_owned()).unwrap_err();
        assert!(error.contains("Không mở được tệp"));
        let _ = fs::remove_dir_all(dir);
    }
}
