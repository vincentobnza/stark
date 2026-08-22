//! Boot-routine support: config persistence, readiness checks, media control.
//!
//! The sequencing itself lives in the frontend, which already owns speech and
//! the HUD. Rust only provides what the webview cannot do: durable config on
//! disk, "is this process up yet", and a global media key.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use sysinfo::System;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone)]
pub struct RoutineStep {
    pub id: String,
    pub label: String,
    pub enabled: bool,
    /// Executable or protocol to hand to `open_app`.
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    /// Process name to wait for before continuing, e.g. "Code.exe".
    #[serde(default)]
    pub await_process: Option<String>,
    /// Press Play/Pause once this step's process is up.
    #[serde(default)]
    pub media_play: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Routine {
    pub enabled: bool,
    /// Let the desktop settle before opening anything.
    pub initial_delay_ms: u64,
    /// Gap between steps, so Windows is not hit with everything at once.
    pub gap_ms: u64,
    pub speak_greeting: bool,
    pub speak_summary: bool,
    pub steps: Vec<RoutineStep>,
}

impl Default for Routine {
    fn default() -> Self {
        Self {
            enabled: true,
            initial_delay_ms: 1200,
            gap_ms: 900,
            speak_greeting: true,
            speak_summary: true,
            steps: vec![
                RoutineStep {
                    id: "vscode".into(),
                    label: "VS Code".into(),
                    enabled: true,
                    // Explicit path: bare `code` on this machine resolves to
                    // Cursor's shim, which would open the wrong editor.
                    command: r"C:\Users\vince\AppData\Local\Programs\Microsoft VS Code\Code.exe"
                        .into(),
                    args: vec![r"C:\Users\vince\dev\stark".into()],
                    await_process: Some("Code.exe".into()),
                    media_play: false,
                },
                RoutineStep {
                    id: "chrome".into(),
                    label: "Chrome".into(),
                    enabled: true,
                    command: "chrome".into(),
                    args: vec![],
                    await_process: Some("chrome.exe".into()),
                    media_play: false,
                },
                RoutineStep {
                    id: "spotify".into(),
                    label: "Spotify".into(),
                    enabled: true,
                    command: "spotify".into(),
                    args: vec![],
                    await_process: Some("Spotify.exe".into()),
                    // Resume whatever was last playing.
                    media_play: true,
                },
                RoutineStep {
                    id: "terminal".into(),
                    label: "Terminal".into(),
                    enabled: true,
                    command: "wt".into(),
                    args: vec![],
                    await_process: Some("WindowsTerminal.exe".into()),
                    media_play: false,
                },
                RoutineStep {
                    id: "postman".into(),
                    label: "Postman".into(),
                    enabled: true,
                    // Not on PATH and no App Paths entry, so it must be explicit.
                    command: r"C:\Users\vince\AppData\Local\Postman\Postman.exe".into(),
                    args: vec![],
                    await_process: Some("Postman.exe".into()),
                    media_play: false,
                },
            ],
        }
    }
}

fn routine_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    Ok(dir.join("routine.json"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn read_routine(app: AppHandle) -> Result<Routine, String> {
    let path = routine_path(&app)?;
    if !path.exists() {
        // First run: persist the defaults so the file is there to edit.
        let fresh = Routine::default();
        let json = serde_json::to_string_pretty(&fresh).map_err(|e| e.to_string())?;
        std::fs::write(&path, json).map_err(|e| format!("{}: {e}", path.display()))?;
        return Ok(fresh);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    // A hand-edited file that no longer parses should not brick the boot
    // sequence; fall back to defaults rather than failing the whole routine.
    Ok(serde_json::from_str(&raw).unwrap_or_else(|_| Routine::default()))
}

#[tauri::command(rename_all = "snake_case")]
pub fn write_routine(app: AppHandle, routine: Routine) -> Result<String, String> {
    let path = routine_path(&app)?;
    let json = serde_json::to_string_pretty(&routine).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(path.display().to_string())
}

/// Case-insensitive: Windows process names vary by how they were launched.
#[tauri::command(rename_all = "snake_case")]
pub fn process_running(name: String) -> bool {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let needle = name.to_lowercase();
    sys.processes()
        .values()
        .any(|p| p.name().to_string_lossy().to_lowercase() == needle)
}

/// Global Play/Pause. `keybd_event` rather than SendKeys, which only reaches
/// the focused window and would miss a Spotify that just started in the tray.
#[tauri::command(rename_all = "snake_case")]
pub fn media_play_pause() -> Result<String, String> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            keybd_event, KEYEVENTF_KEYUP, VK_MEDIA_PLAY_PAUSE,
        };
        unsafe {
            keybd_event(VK_MEDIA_PLAY_PAUSE.0 as u8, 0, Default::default(), 0);
            keybd_event(VK_MEDIA_PLAY_PAUSE.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        }
        Ok("Sent play/pause".into())
    }
    #[cfg(not(windows))]
    {
        Err("Media keys are Windows-only".into())
    }
}
