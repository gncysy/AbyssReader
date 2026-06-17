fn main() {
    // 解决 cfg(mobile) 警告
    println!("cargo::rustc-check-cfg=cfg(mobile)");
    tauri_build::build()
}
