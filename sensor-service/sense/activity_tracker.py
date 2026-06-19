"""
sense/activity_tracker -- 屏幕活动分段追踪（无 PyQt 依赖）。
接收 ScreenSensor 返回的识别结果，维护当前活动段，提供当前状态摘要。

简化版：只维护 current segment，不触发 DesktopEventQueue（那是后端的事）。
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

_CATEGORY_MAP: dict[str, str] = {
    "code":     "coding",
    "coding":   "coding",
    "browser":  "browsing",
    "browsing": "browsing",
    "game":     "gaming",
    "gaming":   "gaming",
    "video":    "video",
    "social":   "social",
    "document": "document",
    "work":     "document",
    "idle":     "idle",
    "other":    "other",
}

_LABELS: dict[str, str] = {
    "coding":   "写代码",
    "browsing": "刷网页",
    "gaming":   "打游戏",
    "video":    "看视频",
    "social":   "用社交软件",
    "document": "写文档",
    "idle":     "挂机",
    "other":    "其他",
}


@dataclass
class ActivitySegment:
    category: str
    started_at: datetime
    last_seen_at: datetime
    sample_count: int = 1


class ActivityTracker:
    """
    滑动窗口抖动过滤：连续 2 帧相同类别才确认切换，避免偶发截图噪声。
    """

    def __init__(self) -> None:
        self._current: Optional[ActivitySegment] = None
        self._pending: list[str] = []

    @staticmethod
    def _normalize(category: str) -> str:
        return _CATEGORY_MAP.get(category.lower().strip(), "other")

    def on_screen_result(self, result: dict) -> None:
        """喂入一次 ScreenSensor 的识别结果。"""
        category = self._normalize(result.get("category", "other"))

        self._pending.append(category)
        if len(self._pending) > 2:
            self._pending.pop(0)

        if self._current is None:
            self._current = ActivitySegment(
                category=category,
                started_at=datetime.now(),
                last_seen_at=datetime.now(),
            )
            logger.debug("[activity] 首段: %s", category)
            return

        if category == self._current.category:
            self._current.last_seen_at = datetime.now()
            self._current.sample_count += 1
        else:
            # 连续 2 帧确认才切换
            if len(self._pending) >= 2 and self._pending[-2] == category:
                logger.debug(
                    "[activity] 切换: %s -> %s", self._current.category, category
                )
                self._current = ActivitySegment(
                    category=category,
                    started_at=datetime.now(),
                    last_seen_at=datetime.now(),
                )

    def get_info(self) -> dict:
        """返回当前段摘要，供组装 /sensor/realtime payload 的 screen 字段。"""
        if self._current is None:
            return {"category": "unknown", "duration_min": 0, "label": ""}
        duration_min = int(
            (datetime.now() - self._current.started_at).total_seconds() / 60
        )
        return {
            "category": self._current.category,
            "duration_min": duration_min,
            "label": _LABELS.get(self._current.category, self._current.category),
        }
