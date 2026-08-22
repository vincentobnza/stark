use serde::Serialize;
use sysinfo::System;

#[derive(Serialize)]
pub struct SystemInfo {
    os: String,
    os_version: String,
    hostname: String,
    cpu_count: usize,
    total_memory_mb: u64,
    used_memory_mb: u64,
    local_time: String,
}

#[derive(Serialize)]
pub struct CommandOutput {
    stdout: String,
    stderr: String,
    exit_code: i32,
}

/// Hide the console window that would otherwise flash on every spawn.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
fn hide_window(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_window(_cmd: &mut std::process::Command) {}

#[tauri::command(rename_all = "snake_case")]
pub fn get_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_memory();

    SystemInfo {
        os: System::name().unwrap_or_else(|| "unknown".into()),
        os_version: System::os_version().unwrap_or_else(|| "unknown".into()),
        hostname: System::host_name().unwrap_or_else(|| "unknown".into()),
        cpu_count: sys.cpus().len(),
        total_memory_mb: sys.total_memory() / 1_048_576,
        used_memory_mb: sys.used_memory() / 1_048_576,
        local_time: chrono::Local::now().format("%Y-%m-%d %H:%M:%S %Z").to_string(),
    }
}

/// Several built-in Windows apps are URI protocols, not executables. `start`
/// resolves `ms-settings:` but reports "cannot find the file" for `ms-settings`,
/// and a model asked to "open settings" naturally omits the colon.
#[cfg(windows)]
fn windows_target(name: &str) -> String {
    let looks_like_protocol = name.starts_with("ms-") || name.starts_with("shell:");
    if looks_like_protocol && !name.contains(':') {
        format!("{name}:")
    } else {
        name.to_string()
    }
}

#[tauri::command(rename_all = "snake_case")]
pub fn open_app(name: String, args: Vec<String>) -> Result<String, String> {
    #[cfg(windows)]
    let target = windows_target(&name);
    #[cfg(not(windows))]
    let target = name.clone();

    // A real file is spawned directly. Routing it through `cmd /C start` means
    // cmd re-parses the command line, and a path containing spaces (e.g.
    // "Microsoft VS Code") gets split despite Rust's quoting — the launch then
    // fails silently, because `start` reports nothing back to us.
    // `start` is only needed to resolve bare names via PATH / App Paths and to
    // open protocol URIs like ms-settings:.
    let mut cmd = if std::path::Path::new(&target).is_file() {
        std::process::Command::new(&target)
    } else if cfg!(windows) {
        let mut c = std::process::Command::new("cmd");
        // The empty "" is the window title that `start` would otherwise steal
        // from the first quoted argument.
        c.args(["/C", "start", "", target.as_str()]);
        c
    } else {
        std::process::Command::new(&target)
    };
    cmd.args(&args);
    hide_window(&mut cmd);

    cmd.spawn().map_err(|e| format!("Could not launch {name}: {e}"))?;
    Ok(format!("Launched {name}"))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn run_command(command: String, cwd: Option<String>) -> Result<CommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = if cfg!(windows) {
            let mut c = std::process::Command::new("powershell");
            c.args(["-NoProfile", "-NonInteractive", "-Command", command.as_str()]);
            c
        } else {
            let mut c = std::process::Command::new("sh");
            c.args(["-c", command.as_str()]);
            c
        };
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }
        hide_window(&mut cmd);

        let out = cmd.output().map_err(|e| e.to_string())?;
        Ok(CommandOutput {
            stdout: String::from_utf8_lossy(&out.stdout).trim_end().to_string(),
            stderr: String::from_utf8_lossy(&out.stderr).trim_end().to_string(),
            exit_code: out.status.code().unwrap_or(-1),
        })
    })
    .await
    .map_err(|e| format!("Command task failed: {e}"))?
}
