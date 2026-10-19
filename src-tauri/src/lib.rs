use std::sync::atomic::{AtomicBool, Ordering};

use tauri::Manager;

/// Whether closing the window hides it to the system tray (set from the
/// app's settings; on by default, like Discord).
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

#[tauri::command]
fn set_close_to_tray(enabled: bool) {
  CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
}

#[cfg(desktop)]
fn show_main(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

/// Tray icon: click to bring the window back, menu to open or quit.
#[cfg(desktop)]
fn create_tray(app: &tauri::App) -> tauri::Result<()> {
  use tauri::menu::{Menu, MenuItem};
  use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

  let open = MenuItem::with_id(app, "open", "Abrir o Biscord", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", "Sair do Biscord", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&open, &quit])?;

  let mut tray = TrayIconBuilder::with_id("main")
    .tooltip("Biscord")
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id.as_ref() {
      "open" => show_main(app),
      "quit" => app.exit(0),
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        show_main(tray.app_handle());
      }
    });
  if let Some(icon) = app.default_window_icon() {
    tray = tray.icon(icon.clone());
  }
  tray.build(app)?;
  Ok(())
}

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
        show_main(app);
      }))
      .plugin(tauri_plugin_window_state::Builder::default().build())
      .plugin(tauri_plugin_updater::Builder::new().build())
      .plugin(tauri_plugin_process::init())
      .plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        Some(vec!["--autostart"]),
      ));
  }

  builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_notification::init())
    .invoke_handler(tauri::generate_handler![set_close_to_tray])
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if CLOSE_TO_TRAY.load(Ordering::Relaxed) {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .setup(|app| {
      // Windows and Linux need the biscord:// scheme registered at runtime
      // for dev builds; installers register it on their own.
      #[cfg(any(windows, target_os = "linux"))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        app.deep_link().register_all()?;
      }

      #[cfg(desktop)]
      {
        create_tray(app)?;
        // launched with the computer: start quietly in the tray
        if std::env::args().any(|arg| arg == "--autostart") {
          if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
          }
        }
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
