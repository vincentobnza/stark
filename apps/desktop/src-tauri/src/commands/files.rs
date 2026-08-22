use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct DirEntry {
    name: String,
    is_dir: bool,
    size_bytes: u64,
}

#[derive(Serialize)]
pub struct FileContents {
    path: String,
    contents: String,
    truncated: bool,
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| format!("{path}: {e}"))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size_bytes: meta.len(),
        });
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(entries)
}

#[tauri::command(rename_all = "snake_case")]
pub fn read_file(path: String, max_bytes: usize) -> Result<FileContents, String> {
    let raw = std::fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    let truncated = raw.len() > max_bytes;
    // Truncation can cut a multi-byte char in half; from_utf8_lossy replaces
    // the fragment rather than failing.
    let slice = if truncated { &raw[..max_bytes] } else { &raw[..] };
    Ok(FileContents {
        path,
        contents: String::from_utf8_lossy(slice).into_owned(),
        truncated,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn write_file(path: String, contents: String) -> Result<String, String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    std::fs::write(&target, contents.as_bytes()).map_err(|e| format!("{path}: {e}"))?;
    Ok(format!("Wrote {} bytes to {path}", contents.len()))
}
