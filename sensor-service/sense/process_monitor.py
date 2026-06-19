"""
sense/process_monitor — 后台进程监测（无 PyQt 依赖）。
每次调用 scan_processes() 扫描一次，返回检测到的娱乐/工作类别。
"""
import logging

import psutil

logger = logging.getLogger(__name__)

# 娱乐 / 常用软件特征词，匹配进程名（小写）
LEISURE_PATTERNS: dict[str, list[str]] = {
    "game": [
        "steam.exe", "epicgameslauncher.exe", "leagueclient.exe",
        "genshinimpact.exe", "minecraft.exe", "valorant.exe",
        "wegame.exe", "thunder.exe",
    ],
    "video": [
        "vlc.exe", "potplayer64.exe", "mpv.exe", "bilibili.exe",
        "iqiyi.exe", "youku.exe",
    ],
    "social": [
        "discord.exe", "wechat.exe", "qq.exe", "telegram.exe",
    ],
    "creative": [
        "photoshop.exe", "illustrator.exe", "clip.exe", "krita.exe",
        "blender.exe", "davinciresolve.exe",
    ],
    "music": [
        "cloudmusic.exe", "qqmusic.exe", "spotify.exe",
    ],
}


def scan_processes() -> dict[str, str]:
    """
    扫描当前运行进程，返回检测到的类别 → 进程名。
    空字典表示未检测到已知娱乐/创作软件。
    """
    try:
        running = {p.name().lower() for p in psutil.process_iter(["name"])}
    except Exception as exc:
        logger.debug("[process_monitor] psutil scan failed: %s", exc)
        return {}

    detected: dict[str, str] = {}
    for category, patterns in LEISURE_PATTERNS.items():
        for pattern in patterns:
            if pattern in running:
                detected[category] = pattern
                break
    return detected
