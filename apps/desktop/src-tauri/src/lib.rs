mod commands;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Summon or dismiss the HUD. This is the only way in when the window is hidden.
fn toggle_hud(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let summon = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
    let watched = summon.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Routes HTTP through Rust, so Ollama is reachable without CORS grief.
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &watched && event.state() == ShortcutState::Pressed {
                        toggle_hud(app);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            app.global_shortcut().register(summon.clone())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::get_system_info,
            commands::system::open_app,
            commands::system::run_command,
            commands::files::list_dir,
            commands::files::read_file,
            commands::files::write_file,
            commands::shell_io::read_clipboard,
            commands::shell_io::write_clipboard,
            commands::shell_io::send_notification,
            commands::shell_io::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
