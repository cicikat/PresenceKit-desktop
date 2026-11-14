use cap_fs_ext::{DirExt, FollowSymlinks, MetadataExt, OpenOptionsFollowExt};
use cap_std::ambient_authority;
use cap_std::fs::{Dir, Metadata, OpenOptions};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use super::{new_id, Grant};

#[path = "discovery.rs"]
mod discovery;
pub use discovery::discover;

pub const FILE_LIMIT: usize = 256 * 1024;
const PAGE_LIMIT: usize = 8192;
const EXTENSIONS: &[&str] = &[
    "html", "htm", "css", "js", "mjs", "ts", "tsx", "jsx", "json", "md", "txt", "py",
];

pub type FileError = &'static str;
type Result<T> = std::result::Result<T, FileError>;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Identity {
    device: u64,
    inode: u64,
}

impl Identity {
    fn of(meta: &Metadata) -> Self {
        Self {
            device: meta.dev(),
            inode: meta.ino(),
        }
    }
}

pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn io(error: std::io::Error) -> FileError {
    match error.kind() {
        std::io::ErrorKind::NotFound => "not_found",
        std::io::ErrorKind::AlreadyExists => "already_exists",
        std::io::ErrorKind::StorageFull => "storage_full",
        std::io::ErrorKind::PermissionDenied => "path_denied",
        _ => "io_failed",
    }
}

pub fn allowed_component(name: &str) -> bool {
    let folded = name.to_ascii_lowercase();
    !name.is_empty()
        && !name.starts_with('.')
        && !name.ends_with([' ', '.'])
        && !name.contains(['\\', '/', ':', '\0', '<', '>', '"', '|', '?', '*', '~'])
        && !name.chars().any(char::is_control)
        && ![
            "appdata",
            "library",
            "windows",
            "system",
            "system32",
            "private",
            "programdata",
            "program files",
            "program files (x86)",
            "users",
            "applications",
            "data",
            "userdata",
            "backups",
            "backup",
            "history",
            "profiles",
            "profile",
            "secrets",
            "credentials",
            "memory",
            "tavern",
            "sillytavern",
            "reality",
            "dream",
            "node_modules",
            "target",
            "presencekit",
            "emerald-presence",
            "emerald-client",
            "emerald-mobile",
            "presencekit-desktop",
            "logins.json",
            "cookies.json",
        ]
        .contains(&folded.as_str())
        && ![
            "password",
            "secret",
            "credential",
            "token",
            "browser",
            "tavern",
            "dossier",
            "id_rsa",
            "id_ed25519",
            "config",
            "backup",
            "history",
            "vector",
            "memory",
        ]
        .iter()
        .any(|word| folded.contains(word))
        && !matches!(
            folded.split('.').next(),
            Some(
                "con"
                    | "prn"
                    | "aux"
                    | "nul"
                    | "com0"
                    | "com1"
                    | "com2"
                    | "com3"
                    | "com4"
                    | "com5"
                    | "com6"
                    | "com7"
                    | "com8"
                    | "com9"
                    | "lpt0"
                    | "lpt1"
                    | "lpt2"
                    | "lpt3"
                    | "lpt4"
                    | "lpt5"
                    | "lpt6"
                    | "lpt7"
                    | "lpt8"
                    | "lpt9"
            )
        )
}

fn unrestricted_component(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or_default().trim_end().to_ascii_lowercase();
    let device = matches!(stem.as_str(), "con" | "prn" | "aux" | "nul" | "conin$" | "conout$")
        || ["com", "lpt"].iter().any(|prefix| stem.strip_prefix(prefix).is_some_and(|suffix|
            matches!(suffix, "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³")));
    !matches!(name, "" | "." | "..")
        && !device
        && !name.ends_with([' ', '.'])
        && !name.contains(['\\', '/', ':', '\0', '<', '>', '"', '|', '?', '*', '~'])
        && !name.chars().any(char::is_control)
}

fn supported(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|v| v.to_str())
        .is_some_and(|v| EXTENSIONS.contains(&v.to_ascii_lowercase().as_str()))
}

#[cfg(windows)]
fn attributes_denied(meta: &Metadata) -> bool {
    use cap_std::fs::MetadataExt as WindowsMetadataExt;
    // Reparse points, system files, offline files and recall-on-access placeholders.
    WindowsMetadataExt::file_attributes(meta) & (0x400 | 0x4 | 0x1000 | 0x400000) != 0
}

#[cfg(not(windows))]
fn attributes_denied(_meta: &Metadata) -> bool {
    false
}

fn checked_dir(parent: &Dir, name: &str, allow_mount: bool) -> Result<Dir> {
    let before = parent.symlink_metadata(name).map_err(io)?;
    if !before.is_dir() || attributes_denied(&before) {
        return Err("path_denied");
    }
    let child = parent.open_dir_nofollow(name).map_err(io)?;
    let after = child.dir_metadata().map_err(io)?;
    if Identity::of(&before) != Identity::of(&after)
        || (!allow_mount
            && Identity::of(&after).device
                != Identity::of(&parent.dir_metadata().map_err(io)?).device)
    {
        return Err("path_denied");
    }
    Ok(child)
}

fn open_root(path: &Path, unrestricted: bool) -> Result<Dir> {
    let mut components = path.components();
    #[cfg(windows)]
    let anchor = {
        use std::path::Prefix;
        let Some(Component::Prefix(prefix)) = components.next() else {
            return Err("path_denied");
        };
        let Prefix::Disk(drive) = prefix.kind() else {
            return Err("path_denied");
        };
        if components.next() != Some(Component::RootDir) {
            return Err("path_denied");
        }
        let root = format!("{}:\\", char::from(drive));
        let wide = [u16::from(drive), 58, 92, 0];
        // DRIVE_FIXED only. This also excludes mapped SMB drives and removable media.
        if unsafe {
            windows::Win32::Storage::FileSystem::GetDriveTypeW(windows::core::PCWSTR(wide.as_ptr()))
        } != 3
        {
            return Err("path_denied");
        }
        PathBuf::from(root)
    };
    #[cfg(not(windows))]
    let anchor = {
        if components.next() != Some(Component::RootDir) {
            return Err("path_denied");
        }
        PathBuf::from("/")
    };

    let mut directory = Dir::open_ambient_dir(anchor, ambient_authority()).map_err(io)?;
    for component in components {
        let Component::Normal(name) = component else {
            return Err("path_denied");
        };
        let name = name.to_str().ok_or("path_denied")?;
        // Standard home-directory ancestors are allowed only while opening the explicit grant.
        if !(if unrestricted { unrestricted_component(name) }
             else { allowed_component(name) || matches!(name, "Users" | "home") }) {
            return Err("path_denied");
        }
        // macOS exposes the local APFS Data volume through the /Users firmlink.
        let allow_mount =
            cfg!(target_os = "macos") && name == "Users" && path.starts_with("/Users");
        directory = checked_dir(&directory, name, allow_mount)?;
    }
    Ok(directory)
}

pub fn approve(
    path: &Path,
    single: bool,
    home: Option<&Path>,
) -> Result<(PathBuf, Option<String>, Identity)> {
    let (root, file) = if single {
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("path_denied")?;
        if !allowed_component(filename) || !supported(filename) {
            return Err("path_denied");
        }
        (
            path.parent().ok_or("path_denied")?,
            Some(filename.to_owned()),
        )
    } else {
        (path, None)
    };
    let leaf = root
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or("path_denied")?;
    if !allowed_component(leaf) || home.is_some_and(|h| h.starts_with(root)) {
        return Err("path_denied");
    }
    let directory = open_root(root, false)?;
    if let Some(name) = &file {
        read_at(&directory, name)?;
    }
    Ok((
        root.to_owned(),
        file,
        Identity::of(&directory.dir_metadata().map_err(io)?),
    ))
}

struct Target {
    parent: Dir,
    name: String,
}

fn root(grant: &Grant) -> Result<Dir> {
    let directory = open_root(&grant.root, grant.unrestricted)?;
    if Identity::of(&directory.dir_metadata().map_err(io)?) != grant.identity {
        return Err("grant_changed");
    }
    Ok(directory)
}

pub(super) fn unrestricted_identity(home: &Path) -> Result<Identity> {
    Ok(Identity::of(&open_root(home, true)?.dir_metadata().map_err(io)?))
}

fn target(grant: &Grant, relative: &str) -> Result<Target> {
    if relative.len() > 512 || grant.file.as_deref().is_some_and(|name| name != relative) {
        return Err("path_denied");
    }
    let normalized = relative.replace('\\', "/");
    let path = Path::new(&normalized);
    if grant.unrestricted && path.is_absolute() {
        if normalized.split('/').any(|part| matches!(part, "." | "..")) {
            return Err("path_denied");
        }
        let name = path.file_name().and_then(|name| name.to_str())
            .filter(|name| unrestricted_component(name)).ok_or("path_denied")?;
        if !supported(name) {
            return Err("unsupported_text");
        }
        let parent = open_root(path.parent().ok_or("path_denied")?, true)?;
        return Ok(Target { parent, name: name.to_owned() });
    }
    let mut parts = normalized.split('/').peekable();
    let mut parent = root(grant)?;
    while let Some(part) = parts.next() {
        if !(if grant.unrestricted { unrestricted_component(part) } else { allowed_component(part) }) {
            return Err("path_denied");
        }
        if parts.peek().is_none() {
            if !supported(part) {
                return Err("unsupported_text");
            }
            return Ok(Target {
                parent,
                name: part.to_string(),
            });
        }
        parent = checked_dir(&parent, part, false)?;
    }
    Err("path_denied")
}

struct TextFile {
    bytes: Vec<u8>,
    meta: Metadata,
}

impl TextFile {
    fn text(&self) -> Result<&str> {
        let text = std::str::from_utf8(&self.bytes).map_err(|_| "unsupported_text")?;
        let text = text.strip_prefix('\u{feff}').unwrap_or(text);
        if text.contains('\0') {
            return Err("unsupported_text");
        }
        Ok(text)
    }
}

fn read_at(parent: &Dir, name: &str) -> Result<TextFile> {
    let before = parent.symlink_metadata(name).map_err(io)?;
    if !before.is_file() || attributes_denied(&before) || before.nlink() != 1 {
        return Err("path_denied");
    }
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let file = parent.open_with(name, &options).map_err(io)?;
    let meta = file.metadata().map_err(io)?;
    if !meta.is_file()
        || meta.nlink() != 1
        || Identity::of(&meta) != Identity::of(&before)
        || attributes_denied(&meta)
        || meta.dev() != parent.dir_metadata().map_err(io)?.dev()
    {
        return Err("path_denied");
    }
    if meta.len() > FILE_LIMIT as u64 {
        return Err("unsupported_text");
    }
    let mut bytes = Vec::new();
    file.take((FILE_LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(io)?;
    if bytes.len() > FILE_LIMIT {
        return Err("unsupported_text");
    }
    let result = TextFile { bytes, meta };
    result.text()?;
    Ok(result)
}

fn read(grant: &Grant, path: &str) -> Result<TextFile> {
    let target = target(grant, path)?;
    read_at(&target.parent, &target.name)
}

pub fn inspect(grant: &Grant, path: &str, start: usize) -> Result<Value> {
    let data = read(grant, path)?;
    let text = data.text()?;
    let mut page = String::new();
    let mut next = start;
    for line in text
        .split_inclusive('\n')
        .skip(start.saturating_sub(1))
        .take(100)
    {
        if page.len() + line.len() > PAGE_LIMIT {
            if page.is_empty() {
                return Err("unsupported_text");
            }
            break;
        }
        page.push_str(line);
        next += 1;
    }
    Ok(
        json!({"path":path, "content":page, "start":start, "next":next,
              "end":next.saturating_sub(1), "has_more":text.split_inclusive('\n').count() >= next,
              "sha256":hash(&data.bytes), "size":data.bytes.len()}),
    )
}

fn search_entry(dir: &Dir, name: &str, relative: &str, query: &str, found: &mut Vec<Value>) {
    if !supported(name) {
        return;
    }
    let Ok(data) = read_at(dir, name) else { return };
    if query.is_empty()
        || name.to_lowercase().contains(query)
        || data
            .text()
            .is_ok_and(|txt| txt.to_lowercase().contains(query))
    {
        let modified = data
            .meta
            .modified()
            .ok()
            .and_then(|value| value.into_std().duration_since(std::time::UNIX_EPOCH).ok())
            .map(|value| value.as_secs());
        found.push(json!({"path":relative, "size":data.bytes.len(), "sha256":hash(&data.bytes), "mtime":modified}));
    }
}

fn walk(
    dir: &Dir,
    prefix: &str,
    depth: usize,
    query: &str,
    visited: &mut usize,
    found: &mut Vec<Value>,
) -> Result<()> {
    for entry in dir.entries().map_err(io)? {
        if *visited >= 256 || found.len() >= 20 {
            break;
        }
        *visited += 1;
        let Ok(entry) = entry else { continue };
        let name = entry.file_name();
        let Some(name) = name.to_str().filter(|v| allowed_component(v)) else {
            continue;
        };
        let relative = if prefix.is_empty() {
            name.to_owned()
        } else {
            format!("{prefix}/{name}")
        };
        if relative.len() > 512 {
            continue;
        }
        if entry.file_type().is_ok_and(|v| v.is_dir()) {
            if depth < 6 {
                if let Ok(child) = checked_dir(dir, name, false) {
                    walk(&child, &relative, depth + 1, query, visited, found)?;
                }
            }
        } else {
            search_entry(dir, name, &relative, query, found);
        }
    }
    Ok(())
}

pub fn find(grant: &Grant, query: &str) -> Result<Value> {
    let dir = root(grant)?;
    let input = query.trim().replace('\\', "/");
    let query = input.to_lowercase();
    let mut found = Vec::new();
    let mut visited = 0;
    if let Ok(target) = target(grant, &input) {
        search_entry(&target.parent, &target.name, &input, "", &mut found);
    }
    if !found.is_empty() {
        return Ok(json!({"truncated":false,"files":found}));
    }
    if let Some(name) = &grant.file {
        search_entry(&dir, name, name, &query, &mut found);
    } else if grant.unrestricted {
        // Check the common save locations before a bounded search under the home directory.
        let mut truncated = false;
        for name in ["Downloads", "Desktop", "Documents"] {
            if let Ok(child) = checked_dir(&dir, name, false) {
                let mut scanned = 0;
                walk(&child, name, 0, &query, &mut scanned, &mut found)?;
                truncated |= scanned >= 256;
            }
        }
        if found.is_empty() {
            walk(&dir, "", 0, &query, &mut visited, &mut found)?;
        }
        return Ok(json!({"truncated":truncated || visited >= 256 || found.len() >= 20,"files":found}));
    } else {
        walk(&dir, "", 0, &query, &mut visited, &mut found)?;
    }
    Ok(json!({"truncated":visited >= 256 || found.len() >= 20,"files":found}))
}

pub fn verify(grant: &Grant, path: &str, expected: &str) -> Result<Value> {
    let file = read(grant, path)?;
    let digest = hash(&file.bytes);
    if digest != expected {
        return Err("revision_conflict");
    }
    let syntax = if path.to_ascii_lowercase().ends_with(".json") {
        if serde_json::from_str::<Value>(file.text()?).is_ok() {
            "passed"
        } else {
            "failed"
        }
    } else {
        "unknown"
    };
    Ok(
        json!({"verified":true,"sha256":digest,"syntax_checked":syntax,
              "build_checked":"unknown","visual_checked":"unknown"}),
    )
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Version {
    pub id: String,
    pub task_id: String,
    pub workspace_id: String,
    pub revision: String,
    pub path: String,
    pub before: Option<Vec<u8>>,
    pub after_hash: String,
    pub diff: String,
}

pub struct Mutation {
    original: Option<TextFile>,
    bytes: Vec<u8>,
    pub version: Version,
}

pub fn prepare(
    grant: &Grant,
    task_id: &str,
    path: &str,
    op: &str,
    expected: &str,
    before: &str,
    after: &str,
    undo: Option<&Version>,
) -> Result<Mutation> {
    if !grant.write {
        return Err("read_only");
    }
    let target = target(grant, path)?;
    let original = match read_at(&target.parent, &target.name) {
        Err("not_found") if op == "create" => None,
        Ok(_) if op == "create" => return Err("already_exists"),
        value => Some(value?),
    };
    let mut diff = format!("-{before}\n+{after}");
    let bytes = match (&original, op) {
        (None, "create") => after.as_bytes().to_vec(),
        (Some(data), "patch") => {
            if hash(&data.bytes) != expected {
                return Err("revision_conflict");
            }
            let text = data.text()?;
            let crlf = text.contains("\r\n");
            let normalize = |s: &str| {
                let s = s.replace("\r\n", "\n");
                if crlf {
                    s.replace('\n', "\r\n")
                } else {
                    s
                }
            };
            let needle = normalize(before);
            let replacement = normalize(after);
            if needle.is_empty()
                || needle == replacement
                || text.match_indices(&needle).count() != 1
            {
                return Err("patch_context_mismatch");
            }
            let mut bytes = Vec::new();
            if data.bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
                bytes.extend([0xef, 0xbb, 0xbf]);
            }
            bytes.extend(text.replacen(&needle, &replacement, 1).as_bytes());
            bytes
        }
        (Some(data), "undo") => {
            let old = undo.ok_or("not_found")?;
            if old.workspace_id != grant.id || old.revision != grant.revision || old.path != path {
                return Err("grant_changed");
            }
            if hash(&data.bytes) != old.after_hash {
                return Err("revision_conflict");
            }
            diff = format!("Undo {}", old.id);
            old.before.clone().ok_or("read_only")?
        }
        _ => return Err("invalid_action"),
    };
    if bytes.len() > FILE_LIMIT || bytes.contains(&0) {
        return Err("unsupported_text");
    }
    let version = Version {
        id: new_id()?,
        task_id: task_id.to_owned(),
        workspace_id: grant.id.clone(),
        revision: grant.revision.clone(),
        path: path.to_owned(),
        before: original.as_ref().map(|v| v.bytes.clone()),
        after_hash: hash(&bytes),
        diff,
    };
    Ok(Mutation {
        original,
        bytes,
        version,
    })
}

impl Mutation {
    pub fn commit(&self, grant: &Grant) -> Result<()> {
        let entry = target(grant, &self.version.path)?;
        let temp = format!(".presencekit-{}.tmp", self.version.id);
        let mut options = OpenOptions::new();
        options
            .write(true)
            .create_new(true)
            .follow(FollowSymlinks::No);
        let mut file = entry.parent.open_with(&temp, &options).map_err(io)?;
        let write = (|| {
            file.write_all(&self.bytes).map_err(io)?;
            if let Some(old) = &self.original {
                file.set_permissions(old.meta.permissions()).map_err(io)?;
            }
            file.sync_all().map_err(io)?;
            drop(file);
            let current = target(grant, &self.version.path)?;
            if Identity::of(&current.parent.dir_metadata().map_err(io)?)
                != Identity::of(&entry.parent.dir_metadata().map_err(io)?)
            {
                return Err("grant_changed");
            }
            if let Some(old) = &self.original {
                let latest = read_at(&current.parent, &current.name)?;
                if Identity::of(&old.meta) != Identity::of(&latest.meta)
                    || old.bytes != latest.bytes
                {
                    return Err("revision_conflict");
                }
                entry
                    .parent
                    .rename(&temp, &entry.parent, &entry.name)
                    .map_err(io)?;
            } else {
                entry
                    .parent
                    .hard_link(&temp, &entry.parent, &entry.name)
                    .map_err(io)?;
                entry
                    .parent
                    .remove_file(&temp)
                    .map_err(|_| "outcome_unknown")?;
            }
            let confirmed = read(grant, &self.version.path).map_err(|_| "outcome_unknown")?;
            if hash(&confirmed.bytes) != self.version.after_hash {
                return Err("outcome_unknown");
            }
            Ok(())
        })();
        if write.is_err() {
            let _ = entry.parent.remove_file(&temp);
        }
        write
    }
}

pub fn reconcile(grant: &Grant, version: &Version) -> Result<Value> {
    verify(grant, &version.path, &version.after_hash).map_err(|_| "outcome_unknown")?;
    Ok(saved(version))
}

pub fn saved(version: &Version) -> Value {
    json!({"saved":true,"sha256":version.after_hash,"version_id":version.id,"diff":version.diff})
}

pub fn durable_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let parent = path.parent().ok_or("io_failed")?;
    fs::create_dir_all(parent).map_err(io)?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(io)?;
    serde_json::to_writer(&mut temp, value).map_err(|_| "io_failed")?;
    temp.as_file().sync_all().map_err(io)?;
    temp.persist(path).map_err(|e| io(e.error))?;
    #[cfg(unix)]
    fs::File::open(parent)
        .and_then(|dir| dir.sync_all())
        .map_err(io)?;
    Ok(())
}
