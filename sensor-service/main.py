"""
sensor-service/main.py -- 感知 sidecar 主入口。

启动方式：
    python main.py

功能：
  - 每 window_seconds 秒采集一次：键鼠输入统计、前台窗口/进程、（可选）截屏识别
  - 敏感窗口（密码/银行/支付等）自动跳过采集，不上报
  - 组装符合 /sensor/realtime 格式的 payload，POST 到后端
  - 识屏默认关闭（config.yaml screen.enabled: false），用户显式开启
"""
import logging
import sys
import time
from pathlib import Path

import yaml

_ROOT = Path(__file__).parent
sys.path.insert(0, str(_ROOT))

from sense.process_monitor import scan_processes
from sense.screen import ScreenSensor, get_foreground_title, is_sensitive_window
from sense.activity_tracker import ActivityTracker
from sense.input_tracker import InputTracker
from bot_client.post import post_realtime, SENSOR_VERSION

_CFG_PATH = _ROOT / "config.yaml"


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(name)-20s] %(levelname)s %(message)s",
    )


def _get_focus(prev_app: str) -> tuple[str, str, int]:
    """
    获取前台窗口信息。
    返回 (focus_app, title_hint, switch_delta)。
    switch_delta=1 表示本次检测到切换，0 表示未切换。
    """
    try:
        import win32gui
        import win32process
        import psutil
        hwnd = win32gui.GetForegroundWindow()
        title = win32gui.GetWindowText(hwnd)[:80]
        try:
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            focus_app = psutil.Process(pid).name()
        except Exception:
            focus_app = ""
    except Exception:
        return "", "", 0
    switched = 1 if (focus_app and focus_app != prev_app) else 0
    return focus_app, title, switched


def main() -> None:
    cfg = yaml.safe_load(_CFG_PATH.read_text(encoding="utf-8"))
    _setup_logging(cfg.get("logging", {}).get("level", "INFO"))
    logger = logging.getLogger("main")

    backend_url: str = cfg["backend"]["url"]
    backend_token: str = cfg["backend"]["token"]

    sc = cfg.get("sensor", {})
    window_seconds: int = int(sc.get("window_seconds", 30))

    proc_cfg = sc.get("process", {})
    proc_enabled: bool = bool(proc_cfg.get("enabled", True))
    proc_interval: int = int(proc_cfg.get("interval_windows", 2))

    screen_cfg = sc.get("screen", {})
    screen_enabled: bool = bool(screen_cfg.get("enabled", False))
    screen_interval: int = int(screen_cfg.get("interval_windows", 2))

    input_cfg = sc.get("input", {})
    input_enabled: bool = bool(input_cfg.get("enabled", True))

    logger.info(
        "[sidecar] 启动 window=%ds screen=%s proc=%s input=%s",
        window_seconds, screen_enabled, proc_enabled, input_enabled,
    )

    # ── 初始化传感器 ────────────────────────────────────────────────────────────
    input_tracker = InputTracker()
    if input_enabled:
        input_tracker.start()

    screen_sensor = ScreenSensor(screen_cfg)
    activity_tracker = ActivityTracker()

    _tick: int = 0
    _last_processes: dict = {}
    _last_focus_app: str = ""
    _switch_count: int = 0

    try:
        while True:
            _tick += 1
            t_start = time.time()

            # ── 前台窗口 / 进程 ──────────────────────────────────────────────────
            focus_app, title, switched = _get_focus(_last_focus_app)
            if switched:
                _switch_count += 1
                _last_focus_app = focus_app

            # 敏感窗口整帧丢弃：不上传标题、进程、输入统计或截图结果。
            sensitive = is_sensitive_window(title)
            input_tracker.set_sensitive(sensitive)
            if sensitive:
                if input_enabled:
                    input_tracker.collect(window_seconds)  # 丢弃并清零本窗口统计
                logger.info("[sidecar] 敏感窗口，本帧不采集不上报")
                elapsed = time.time() - t_start
                time.sleep(max(0.1, window_seconds - elapsed))
                continue

            # ── 输入统计 ─────────────────────────────────────────────────────────
            if input_enabled:
                input_data = input_tracker.collect(window_seconds)
            else:
                input_data = {
                    "keystrokes": 0,
                    "mouse_clicks": 0,
                    "mouse_distance_px": 0,
                    "idle_seconds": window_seconds,
                    "edit_hint": "idle",
                }

            # ── 进程扫描 ─────────────────────────────────────────────────────────
            if proc_enabled and _tick % proc_interval == 0:
                _last_processes = scan_processes()

            # ── 屏幕识别（敏感窗口已跳过）────────────────────────────────────────
            screen_payload: dict | None = None
            focus_process = focus_app.casefold()
            process_category = next(
                (
                    category
                    for category, process_name in _last_processes.items()
                    if process_name.casefold() == focus_process
                ),
                "",
            )
            if process_category:
                screen_payload = {
                    "package_name": focus_app,
                    "app_label": process_category,
                    "window_title": "",
                    "visible_text": [],
                    "clickable_text": [],
                }

            if screen_enabled and not sensitive and _tick % screen_interval == 0:
                result = screen_sensor.capture_and_analyze(foreground_title=title)
                if result:
                    activity_tracker.on_screen_result(result)
                    act = activity_tracker.get_info()
                    screen_payload = {
                        "package_name": focus_app,
                        "app_label": act["category"],  # 只上报类别，不传原始文本
                        "window_title": "",
                        "visible_text": [],
                        "clickable_text": [],
                    }

            # ── 组装 payload ──────────────────────────────────────────────────────
            payload: dict = {
                "window_seconds": window_seconds,
                "ts": time.time(),
                "sensor_version": SENSOR_VERSION,
                "input": {
                    "keystrokes": input_data["keystrokes"],
                    "mouse_clicks": input_data["mouse_clicks"],
                    "mouse_distance_px": input_data["mouse_distance_px"],
                    "idle_seconds": input_data["idle_seconds"],
                    "edit_hint": input_data["edit_hint"],
                },
                "focus": {
                    "app": focus_app or "unknown",
                    "title_hint": "",
                    "switch_count": _switch_count,
                },
            }
            if screen_payload is not None:
                payload["screen"] = screen_payload

            # 重置本窗口切换计数
            _switch_count = 0

            # ── 上报 ──────────────────────────────────────────────────────────────
            ok = post_realtime(
                payload,
                base_url=backend_url,
                token=backend_token,
            )
            if ok:
                logger.debug(
                    "[sidecar] tick=%d posted ok app=%r edit=%s idle=%ds",
                    _tick, focus_app,
                    input_data["edit_hint"],
                    input_data["idle_seconds"],
                )

            # ── 等待下个窗口 ──────────────────────────────────────────────────────
            elapsed = time.time() - t_start
            sleep_for = max(0.1, window_seconds - elapsed)
            time.sleep(sleep_for)

    except KeyboardInterrupt:
        logger.info("[sidecar] 收到中断，退出")
    finally:
        if input_enabled:
            input_tracker.stop()


if __name__ == "__main__":
    main()
