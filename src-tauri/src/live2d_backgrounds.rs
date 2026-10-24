use base64::Engine;
use serde::Serialize;
use std::{fs, path::{Path, PathBuf}};
use tauri::Manager;

const MAX_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Serialize)]
pub struct Background { file: String, label: String }

fn mime(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"), "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"), _ => None,
    }
}

fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        let dev = Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/live2d/backgrounds");
        if dev.is_dir() { return Ok(dev); }
    }
    app.path().resource_dir().map(|dir| dir.join("live2d/backgrounds")).map_err(|e| e.to_string())
}

fn checked_file(root: &Path, file: &str) -> Result<PathBuf, String> {
    if file.split(['/', '\\']).any(|part| part.is_empty() || part == "." || part == ".." || part.contains(':')) {
        return Err("Invalid background file".into());
    }
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    let path = root.join(file).canonicalize().map_err(|e| e.to_string())?;
    if !path.starts_with(&canonical_root) || !path.is_file() || mime(&path).is_none() {
        return Err("Background must be an image inside the background directory".into());
    }
    Ok(path)
}

fn collect(root: &Path, directory: &Path, depth: usize, output: &mut Vec<Background>) -> Result<(), String> {
    if depth > 4 || output.len() >= 2000 { return Ok(()); }
    for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
        if output.len() >= 2000 { break; }
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if entry.file_type().map_err(|e| e.to_string())?.is_symlink() { continue; }
        if path.is_dir() { collect(root, &path, depth + 1, output)?; }
        else if mime(&path).is_some() {
            let Some(relative) = path.strip_prefix(root).ok().and_then(|p| p.to_str()) else { continue; };
            if checked_file(root, relative).is_err() || entry.metadata().map_err(|e| e.to_string())?.len() > MAX_BYTES { continue; }
            let file = relative.replace('\\', "/");
            output.push(Background { label: file.clone(), file });
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_live2d_backgrounds(app: tauri::AppHandle) -> Result<Vec<Background>, String> {
    let root = root(&app)?;
    let mut files = Vec::new();
    if root.is_dir() { collect(&root, &root, 0, &mut files)?; }
    files.sort_by(|a, b| a.file.cmp(&b.file));
    Ok(files)
}

#[tauri::command]
pub fn read_live2d_background(app: tauri::AppHandle, file: String) -> Result<String, String> {
    let path = checked_file(&root(&app)?, &file)?;
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    use std::io::Read;
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES { return Err("Background exceeds 32 MiB".into()); }
    Ok(format!("data:{};base64,{}", mime(&path).unwrap(), base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_traversal_and_lists_only_images() {
        let temp = std::env::temp_dir().canonicalize().unwrap();
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root = temp.join(format!("live2d-bg-{}-{nonce}", std::process::id()));
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("sub/test.png"), b"test").unwrap();
        fs::write(root.join("notes.txt"), b"not an image").unwrap();
        for bad in ["../test.png", "..\\test.png", "C:/test.png", "/test.png", "sub/../test.png"] {
            assert!(checked_file(&root, bad).is_err());
        }
        let mut files = Vec::new(); collect(&root, &root, 0, &mut files).unwrap();
        assert_eq!(files.len(), 1); assert_eq!(files[0].file, "sub/test.png");
        assert!(root.starts_with(&temp));
        fs::remove_dir_all(&root).unwrap();
    }
}
