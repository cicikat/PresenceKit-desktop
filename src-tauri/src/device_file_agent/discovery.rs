//! Bounded metadata discovery; file names never cause a content read.
use super::*;
use regex::{Regex, RegexBuilder};
use std::time::{Duration, Instant};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Options {
    #[serde(default)]
    query: String,
    #[serde(default)]
    mode: Option<String>,
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default = "default_depth")]
    depth: usize,
    #[serde(default)]
    cursor: Option<String>,
    #[serde(default = "default_start")]
    start: usize,
    #[serde(default)]
    content_search: bool,
}
fn default_limit() -> usize { 50 }
fn default_depth() -> usize { 6 }
fn default_start() -> usize { 1 }

// Metadata may identify config.json, but reading it retains the original policy.
fn metadata_name(name: &str) -> bool {
    unrestricted_component(name)
        && (allowed_component(name) || name.eq_ignore_ascii_case("config.json")
            || (name.starts_with('.') && allowed_component(name.trim_start_matches('.'))))
}

fn relative(grant: &Grant, input: &str) -> Result<String> {
    let input = input.replace('\\', "/");
    if input.len() > 512 || input.split('/').any(|p| matches!(p, "." | "..")) {
        return Err("path_denied");
    }
    if Path::new(&input).is_absolute() {
        if grant.unrestricted { return Ok(input); }
        let base = grant.root.to_string_lossy().replace('\\', "/");
        let prefix = format!("{}/", base.trim_end_matches('/'));
        if input.eq_ignore_ascii_case(base.trim_end_matches('/')) { return Ok(String::new()); }
        if input.get(..prefix.len()).is_some_and(|s| s.eq_ignore_ascii_case(&prefix)) {
            return Ok(input[prefix.len()..].to_owned());
        }
        return Err("path_denied");
    }
    Ok(input)
}

fn directory(grant: &Grant, path: &str) -> Result<Dir> {
    root(grant)?;
    if grant.unrestricted && Path::new(path).is_absolute() {
        return open_root(Path::new(path), true);
    }
    let mut dir = root(grant)?;
    for name in path.split('/').filter(|s| !s.is_empty()) {
        if !(if grant.unrestricted { unrestricted_component(name) } else { allowed_component(name) }) {
            return Err("path_denied");
        }
        dir = checked_dir(&dir, name, false)?;
    }
    Ok(dir)
}

fn metadata(dir: &Dir, name: &str, path: &str) -> Result<Value> {
    let meta = dir.symlink_metadata(name).map_err(io)?;
    if attributes_denied(&meta) || meta.file_type().is_symlink()
        || (!meta.is_dir() && (!meta.is_file() || meta.nlink() != 1)) {
        return Err("path_denied");
    }
    let mtime = meta.modified().ok()
        .and_then(|v| v.into_std().duration_since(std::time::UNIX_EPOCH).ok())
        .map(|v| v.as_nanos().to_string());
    Ok(json!({"name":name,"relative_path":path,"type":if meta.is_dir() {"directory"} else {"file"},
              "size":meta.len(),"mtime":mtime}))
}

fn matcher(options: &Options, content: bool) -> Result<Regex> {
    let mode = options.mode.as_deref().unwrap_or(if content { "literal" } else { "substring" });
    let pattern = match (content, mode) {
        (true, "literal") | (false, "substring") => regex::escape(&options.query),
        (true, "regex") => options.query.clone(),
        (false, "exact") => format!("^{}$", regex::escape(&options.query)),
        (false, "glob") => {
            let mut result = String::from("^");
            let mut chars = options.query.chars().peekable();
            while let Some(ch) = chars.next() {
                match ch {
                    '*' if chars.peek() == Some(&'*') => {
                        chars.next();
                        if chars.peek() == Some(&'/') { chars.next(); result.push_str("(?:.*/)?"); }
                        else { result.push_str(".*"); }
                    }
                    '*' => result.push_str("[^/]*"),
                    '?' => result.push_str("[^/]"),
                    _ => result.push_str(&regex::escape(&ch.to_string())),
                }
            }
            result.push('$');
            result
        }
        _ => return Err("invalid_action"),
    };
    RegexBuilder::new(&pattern).case_insensitive(!content).size_limit(65536)
        .build().map_err(|_| "invalid_action")
}

struct Scan<'a> {
    grant: &'a Grant,
    options: &'a Options,
    op: &'a str,
    matcher: Regex,
    began: Instant,
    visited: usize,
    bytes: usize,
    incomplete: bool,
    rows: Vec<Value>,
}
impl Scan<'_> {
    fn checkpoint(&mut self) -> Result<bool> {
        root(self.grant)?; // Detect replacement even while traversing an open handle.
        let ok = self.bytes <= 8 * 1024 * 1024
            && self.rows.len() < 4096 && self.began.elapsed() < Duration::from_secs(1);
        self.incomplete |= !ok;
        Ok(ok)
    }
    fn walk(&mut self, dir: &Dir, prefix: &str, depth: usize) -> Result<()> {
        for entry in dir.entries().map_err(io)? {
            if !self.checkpoint()? { break; }
            if self.visited >= 4096 { self.incomplete = true; break; }
            self.visited += 1;
            let entry = entry.map_err(io)?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else { continue };
            if self.grant.file.as_ref().is_some_and(|f| !f.eq_ignore_ascii_case(&name)) { continue; }
            if !(if self.grant.unrestricted { unrestricted_component(&name) } else { metadata_name(&name) }) {
                continue;
            }
            let path = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
            if path.len() > 512 { self.incomplete = true; continue; }
            let Ok(row) = metadata(dir, &name, &path) else { continue };
            let is_dir = row["type"] == "directory";
            if self.op == "list_dir" || (self.op == "find_name"
                && self.matcher.is_match(if self.options.query.contains('/') { &path } else { &name })) {
                self.rows.push(row);
            } else if self.op == "search_text" && !is_dir
                && (self.grant.unrestricted || allowed_component(&name)) && supported(&name) {
                // Bound bytes before opening; read_at also validates identity/nofollow/size.
                let size = row["size"].as_u64().unwrap_or(u64::MAX);
                if size > FILE_LIMIT as u64 { continue; }
                if self.bytes + size as usize > 8 * 1024 * 1024 { self.incomplete = true; break; }
                self.bytes += size as usize;
                let Ok(data) = read_at(dir, &name) else { continue };
                for (line, text) in data.text()?.lines().enumerate() {
                    if !self.checkpoint()? { break; }
                    if self.matcher.is_match(text) {
                        self.rows.push(json!({"relative_path":path,"line":line+1,
                                              "short_excerpt":text.chars().take(160).collect::<String>()}));
                    }
                }
            }
            if is_dir && self.op != "list_dir" {
                if depth >= self.options.depth { self.incomplete = true; continue; }
                if !self.grant.unrestricted && !allowed_component(&name) { continue; }
                if let Ok(child) = checked_dir(dir, &name, false) { self.walk(&child, &path, depth+1)?; }
            }
        }
        Ok(())
    }
}

pub fn discover(grant: &Grant, op: &str, input: &str, raw: &str) -> Result<Value> {
    let options: Options = serde_json::from_str(raw).map_err(|_| "invalid_action")?;
    if !(1..=100).contains(&options.limit) || options.depth > 12 || options.query.len() > 512
        || !(1..=262144).contains(&options.start) { return Err("invalid_action"); }
    let path = relative(grant, input)?;
    if op == "read_page" { return inspect(grant, &path, options.start); }
    root(grant)?;
    if op == "stat" {
        if path.is_empty() && grant.file.is_none() {
            return Ok(json!({"relative_path":"","type":"directory","size":0}));
        }
        let (parent, name) = path.rsplit_once('/').unwrap_or(("", &path));
        if grant.file.as_ref().is_some_and(|f| !f.eq_ignore_ascii_case(&path))
            || !(if grant.unrestricted { unrestricted_component(name) } else { metadata_name(name) }) {
            return Err("path_denied");
        }
        return metadata(&directory(grant, parent)?, name, &path);
    }
    if !matches!(op, "list_dir" | "find_name" | "search_text") { return Err("unsupported_operation"); }
    if op == "search_text" && (!options.content_search || options.query.is_empty()) { return Err("invalid_action"); }
    if grant.file.is_some() && !path.is_empty() { return Err("path_denied"); }
    let mut scan = Scan { grant, options: &options, op, matcher: matcher(&options, op == "search_text")?,
                          began: Instant::now(), visited: 0, bytes: 0, incomplete: false, rows: vec![] };
    scan.walk(&directory(grant, &path)?, &path, 0)?;
    root(grant)?;
    scan.rows.sort_by_key(|row| {
        let path = row["relative_path"].as_str().unwrap_or("");
        (path.to_lowercase(), path.to_owned(), row["line"].as_u64().unwrap_or(0))
    });
    let signature = hash(&serde_json::to_vec(&json!([grant.id,grant.revision,op,path,options.query,
        options.mode,options.depth,scan.rows])).map_err(|_| "io_failed")?);
    let offset = if let Some(cursor) = &options.cursor {
        let (digest, offset) = cursor.split_once(':').ok_or("invalid_cursor")?;
        if digest != signature { return Err("stale_cursor"); }
        offset.parse::<usize>().map_err(|_| "invalid_cursor")?
    } else { 0 };
    if offset > scan.rows.len() { return Err("invalid_cursor"); }
    let mut page = Vec::new();
    let mut bytes = 0;
    for row in scan.rows.iter().skip(offset).take(options.limit) {
        bytes += serde_json::to_vec(row).map_err(|_| "io_failed")?.len();
        if bytes > 24000 { break; }
        page.push(row.clone());
    }
    let next = offset + page.len();
    let cursor = (next < scan.rows.len()).then(|| format!("{signature}:{next}"));
    Ok(json!({"entries":page,"next_cursor":cursor,"truncated":scan.incomplete || next < scan.rows.len(),
        "scan_truncated":scan.incomplete,"matched_count":scan.rows.len(),
        "total":if scan.incomplete {None} else {Some(scan.rows.len())},
        "scanned_entries":scan.visited,"read_bytes":scan.bytes,"matching":options.mode,
        "scope_relative_path":path}))
}
