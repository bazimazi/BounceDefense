// The game is a self-contained web app (Canvas 2D + WebAudio, saves in localStorage),
// so the native shell only hosts the WebView. Mobile builds enter through `run`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running Bounce Defense");
}
