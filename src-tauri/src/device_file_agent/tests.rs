use super::*;

#[cfg(all(windows, feature = "browser-workbench-acceptance"))]
#[test]
fn packaged_browser_uses_grant_bound_runtime_and_closes_on_drop() {
    // Explicit acceptance feature requires the packaged artifact and real Chromium.
    // This exercises native command validation, file grant reads and the process job.
    let (_tmp, grant) = fixture();
    fs::write(grant.root.join("fixture.html"),
        "<!doctype html><title>Native fixture</title><button onclick=\"this.textContent='Changed'\">Toggle</button><canvas width='30' height='30'></canvas>").unwrap();
    let executable = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../browser-sidecar/runtime/workbench/workbench.exe");
    assert!(browser::available(&executable), "build-browser-sidecar.ps1 must run first");
    let mut runtime = Runtime {
        base: grant.root.join("journal"),
        settings: Settings {device_id: new_id().unwrap(), state: Mode::Enabled,
                            grants: vec![grant.clone()], unrestricted: None},
        epoch: new_id().unwrap(), binding: grant.binding.clone(), records: vec![],
        online: true, seen: BTreeMap::new(), action: None, browser: None,
        browser_executable: executable,
    };
    let server_epoch = new_id().unwrap();
    let task = new_id().unwrap();
    let mut seq = 0;
    let mut invoke = |runtime: &mut Runtime, params: serde_json::Value| {
        seq += 1;
        let wire = json!({
            "ref": {"server_epoch":server_epoch,"device_id":runtime.settings.device_id,
                "device_epoch":runtime.epoch,"task_id":task,"workspace_id":grant.id,
                "revision":grant.revision,"nonce":new_id().unwrap(),"lease":"a".repeat(64),"seq":seq},
            "action":{"op":"browser","path":"fixture.html","query":params.to_string(),"start":1,
                "expected_sha256":null,"before":"","after":"","version_id":null},
            "ttl_ms":30000,"operation_intent":"inspect"
        });
        let receipt = runtime.execute(&server_epoch, serde_json::from_value(wire).unwrap(), Instant::now());
        assert_eq!(receipt.code, "ok", "{params}");
        receipt.body
    };
    assert_eq!(invoke(&mut runtime, json!({"op":"start","resources":[]}))["loaded"], true);
    let snapshot = invoke(&mut runtime, json!({"op":"snapshot"}));
    assert_eq!(snapshot["dimensions"]["canvasCount"], 1);
    let reference = snapshot["elements"][0]["ref"].clone();
    invoke(&mut runtime, json!({"op":"click","ref":reference,"snapshot_seq":snapshot["snapshot_seq"]}));
    assert!(invoke(&mut runtime, json!({"op":"snapshot"}))["text"].as_str().unwrap().contains("Changed"));
    let image = invoke(&mut runtime, json!({"op":"screenshot","mode":"viewport"}));
    assert!(image["bytes"].as_u64().unwrap() > 0);
    // Source changes use the file agent's save and readback path, never preview JS.
    let original = files::inspect(&grant, "fixture.html", 1).unwrap();
    let patch = files::prepare(&grant, "synthetic-edit", "fixture.html", "patch",
        original["sha256"].as_str().unwrap(), "Toggle", "Saved revision", None).unwrap();
    patch.commit(&grant).unwrap();
    assert_eq!(files::verify(&grant, "fixture.html", &patch.version.after_hash).unwrap()["verified"], true);
    assert!(files::inspect(&grant, "fixture.html", 1).unwrap()["content"].as_str().unwrap().contains("Saved revision"));
    invoke(&mut runtime, json!({"op":"reload"}));
    assert!(invoke(&mut runtime, json!({"op":"snapshot"}))["text"].as_str().unwrap().contains("Saved revision"));
    let revised = invoke(&mut runtime, json!({"op":"screenshot","mode":"viewport"}));
    assert_ne!(revised["screenshot_sha256"], image["screenshot_sha256"]);
    invoke(&mut runtime, json!({"op":"close"}));
    assert!(runtime.browser.is_none());
    assert!(!runtime.base.exists(), "inspect preview cannot write a source journal");
    assert!(fs::read_to_string(grant.root.join("fixture.html")).unwrap().contains("Saved revision"));
    // Dropping a live native session must terminate its worker, not just clear metadata.
    invoke(&mut runtime, json!({"op":"start","resources":[]}));
    let pid = runtime.browser.as_ref().unwrap().process_id();
    // Capture actual descendants before revocation; checking only the Python parent
    // would miss an orphaned Playwright driver or Chromium renderer.
    use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot,
        Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    use windows::Win32::System::Threading::{OpenProcess, GetExitCodeProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::Foundation::CloseHandle;
    let mut tree = vec![pid];
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).unwrap();
        let mut row = PROCESSENTRY32W::default();
        row.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut parents = vec![];
        if Process32FirstW(snapshot, &mut row).is_ok() {
            loop {
                parents.push((row.th32ProcessID, row.th32ParentProcessID));
                if Process32NextW(snapshot, &mut row).is_err() { break; }
            }
        }
        let _ = CloseHandle(snapshot);
        loop {
            let children: Vec<_> = parents.iter().filter(|(child, parent)|
                tree.contains(parent) && !tree.contains(child)).map(|(child, _)| *child).collect();
            if children.is_empty() { break; }
            tree.extend(children);
        }
    }
    assert!(tree.len() >= 3, "real driver and Chromium descendants required");
    let mut revoked = runtime.settings.clone();
    revoked.grants.clear();
    runtime.persist_settings(revoked).unwrap();
    assert!(runtime.browser.is_none());
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        let alive: Vec<_> = tree.iter().copied().filter(|pid| unsafe {
            if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, *pid) {
                let mut code = 259;
                let result = GetExitCodeProcess(handle, &mut code);
                let _ = CloseHandle(handle);
                result.is_err() || code == 259
            } else { false }
        }).collect();
        if alive.is_empty() { break; }
        assert!(Instant::now() < deadline, "revoked browser processes still running: {alive:?}");
        std::thread::sleep(Duration::from_millis(25));
    }
}

#[test]
fn read_task_commands_cannot_mutate_a_writable_grant() {
    // The authenticated command must carry task intent independently of grant
    // write permission. A compromised planner must not reach the write journal.
    for intent in ["inspect", "search", "read"] {
        for op in ["create", "patch", "undo"] {
            let (_tmp, grant) = fixture();
            fs::write(grant.root.join("fixture.html"), "original").unwrap();
            let mut runtime = Runtime {
                base: grant.root.join("journal"),
                settings: Settings {
                    device_id: new_id().unwrap(), state: Mode::Enabled,
                    grants: vec![grant.clone()], unrestricted: None,
                },
                epoch: new_id().unwrap(), binding: grant.binding.clone(),
                records: vec![], online: true, seen: BTreeMap::new(), action: None,
                browser: None, browser_executable: PathBuf::new(),
            };
            let server_epoch = new_id().unwrap();
            let mut wire = json!({
                "ref": {"server_epoch": server_epoch, "device_id": runtime.settings.device_id,
                    "device_epoch": runtime.epoch, "task_id": new_id().unwrap(),
                    "workspace_id": grant.id, "revision": grant.revision,
                    "nonce": new_id().unwrap(), "lease": "a".repeat(64), "seq": 1},
                "action": {"op": op, "path": if op == "create" {"new.html"} else {"fixture.html"},
                    "query": "", "start": 1, "expected_sha256": format!("{:x}", Sha256::digest(b"original")),
                    "before": "original", "after": "changed", "version_id": null},
                "ttl_ms": 30000, "operation_intent": intent,
            });
            let command: Command = serde_json::from_value(wire.clone()).unwrap();
            let receipt = runtime.execute(&server_epoch, command, Instant::now());
            assert_eq!(receipt.code, "read_only", "{intent}/{op}");
            assert_eq!(fs::read_to_string(grant.root.join("fixture.html")).unwrap(), "original");
            assert!(!grant.root.join("new.html").exists());
            assert!(!runtime.base.exists());
            assert!(runtime.records.is_empty());
            wire["ref"]["seq"] = json!(2);
            wire["action"]["op"] = json!("read");
            wire["action"]["path"] = json!("fixture.html");
            let read = runtime.execute(&server_epoch, serde_json::from_value(wire.clone()).unwrap(), Instant::now());
            assert_eq!(read.code, "ok");
            assert!(read.body["content"].as_str().unwrap().contains("original"));
            wire["ref"]["seq"] = json!(3);
            wire["operation_intent"] = json!("edit");
            wire["action"]["op"] = json!("create");
            wire["action"]["path"] = json!("new.html");
            let escalated = runtime.execute(&server_epoch, serde_json::from_value(wire.clone()).unwrap(), Instant::now());
            assert_eq!(escalated.code, "invalid_action");
            assert!(!grant.root.join("new.html").exists());
            assert!(runtime.records.is_empty());
            // A separate edit task retains its legitimate write capability.
            wire["ref"]["task_id"] = json!(new_id().unwrap());
            wire["ref"]["seq"] = json!(1);
            let edit = runtime.execute(&server_epoch, serde_json::from_value(wire.clone()).unwrap(), Instant::now());
            assert_eq!(edit.code, "ok");
            assert_eq!(fs::read_to_string(grant.root.join("new.html")).unwrap(), "changed");
            wire.as_object_mut().unwrap().remove("operation_intent");
            assert!(serde_json::from_value::<Command>(wire).is_err());
        }
    }
}

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
