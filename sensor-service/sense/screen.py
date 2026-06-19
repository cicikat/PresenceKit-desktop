"""
sense/screen -- 屏幕截图识别（无 PyQt 依赖）。
调用 GLM-4V-Flash 识别前台窗口内容类别/是否与角色相关/简短描述。

隐私红线（必须保留）：
  前台窗口标题包含敏感词时，跳过截图和识别，不采集不上报。
  识屏默认关闭，由 config.yaml 的 screen.enabled 显式开启。
"""
import base64
import json
import logging
from io import BytesIO

import requests
import win32gui

logger = logging.getLogger(__name__)

_SENSITIVE_KEYWORDS = [
    "密码", "password", "银行", "bank", "支付", "payment",
    "微信支付", "alipay", "私聊", "secret", "1password",
    "登录", "login", "身份证", "信用卡",
]

_ANALYZE_PROMPT = """请分析这张屏幕截图，只输出JSON，不要其他内容：
{
  "category": "work/game/video/social/browser/code/idle/other",
  "yexuan_relevant": true或false,
  "description": "一句话描述用户在做什么，15字以内"
}"""


def get_foreground_title() -> str:
    """获取当前前台窗口标题（小写）。"""
    try:
        hwnd = win32gui.GetForegroundWindow()
        return win32gui.GetWindowText(hwnd).lower()
    except Exception:
        return ""


def is_sensitive_window(title: str) -> bool:
    """前台窗口标题包含敏感词时返回 True，应跳过采集。"""
    folded = str(title or "").casefold()
    return any(kw.casefold() in folded for kw in _SENSITIVE_KEYWORDS)


class ScreenSensor:
    """截图 + GLM-4V 识别器（无线程，由 main.py 控制调用时机）。"""

    def __init__(self, cfg: dict) -> None:
        self._api_key: str = cfg.get("glm_api_key", "")
        self._base_url: str = cfg.get("glm_base_url", "https://open.bigmodel.cn/api/paas/v4/")
        self._model: str = cfg.get("glm_model", "glm-4v-flash")

    def capture_and_analyze(self, foreground_title: str = "") -> dict | None:
        """
        截屏并调用 GLM-4V 识别，返回 {category, yexuan_relevant, description}。
        以下情况返回 None（不采集）：
          - 前台窗口含敏感词
          - GLM API key 未配置
          - 截图失败
          - API 调用失败
        """
        title = foreground_title or get_foreground_title()
        if is_sensitive_window(title):
            logger.info("[screen] 敏感窗口，跳过本帧")
            return None

        if not self._api_key or self._api_key in ("YOUR_GLM_API_KEY", ""):
            logger.debug("[screen] GLM API key 未配置，跳过识屏")
            return None

        img_b64 = self._screenshot_b64()
        if not img_b64:
            return None

        return self._call_glm(img_b64)

    def _screenshot_b64(self) -> str | None:
        try:
            from PIL import ImageGrab
            img = ImageGrab.grab()
            w, h = img.size
            if w > 800:
                img = img.resize((800, int(h * 800 / w)))
            buf = BytesIO()
            img.save(buf, format="JPEG", quality=50)
            return base64.b64encode(buf.getvalue()).decode()
        except Exception as exc:
            logger.warning("[screen] 截图失败: %s", exc)
            return None

    def _call_glm(self, img_b64: str) -> dict | None:
        url = f"{self._base_url.rstrip('/')}/chat/completions"
        try:
            resp = requests.post(
                url,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": self._model,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"},
                            },
                            {"type": "text", "text": _ANALYZE_PROMPT},
                        ],
                    }],
                    "max_tokens": 120,
                },
                timeout=45,
                proxies={"http": None, "https": None},
            )
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"].strip()
            text = text.replace("```json", "").replace("```", "").strip()
            return json.loads(text)
        except Exception as exc:
            logger.warning("[screen] GLM 调用失败: %s", exc)
            return None
