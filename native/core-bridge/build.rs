// Biên dịch lõi C++ trực tiếp bằng crate `cc` (không cần CMake).
// Nếu sau này lõi phụ thuộc thư viện ngoài (HarfBuzz, ICU, libxml2), chuyển
// sang crate `cmake` và giữ nguyên phần khai báo rerun-if-changed.
use std::path::PathBuf;

fn main() {
    let core = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../core");

    let sources = [
        "src/common/utf8.cpp",
        "src/formula/formula.cpp",
        "src/vietnamese/vietnamese.cpp",
        "src/ffi/abi.cpp",
    ];

    let mut build = cc::Build::new();
    build
        .cpp(true)
        .std("c++17")
        .include(core.join("include"))
        .include(core.join("src"))
        .warnings(true)
        .flag_if_supported("-fno-rtti");

    for source in sources {
        let path = core.join(source);
        println!("cargo:rerun-if-changed={}", path.display());
        build.file(path);
    }
    println!(
        "cargo:rerun-if-changed={}",
        core.join("include/vietdesk/core.h").display()
    );

    build.compile("vietdesk_core");
}
