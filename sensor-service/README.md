# sensor-service

独立 Python sidecar 骨架。按仓库根 `AGENTS.md` 的现状说明：sensor 感知功能计划改嵌入
`src-tauri/src/sensor/`（Rust 侧），本目录已废弃，后续会清理；`agent/`、`behavior/`、
`garden/` 三个子目录目前是空壳（无 `.py` 文件）。

## 测试

`tests/` 覆盖了 `sense/` 下仍在被 `main.py` 使用、且逻辑够重的纯函数/状态机部分：

- `sense/activity_tracker.py`（`ActivityTracker`）：类别归一化 + 连续 2 帧确认才切换的
  防抖状态机。
- `sense/input_tracker.py`（`_compute_edit_hint`）：idle/deleting/typing_long/editing
  的纯判定逻辑，以及 `InputTracker.collect()` 的计数重置行为。
- `sense/screen.py`（`is_sensitive_window`）：截屏/上报前的隐私红线关键词匹配。

`bot_client/post.py`、`sense/process_monitor.py`、`main.py` 本身是 I/O 胶水
（HTTP 请求、psutil 进程扫描、主循环调度），未建测试。

运行：

```bash
pytest sensor-service/tests -n auto
```

## 关于根目录 `.pytest_cache/`

`pytest` 默认在调用目录（仓库根）生成 `.pytest_cache/`，不是本目录专属产物；
根 `.gitignore` 已加 `.pytest_cache/` 忽略规则，正常运行测试不会再把它带进 git 状态。
