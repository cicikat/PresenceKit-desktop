use super::*;

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
