use super::*;

#[test]
fn discovery_metadata_paging_search_and_readback_use_real_files() {
    // Catches implicit content reads, missing pagination and incorrect root-relative paths.
    let (_tmp, grant) = fixture();
    fs::create_dir(grant.root.join("子 目录")).unwrap();
    fs::create_dir(grant.root.join("empty")).unwrap();
    fs::write(grant.root.join("config.json"), "private configuration").unwrap();
    fs::write(grant.root.join(".hidden.txt"), "hidden").unwrap();
    fs::write(grant.root.join("a.html"), "<title>Old</title>\nsecond\n").unwrap();
    fs::write(grant.root.join("子 目录/a.html"), "<title>Nested</title>").unwrap();
    let find = files::discover(&grant, "find_name", "", r#"{"query":"**/*.html","mode":"glob"}"#).unwrap();
    assert_eq!(find["total"], 2);
    assert_eq!(find["read_bytes"], 0);
    let config = files::discover(&grant, "find_name", "", r#"{"query":"config.json","mode":"exact"}"#).unwrap();
    assert_eq!(config["total"], 1);
    assert_eq!(config["read_bytes"], 0);
    assert_eq!(files::inspect(&grant, "config.json", 1), Err("path_denied"));
    let page = files::discover(&grant, "list_dir", "", r#"{"limit":1}"#).unwrap();
    assert_eq!(page["truncated"], true);
    let next = files::discover(&grant, "list_dir", "", &json!({"limit":1,"cursor":page["next_cursor"]}).to_string()).unwrap();
    assert_ne!(page["entries"][0], next["entries"][0]);
    let empty = files::discover(&grant, "list_dir", "empty", "{}").unwrap();
    assert_eq!(empty["total"], 0);
    assert_eq!(empty["truncated"], false);
    let stat = files::discover(&grant, "stat", "子 目录", "{}").unwrap();
    assert_eq!(stat["type"], "directory");
    assert_eq!(files::discover(&grant, "stat", "missing.txt", "{}"), Err("not_found"));
    let text = files::discover(&grant, "search_text", "子 目录", r#"{"query":"<title>.*</title>","mode":"regex","content_search":true}"#).unwrap();
    assert_eq!(text["entries"][0]["relative_path"], "子 目录/a.html");
    assert_eq!(text["entries"][0]["line"], 1);
    assert_eq!(files::discover(&grant, "search_text", "", r#"{"query":"title"}"#), Err("invalid_action"));
    let read = files::discover(&grant, "read_page", "a.html", "{}").unwrap();
    assert_eq!(read["has_more"], false);
    assert_eq!(read["end"], 2);
    for path in ["../", "a.html:stream", "//server/share", "子 目录/../../"] {
        assert!(files::discover(&grant, "stat", path, "{}").is_err(), "{path}");
    }
    let old = files::inspect(&grant, "a.html", 1).unwrap();
    let patch = files::prepare(&grant, "fixture-task", "a.html", "patch", old["sha256"].as_str().unwrap(),
                               "Old", "Hello", None).unwrap();
    patch.commit(&grant).unwrap();
    assert_eq!(files::verify(&grant, "a.html", &patch.version.after_hash).unwrap()["verified"], true);
    assert!(files::inspect(&grant, "a.html", 1).unwrap()["content"].as_str().unwrap().contains("Hello"));

    let stale = files::discover(&grant, "list_dir", "", &json!({"cursor":page["next_cursor"]}).to_string());
    assert_eq!(stale, Err("stale_cursor"));
    let hidden = files::discover(&grant, "find_name", "", r#"{"query":".hidden.txt","mode":"exact"}"#).unwrap();
    assert_eq!(hidden["total"], 1);
    let none = files::discover(&grant, "find_name", "", r#"{"query":"absent"}"#).unwrap();
    assert_eq!(none["total"], 0);
    let literal = files::discover(&grant, "search_text", "", r#"{"query":"Hello","content_search":true}"#).unwrap();
    assert_eq!(literal["entries"][0]["relative_path"], "a.html");
    fs::write(grant.root.join("long.txt"), "line\n".repeat(201)).unwrap();
    let first = files::discover(&grant, "read_page", "long.txt", "{}").unwrap();
    assert_eq!(first["has_more"], true);
    assert_eq!(first["next"], 101);
    let last = files::discover(&grant, "read_page", "long.txt", r#"{"start":201}"#).unwrap();
    assert_eq!(last["has_more"], false);
    assert_eq!(first["sha256"], last["sha256"]);
    #[cfg(windows)]
    {
        let absolute = grant.root.join("A.HTML").to_string_lossy().to_uppercase();
        assert_eq!(files::discover(&grant, "read_page", &absolute, "{}").unwrap()["sha256"],
                   files::inspect(&grant, "a.html", 1).unwrap()["sha256"]);
        let slash = grant.root.join("子 目录/a.html").to_string_lossy().replace('\\', "/");
        assert_eq!(files::discover(&grant, "stat", &slash, "{}").unwrap()["type"], "file");
    }
}

fn fixture() -> (tempfile::TempDir, Grant) {
    #[cfg(target_os = "macos")]
    let fixture_parent = PathBuf::from(std::env::var_os("HOME").expect("runner HOME"));
    #[cfg(windows)]
    let fixture_parent = PathBuf::from(std::env::var_os("USERPROFILE").expect("runner USERPROFILE"));
    let tmp = tempfile::Builder::new()
        .prefix("device-file-test-")
        .tempdir_in(fixture_parent)
        .unwrap();
    let root = tmp.path().join("demo");
    fs::create_dir(&root).unwrap();
    let (root, file, identity) = files::approve(&root, false, None).unwrap();
    let grant = Grant {
        unrestricted: false,
        id: new_id().unwrap(),
        revision: new_id().unwrap(),
        root,
        file,
        identity,
        write: true,
        alias: "demo".into(),
        binding: "test".into(),
    };
    (tmp, grant)
}

#[test]
fn discovery_hard_cap_reports_partial_rows_instead_of_a_false_empty_result() {
    // More directory entries than the cap must retain useful rows and admit incompleteness.
    let (_tmp, grant) = fixture();
    for index in 0..4100 {
        fs::write(grant.root.join(format!("item-{index:04}.html")), "fixture").unwrap();
    }
    let result = files::discover(&grant, "list_dir", "", r#"{"limit":100}"#).unwrap();
    assert_eq!(result["truncated"], true);
    assert_eq!(result["total"], Value::Null);
    assert!(!result["entries"].as_array().unwrap().is_empty());
    assert_eq!(result["read_bytes"], 0);
}

#[test]
fn unrestricted_grant_reads_outside_the_picked_folder_and_requires_write_consent() {
    let (tmp, mut grant) = fixture();
    let outside = tmp.path().join("outside.txt");
    fs::write(&outside, "old text").unwrap();
    let path = outside.to_str().unwrap();
    assert_eq!(files::inspect(&grant, path, 1).err(), Some("path_denied"));
    grant.unrestricted = true;
    grant.write = false;
    assert_eq!(files::find(&grant, path).unwrap()["files"].as_array().unwrap().len(), 1);
    assert_eq!(files::inspect(&grant, path, 1).unwrap()["content"], "old text");
    let patch = |g: &Grant| files::prepare(g, "task", path, "patch", &files::hash(b"old text"),
        "old text", "new text", None);
    assert_eq!(patch(&grant).err(), Some("read_only"));
    grant.write = true;
    patch(&grant).unwrap().commit(&grant).unwrap();
    assert_eq!(fs::read(&outside).unwrap(), b"new text");
    grant.unrestricted = false;
    assert_eq!(files::inspect(&grant, path, 1).err(), Some("path_denied"));
}

#[test]
fn edits_existing_html_preserves_bytes_and_undo_checks_conflicts() {
    let (_tmp, mut grant) = fixture();
    let path = grant.root.join("eye.html");
    let before = b"\xef\xbb\xbf<!doctype html>\r\n<script>offset = y;</script>\r\n<p>keep</p>\r\n";
    fs::write(&path, before).unwrap();
    let read = files::inspect(&grant, "eye.html", 1).unwrap();
    assert_eq!(read["sha256"], files::hash(before));
    let change = files::prepare(
        &grant,
        "task",
        "eye.html",
        "patch",
        &files::hash(before),
        "offset = y",
        "offset = -y",
        None,
    )
    .unwrap();
    change.commit(&grant).unwrap();
    let after = b"\xef\xbb\xbf<!doctype html>\r\n<script>offset = -y;</script>\r\n<p>keep</p>\r\n";
    assert_eq!(fs::read(&path).unwrap(), after);
    let matched = files::verify(&grant, "eye.html", &files::hash(after)).unwrap();
    assert_eq!(matched["verified"], true);
    assert_eq!(matched["visual_checked"], "unknown");
    assert_eq!(
        files::reconcile(&grant, &change.version).unwrap()["saved"],
        true
    );
    fs::write(&path, "someone else edited this").unwrap();
    let undo = || {
        files::prepare(
            &grant,
            "task",
            "eye.html",
            "undo",
            "",
            "",
            "",
            Some(&change.version),
        )
    };
    assert_eq!(undo().err(), Some("revision_conflict"));
    fs::write(&path, after).unwrap();
    undo().unwrap().commit(&grant).unwrap();
    assert_eq!(fs::read(&path).unwrap(), before);
    grant.write = false;
    assert_eq!(
        files::prepare(
            &grant,
            "task",
            "eye.html",
            "patch",
            &files::hash(before),
            "offset = y",
            "offset = -y",
            None
        )
        .err(),
        Some("read_only")
    );
}

#[test]
fn workspace_blocks_sensitive_paths_links_and_replaced_directories() {
    let (_tmp, grant) = fixture();
    fs::write(grant.root.join("normal.txt"), "safe").unwrap();
    fs::hard_link(grant.root.join("normal.txt"), grant.root.join("alias.txt")).unwrap();
    fs::write(grant.root.join("secrets.txt"), "private").unwrap();
    for name in [
        "../outside.txt",
        "C:/outside.txt",
        "normal.txt:stream",
        "alias.txt",
        "secrets.txt",
    ] {
        assert_eq!(
            files::inspect(&grant, name, 1),
            Err("path_denied"),
            "{name}"
        );
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(
            grant.root.join("secrets.txt"),
            grant.root.join("linked.txt"),
        )
        .unwrap();
        assert_eq!(files::inspect(&grant, "linked.txt", 1), Err("path_denied"));
    }
    fs::rename(&grant.root, grant.root.with_file_name("replacement")).unwrap();
    fs::create_dir(&grant.root).unwrap();
    fs::write(grant.root.join("normal.txt"), "different directory").unwrap();
    assert_eq!(
        files::inspect(&grant, "normal.txt", 1),
        Err("grant_changed")
    );
}

#[test]
fn created_files_do_not_overwrite_and_json_syntax_is_truthful() {
    let (_tmp, grant) = fixture();
    let create = files::prepare(
        &grant,
        "task",
        "sample.json",
        "create",
        "",
        "",
        "{broken}",
        None,
    )
    .unwrap();
    create.commit(&grant).unwrap();
    assert_eq!(
        files::verify(&grant, "sample.json", &create.version.after_hash).unwrap()["syntax_checked"],
        "failed"
    );
    assert_eq!(
        files::prepare(&grant, "task", "sample.json", "create", "", "", "{}", None).err(),
        Some("already_exists")
    );
}
