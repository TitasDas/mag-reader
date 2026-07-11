// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        // Native HTTP (Rust-side) so feed/article requests bypass browser CORS,
        // matching the extension's direct-fetch behaviour. No proxy needed.
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running Readstand");
}
