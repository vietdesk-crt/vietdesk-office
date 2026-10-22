// Vỏ desktop: khởi động Tauri, đăng ký command, không chứa logic nghiệp vụ.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    vietdesk_desktop_lib::run()
}
