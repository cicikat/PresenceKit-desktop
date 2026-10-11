# 角色头像启动恢复（2026-10-11）

ChatWindow 先按已恢复的 character.active 读取角色头像，再用 prompt-assets 核对身份。
每次 WS connected 后再次核对并刷新，解决后端比 client 晚就绪时启动请求失败后永久空白的问题。
同角色头像 revision 与角色切换继续触发刷新；过期请求受 request 序号及角色 ID 双重隔离。
卸载使在途请求过期，并释放身份/连接订阅。不增加头像缓存或落盘字段。

浏览器生产主窗口夹具：第一次头像请求 503，后端 connected 后图片出现；重新加载 WebView 后
再次经历 503 → connected，头像再次出现。脚本 scripts/avatar-restart-browser.mjs。
这证明 React/IPC 调用恢复，未启动真实 Tauri 进程，真实退出/重启验收为 observe。

三面回查：现有 get_prompt_assets / get_character_avatar、头像上传 revision 和手机角色头像
继续使用原接口；管理面无需新开关或观测存储；scope、WS 字段、ack、TTL、手机 relay 不变。
无跨端协议影响，不修改后端/手机代码。
