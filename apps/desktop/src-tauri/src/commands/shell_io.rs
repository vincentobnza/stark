use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

#[tauri::command(rename_all = "snake_case")]
pub fn read_clipboard(app: AppHandle) -> Result<String, String> {
    app.clipboard().read_text().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn write_clipboard(app: AppHandle, text: String) -> Result<String, String> {
    let len = text.len();
    app.clipboard().write_text(text).map_err(|e| e.to_string())?;
    Ok(format!("Copied {len} bytes to the clipboard"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn send_notification(app: AppHandle, title: String, body: String) -> Result<String, String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())?;
    Ok(format!("Shown: {title}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn open_url(app: AppHandle, url: String) -> Result<String, String> {
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(format!("Opened {url}"))
}
