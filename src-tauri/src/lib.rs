use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  // Must be the first plugin: a second launch (e.g. the OAuth deep link
  // opened by the browser) focuses the running window instead, and the
  // deep-link feature forwards the URL to it.
  #[cfg(desktop)]
  {
    builder = builder
      .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.unminimize();
          let _ = window.show();
          let _ = window.set_focus();
        }
      }))
      .plugin(tauri_plugin_window_state::Builder::default().build())
      .plugin(tauri_plugin_updater::Builder::new().build())
      .plugin(tauri_plugin_process::init());
  }

  builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_notification::init())
    .setup(|app| {
      // Windows and Linux need the biscord:// scheme registered at runtime
      // for dev builds; installers register it on their own.
      #[cfg(any(windows, target_os = "linux"))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        app.deep_link().register_all()?;
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Biscord");
}
