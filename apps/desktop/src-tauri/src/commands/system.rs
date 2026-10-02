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

/// Strip the launching environment from child processes.
///
/// Stark inherits whatever environment started it. Launched from an editor's
/// integrated terminal, that includes `ELECTRON_RUN_AS_NODE=1` and a pile of
/// `VSCODE_*` IPC handles — and an Electron app that inherits those runs as
/// plain Node and dies instead of opening. Cursor, Spotify, Discord and Postman
/// are all Electron, so most of the boot routine breaks. What launched Stark
/// must not decide whether Stark can launch anything.
fn scrub_env(cmd: &mut std::process::Command) {
    cmd.env_remove("ELECTRON_RUN_AS_NODE");
    for (key, _) in std::env::vars() {
        if key.starts_with("VSCODE_") || key.starts_with("ELECTRON_") {
            cmd.env_remove(key);
        }
    }
}

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

/// Launch anything the way a double-click would.
///
/// Previously this branched: spawn the process directly for real file paths,
/// shell out to `cmd /C start` for bare names and protocols. Two code paths
/// with different quoting, different PATH resolution and different failure
/// reporting is exactly why launching was inconsistent — `cmd` silently
/// mangled paths containing spaces and reported success regardless.
///
/// `ShellExecuteW` is the single call the shell itself uses: it resolves PATH
/// and App Paths, handles Store aliases, opens protocol URIs, needs no quoting,
/// and returns a real error code. One path, one behaviour.
#[cfg(windows)]
fn shell_open(target: &str, params: Option<&str>) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
    };
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(s: &str) -> Vec<u16> {
        std::ffi::OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let verb = wide("open");
    let file = wide(target);
    let args = params.map(wide);

    // ShellExecuteW requires COM on the calling thread and pumps messages while
    // it resolves a handler. This runs on a blocking worker, never the UI
    // thread — doing it there interferes with the window's own message loop.
    let com = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
    let initialised = com.is_ok();

    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(file.as_ptr()),
            args.as_ref().map_or(PCWSTR::null(), |a| PCWSTR(a.as_ptr())),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };

    if initialised {
        unsafe { CoUninitialize() };
    }

    // Legacy API: a value of 32 or less is the error code, anything above is
    // an instance handle meaning success.
    let code = result.0 as usize;
    if code > 32 {
        Ok(())
    } else {
        Err(match code {
            2 => "not found".into(),
            3 => "path not found".into(),
            5 => "access denied".into(),
            8 => "out of memory".into(),
            31 => "no application is associated with this file".into(),
            other => format!("ShellExecute error {other}"),
        })
    }
}

/// Async so the shell call lands on a blocking worker: `ShellExecuteW` pumps
/// messages, and a sync Tauri command would run it on the UI thread.
#[tauri::command(rename_all = "snake_case")]
pub async fn open_app(name: String, args: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let target = windows_target(&name);
            // ShellExecuteW takes the arguments as one pre-quoted string.
            let params = if args.is_empty() {
                None
            } else {
                Some(
                    args.iter()
                        .map(|a| if a.contains(' ') { format!("\"{a}\"") } else { a.clone() })
                        .collect::<Vec<_>>()
                        .join(" "),
                )
            };
            shell_open(&target, params.as_deref())
                .map_err(|e| format!("Could not launch {name}: {e}"))?;
            Ok(format!("Launched {name}"))
        }

        #[cfg(not(windows))]
        {
            let mut cmd = std::process::Command::new(&name);
            cmd.args(&args);
            hide_window(&mut cmd);
            scrub_env(&mut cmd);
            cmd.spawn().map_err(|e| format!("Could not launch {name}: {e}"))?;
            Ok(format!("Launched {name}"))
        }
    })
    .await
    .map_err(|e| format!("Launch task failed: {e}"))?
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
        scrub_env(&mut cmd);

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
