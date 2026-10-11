# 电视机真实动作与头像重启修复

- [x] 阅读现有 Rig Profile / MotionLibrary / MotionPlayer、导入指南；工作区初始干净。
- [x] 头像：启动读取及连接恢复刷新，保留角色身份和过期请求隔离；浏览器重载/延迟连接回归通过。
- [x] 下载 UAL1/UAL2，记录 SHA256、原许可与实际 Clip 清单，非 Root Motion。
- [x] 共享导入 FoldArms，真实 v03 浏览器/生产 Pet 舞台播放；修正直接重定向双手跑到背后的失败姿态。
- [x] 接入 Talking/Yes/No/Rail，提供逐动作播放、暂停/继续、恢复 idle 入口。
- [x] 全量 552 测试、构建、实际渲染截图/WebM，记录浏览器和 Tauri 边界。
- [ ] open：真实 Tauri 退出重启、后端 perform/发行包联调、其它皮肤目检。
- [ ] partial：环胸专用进入/退出、双手/宽袖接触与最终手腕姿态精修。

依赖：动作导入依赖素材审计；其余动作依赖环胸实播；头像可独立交付。
边界：不改源 GLB/蒙皮/材质，不逐皮肤映射，不新增 WS/REST/后端能力。
head_tilt 复用 perform；thinking 不用电话动作冒充托腮；camera_reach 仅参考筛选。
环胸循环不等于进入/退出；先检查可靠插值过渡，不足时另做关键帧。
三面检查：现有管理 performance_mapping / turn_sink 与手机消费路径复查；手机不消费 GLB，
头像继续走既有角色头像接口；本轮无协议字段、落盘结构或权限变化。
证据：docs/motion-assets/tv-ual-import.md / provenance.json，.tmp/tv-motion-*.png、
.tmp/tv-stage-*.png、.tmp/tv-motion-video/*.webm；源 GLB 仅只读，派生资源按原规则留本机。
实播五动作均真实时间变化；生产舞台脚部增量 0，呼吸 0.997–1.003，无页面异常。
不宣称无穿模或自然过渡，thinking/camera_reach/camera_closeup 仍缺失。
