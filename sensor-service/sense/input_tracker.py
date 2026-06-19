"""
sense/input_tracker -- 键盘/鼠标事件计数（无内容，只统计次数和频率）。

只记录：
  - 按键次数 + 退格/删除次数（不记录具体按了什么键）
  - 鼠标点击次数 + 鼠标移动距离（像素）
  - 距上次有效输入的空闲秒数
  - edit_hint：由上述指标粗判输入行为（typing_long/editing/deleting/idle）

敏感窗口保护：外部通过 set_sensitive(True/False) 控制；
敏感状态下所有键盘/鼠标事件静默忽略。
"""
import logging
import math
import threading
import time

logger = logging.getLogger(__name__)


class InputTracker:
    """后台监听键盘/鼠标，只统计数量，不记录内容。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._keystrokes: int = 0
        self._backspaces: int = 0
        self._mouse_clicks: int = 0
        self._mouse_distance_px: int = 0
        self._last_event_at: float = time.time()
        self._mouse_last: tuple[int, int] | None = None
        self._sensitive: bool = False

        self._listener_kb = None
        self._listener_ms = None

    # ── Public API ─────────────────────────────────────────────────────────────

    def set_sensitive(self, sensitive: bool) -> None:
        """敏感窗口激活时静默所有统计。"""
        with self._lock:
            self._sensitive = sensitive

    def start(self) -> None:
        """启动 pynput 监听（后台线程）。"""
        try:
            from pynput import keyboard as kb, mouse as ms

            def on_press(key):
                with self._lock:
                    if self._sensitive:
                        return
                    self._last_event_at = time.time()
                    try:
                        if key in (kb.Key.backspace, kb.Key.delete):
                            self._backspaces += 1
                        else:
                            self._keystrokes += 1
                    except Exception:
                        self._keystrokes += 1

            def on_click(x, y, button, pressed):
                if pressed:
                    with self._lock:
                        if not self._sensitive:
                            self._mouse_clicks += 1
                            self._last_event_at = time.time()

            def on_move(x, y):
                with self._lock:
                    if not self._sensitive and self._mouse_last is not None:
                        dx = x - self._mouse_last[0]
                        dy = y - self._mouse_last[1]
                        self._mouse_distance_px += int(math.sqrt(dx * dx + dy * dy))
                    self._mouse_last = (x, y)

            self._listener_kb = kb.Listener(on_press=on_press)
            self._listener_ms = ms.Listener(on_click=on_click, on_move=on_move)
            self._listener_kb.daemon = True
            self._listener_ms.daemon = True
            self._listener_kb.start()
            self._listener_ms.start()
            logger.info("[input_tracker] pynput listeners started")
        except ImportError:
            logger.warning("[input_tracker] pynput 未安装，键鼠统计不可用")
        except Exception as exc:
            logger.warning("[input_tracker] 启动失败: %s", exc)

    def stop(self) -> None:
        if self._listener_kb:
            try:
                self._listener_kb.stop()
            except Exception:
                pass
        if self._listener_ms:
            try:
                self._listener_ms.stop()
            except Exception:
                pass

    def collect(self, window_seconds: int) -> dict:
        """
        快照并重置当前窗口的统计数据，返回 dict 供组装 payload。
        window_seconds: 本次采集窗口时长（用于计算 edit_hint）。
        """
        with self._lock:
            ks = self._keystrokes
            bs = self._backspaces
            clicks = self._mouse_clicks
            dist = min(self._mouse_distance_px, 999_999)
            last_ev = self._last_event_at
            # 重置
            self._keystrokes = 0
            self._backspaces = 0
            self._mouse_clicks = 0
            self._mouse_distance_px = 0

        idle_s = int(time.time() - last_ev)
        edit_hint = _compute_edit_hint(ks, bs, idle_s, window_seconds)

        return {
            "keystrokes": ks,
            "mouse_clicks": clicks,
            "mouse_distance_px": dist,
            "idle_seconds": idle_s,
            "edit_hint": edit_hint,
        }


def _compute_edit_hint(
    keystrokes: int,
    backspaces: int,
    idle_s: int,
    window_s: int,
) -> str:
    total = keystrokes + backspaces
    if total == 0 or idle_s >= max(60, window_s):
        return "idle"
    if total > 0 and backspaces / total > 0.35:
        return "deleting"
    # keys per second (over effective window)
    effective_s = max(window_s - idle_s, 1)
    if total / effective_s > 1.5:   # >90 keys/min
        return "typing_long"
    return "editing"
