"""
sensor-service/tests/conftest.py

sensor-service 是独立 sidecar 脚本(见仓库根 AGENTS.md:该目录骨架已废弃,
sensor 感知功能计划改嵌入 src-tauri/src/sensor/),main.py 靠手动
`sys.path.insert(0, str(_ROOT))` 让 `sense.xxx` / `bot_client.xxx` 可导入,
没有安装成包。测试进程复刻同样的路径处理,这样测试文件不用相对 import。

这些被测模块(activity_tracker / input_tracker / screen 的纯函数部分)不落盘、
不读 data/ 目录,因此不需要额外的沙箱 fixture。
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
