//! Lưu ảnh chèn vào tài liệu vào thư mục `assets` cạnh tệp `.vdx`.
//!
//! Vì sao không nhúng ảnh thẳng vào JSON? Tệp `.vdx` là JSON thuần nên nhúng
//! ảnh sẽ làm tệp phình to gấp nhiều lần và mỗi lần lưu lại phải mã hoá lại
//! toàn bộ. Tách ảnh ra thành tệp riêng giúp tài liệu nhẹ, và khi chuyển tài
//! liệu sang máy khác chỉ cần chép cả thư mục `assets`.
//!
//! Đường dẫn lưu trong tài liệu là tương đối (`assets/ten-anh.png`) nên tài
//! liệu vẫn chạy đúng sau khi thư mục được chuyển sang vị trí khác.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;

/// Giới hạn kích thước ảnh (16 MB) — cùng giới hạn với phía TypeScript.
const MAX_BYTES: u64 = 16 * 1024 * 1024;

/// Các phần mở rộng ảnh được phép lưu vào tài liệu.
const IMAGE_EXTENSIONS: [&str; 7] = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];

/// Thư mục chứa ảnh, nằm cạnh tệp tài liệu.
const ASSET_DIR: &str = "assets";

/// Đọc một tệp ảnh rồi mã hoá base64 để gửi sang WebView.
#[tauri::command]
pub fn asset_read_base64(path: String) -> Result<String, String> {
    let target = PathBuf::from(&path);
    let metadata =
        fs::metadata(&target).map_err(|error| format!("Không mở được ảnh: {error}"))?;

    if !metadata.is_file() {
        return Err("Đường dẫn không phải là tệp.".to_string());
    }
    if metadata.len() > MAX_BYTES {
        return Err(format!(
            "Ảnh quá lớn ({} MB). Giới hạn hiện tại là 16 MB.",
            metadata.len() / (1024 * 1024)
        ));
    }

    let bytes =
        fs::read(&target).map_err(|error| format!("Không đọc được ảnh: {error}"))?;
    Ok(BASE64.encode(bytes))
}

/// Lưu ảnh vào `<thư mục tài liệu>/assets/` rồi trả về đường dẫn tương đối.
///
/// Tên tệp được làm sạch để không vỡ đường dẫn trên Windows, và nếu đã có
/// tệp trùng tên thì thêm hậu tố `-1`, `-2`… để không ghi đè ảnh cũ.
#[tauri::command]
pub fn asset_write(
    document_path: String,
    file_name: String,
    contents_base64: String,
) -> Result<String, String> {
    let document = PathBuf::from(&document_path);
    let folder = document
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| {
            "Chưa lưu tài liệu nên chưa biết đặt ảnh vào thư mục nào.".to_string()
        })?;

    let assets = folder.join(ASSET_DIR);
    fs::create_dir_all(&assets)
        .map_err(|error| format!("Không tạo được thư mục {}: {error}", assets.display()))?;

    let bytes = BASE64
        .decode(contents_base64.as_bytes())
        .map_err(|_| "Dữ liệu ảnh không hợp lệ (base64).".to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Ảnh vượt quá 16 MB.".to_string());
    }

    let name = unique_name(&assets, &safe_file_name(&file_name))?;
    let target = assets.join(&name);

    write_atomically(&target, &bytes)?;

    Ok(format!("{ASSET_DIR}/{name}"))
}

/// Làm sạch tên tệp: chỉ giữ chữ, số, `-`, `_` và `.`.
fn safe_file_name(file_name: &str) -> String {
    let base = file_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(file_name)
        .trim();

    let mut cleaned = String::with_capacity(base.len());
    for character in base.chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
            cleaned.push(character);
        } else {
            cleaned.push('_');
        }
    }

    // Tên tệp không được bắt đầu bằng dấu chấm (tệp ẩn).
    let cleaned = cleaned.trim_start_matches('.').to_string();
    if cleaned.is_empty() {
        return "anh".to_string();
    }

    let extension = Path::new(&cleaned)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return format!("{cleaned}.png");
    }
    cleaned
}

/// Tìm tên tệp chưa tồn tại trong thư mục `assets`.
fn unique_name(assets: &Path, name: &str) -> Result<String, String> {
    if !assets.join(name).exists() {
        return Ok(name.to_string());
    }

    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("anh")
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();

    for index in 1..1000 {
        let candidate = format!("{stem}-{index}{extension}");
        if !assets.join(&candidate).exists() {
            return Ok(candidate);
        }
    }

    Err("Không tìm được tên tệp ảnh còn trống.".to_string())
}

/// Ghi tệp nguyên tử: tệp tạm cùng thư mục rồi `rename` sang tệp đích.
fn write_atomically(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("anh.png");
    let temp = target.with_file_name(format!(".{file_name}.{}.tmp", std::process::id()));

    {
        let mut file = fs::File::create(&temp)
            .map_err(|error| format!("Không tạo được tệp tạm: {error}"))?;
        file.write_all(bytes)
            .map_err(|error| format!("Không ghi được ảnh: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Không đồng bộ được ảnh: {error}"))?;
    }

    if let Err(error) = fs::rename(&temp, target) {
        if target.exists() {
            fs::remove_file(target)
                .map_err(|error| format!("Không thay được ảnh cũ: {error}"))?;
            fs::rename(&temp, target)
                .map_err(|error| format!("Không lưu được ảnh: {error}"))?;
        } else {
            let _ = fs::remove_file(&temp);
            return Err(format!("Không lưu được ảnh: {error}"));
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
            "vietdesk-asset-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("tạo thư mục tạm");
        dir
    }

    #[test]
    fn lam_sach_ten_tep() {
        assert_eq!(safe_file_name("Ảnh đẹp.png"), "nh_dep.png");
        assert_eq!(safe_file_name("../bao\\an.jpg"), "bao_an.jpg");
        assert_eq!(safe_file_name("khong-co-duoi"), "khong-co-duoi.png");
        assert_eq!(safe_file_name(""), "anh.png");
    }

    #[test]
    fn ghi_anh_vao_thu_muc_assets() {
        let dir = temp_dir();
        let document = dir.join("bao-cao.vdx");
        let payload = BASE64.encode(b"noi-dung-anh");

        let relative = asset_write(
            document.to_string_lossy().into_owned(),
            "Ảnh đẹp.png".to_string(),
            payload,
        )
        .expect("ghi ảnh");

        assert_eq!(relative, "assets/Anh_dep.png");
        assert!(dir.join("assets").join("Anh_dep.png").exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn khong_ghi_de_anh_cu() {
        let dir = temp_dir();
        let document = dir.join("bao-cao.vdx");
        let payload = BASE64.encode(b"noi-dung-anh");

        let first = asset_write(
            document.to_string_lossy().into_owned(),
            "anh.png".to_string(),
            payload.clone(),
        )
        .expect("lần 1");
        let second = asset_write(
            document.to_string_lossy().into_owned(),
            "anh.png".to_string(),
            payload,
        )
        .expect("lần 2");

        assert_eq!(first, "assets/anh.png");
        assert_eq!(second, "assets/anh-1.png");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn doc_anh_va_tra_lai_base64() {
        let dir = temp_dir();
        let path = dir.join("anh.png");
        fs::write(&path, b"noi-dung-anh").expect("ghi ảnh");

        let encoded = asset_read_base64(path.to_string_lossy().into_owned()).expect("đọc ảnh");
        assert_eq!(BASE64.decode(encoded).expect("giải mã"), b"noi-dung-anh");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn tu_choi_base64_sai() {
        let dir = temp_dir();
        let document = dir.join("bao-cao.vdx");
        let error = asset_write(
            document.to_string_lossy().into_owned(),
            "anh.png".to_string(),
            "khong-phai-base64!!!".to_string(),
        )
        .unwrap_err();
        assert!(error.contains("base64"));
        let _ = fs::remove_dir_all(dir);
    }
}
