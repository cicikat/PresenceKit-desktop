"""
bot_client/post -- POST /sensor/realtime（Bearer 鉴权，绕系统代理）。

绑定 proxies={"http": None, "https": None} 确保不走系统代理
（参见 AGENTS.md 第6条：WebSocket/HTTP 客户端必须绕过系统代理）。
"""
import logging

import requests

logger = logging.getLogger(__name__)

_NO_PROXY = {"http": None, "https": None}

SENSOR_VERSION = "sidecar/1.0"


def post_realtime(
    payload: dict,
    *,
    base_url: str,
    token: str,
    timeout: int = 10,
) -> bool:
    """
    POST payload 到 /sensor/realtime。
    成功返回 True，失败记日志并返回 False（不抛异常，保持主循环稳定）。
    """
    url = f"{base_url.rstrip('/')}/sensor/realtime"
    try:
        resp = requests.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            proxies=_NO_PROXY,
            timeout=timeout,
        )
        resp.raise_for_status()
        logger.debug("[bot_client] POST ok, ts=%s", payload.get("ts"))
        return True
    except requests.exceptions.ConnectionError:
        logger.warning("[bot_client] 后端不可达: %s", url)
    except requests.exceptions.Timeout:
        logger.warning("[bot_client] 请求超时: %s", url)
    except Exception as exc:
        logger.warning("[bot_client] POST 失败: %s", exc)
    return False
