mod commands;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Set once the user has actually asked to quit, so the close handler below
/// stops swallowing the close it would otherwise turn into a hide.
static QUITTING: AtomicBool = AtomicBool::new(false);

/// Summon or dismiss the HUD.
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

fn show_hud(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.show();
    let _ = window.set_focus();
}

/// Actually end the process. Flag first: `exit` closes the window on its way
/// out, and the close handler would otherwise cancel it and hide instead,
/// leaving the quit half-done and Stark still resident.
fn quit(app: &AppHandle) {
    QUITTING.store(true, Ordering::SeqCst);
    app.exit(0);
}

/// The tray icon is what makes hiding on close honest: it is the visible proof
/// Stark is still resident and the one place to shut it down for good. Without
/// it a closed window looks like a closed app while the process lives on,
/// holding Ctrl+Alt+Space so the next launch cannot claim it.
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Stark", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit Stark", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit_item])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Stark — Ctrl+Alt+Space")
        .menu(&menu)
        // Left click belongs to the HUD; the menu is on right click.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_hud(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_hud(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}

/// Drop the launching editor's environment from this process.
///
/// Stark inherits whatever started it. From an editor's integrated terminal
/// that includes `ELECTRON_RUN_AS_NODE=1` and live `VSCODE_*` IPC handles —
/// and any Electron app launched with those inherited runs as plain Node and
/// dies instead of opening. Cursor, Spotify, Discord and Postman are all
/// Electron, so most of the boot routine breaks.
///
/// Purging here rather than per-spawn covers every launch path, including
/// `ShellExecuteW`, which copies the parent environment and cannot be given a
/// modified one.
fn purge_inherited_editor_env() {
    let doomed: Vec<String> = std::env::vars()
        .map(|(k, _)| k)
        .filter(|k| k.starts_with("VSCODE_") || k.starts_with("ELECTRON_"))
        .collect();
    for key in doomed {
        std::env::remove_var(key);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    purge_inherited_editor_env();

    let summon = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
    let watched = summon.clone();

    tauri::Builder::default()
        // A background HUD should vanish, not quit: closing the last window
        // would end the process and take the assistant with it, and
        // Ctrl+Alt+Space brings it back. Quitting for real goes through the
        // tray, which sets QUITTING so this handler steps aside.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if QUITTING.load(Ordering::SeqCst) {
                    return;
                }
                api.prevent_close();
                let _ = window.hide();
            }
        })
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
            // Losing the hotkey must not stop Stark from starting. It is taken
            // whenever a previous instance is still alive or any other app owns
            // the same chord, and propagating that error panics the whole app
            // during setup — the assistant silently fails to launch.
            let shortcuts = app.global_shortcut();
            let _ = shortcuts.unregister(summon.clone());
            if let Err(err) = shortcuts.register(summon.clone()) {
                eprintln!("Ctrl+Alt+Space unavailable ({err}); the window still works.");
            }

            build_tray(app.handle())?;
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
            commands::routine::read_routine,
            commands::routine::write_routine,
            commands::routine::process_running,
            commands::routine::media_play_pause,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
