# 32 · Live2D 眼追鼠标 + 交互缺口补全

> 前置：31（缺脸修复）先行。现状盘点（已查代码）：口型（音量驱动 + 说话正弦兜底）、
> 表情/mood 映射、motion 适配、物理、模型切换、背景——都有；**没有**的：视线追踪、
> hit area 点击反应（model3.json 里 HitAreaHead/Body 声明了但没人消费）。

## 1. 🟡 眼追鼠标

- **窗口内**：mousemove → `model.focus(x, y)`（pixi-live2d-display 自带 focusController，
  内置平滑内插，驱动 ParamAngleX/Y + ParamEyeBallX/Y），零额外依赖。
- **桌宠全屏追踪**（透明窗口外也追）：Rust 侧全局光标轮询（Windows `GetCursorPos`，
  30-60ms，**仅 pet 窗口可见时开启**，隐藏即停），emit event → 前端屏幕坐标换算窗口
  局部坐标 → focus()。省电约束进验收。
- 优先级：`avatarDirective` 携带 head pose（说话演出）时 directive 优先，眼追退让；
  motion 播放中由 focusController 天然叠加，不用特判。
- 设置：`live2dSettings` 加 `eyeTracking: off|window|global`（默认 window）+ 强度滑杆
  （缩放 focus 输入幅度）。i18n key。

## 2. 🟡 hit area 点击反应

- 消费 model3.json `HitAreas`：`model.hitTest()`（库自带）→ Head 命中 → 随机播放一个
  非 Idle motion / 触发对应表情；Body 命中 → 轻微 motion。本地反应即时出。
- **后端刺激回传**（符合 DESIGN「Stimulus」形态）：命中同时 POST 现有
  `perceive_event` 通道（`realm=reality, kind=touch, area=head|body`），让摸头成为
  角色可感知的现实刺激——是否回应由后端 gating 决定，前端不等待。
  防刷：本地 5s 节流后再发。
- 点击穿透/拖拽与现有 pet 窗口行为的冲突确认：hit 命中区域内点击不穿透、区域外维持
  现状（确认项，行为不改）。

## 3. 🟢 观察项（不做，记录）

- Idle motion 轮换：Idle 组当前只有 mtn_01，多素材后库自带随机轮换即生效，无代码工作。
- 视线追踪与 3D 栈（ThreeCallStage）对齐：3D 侧另有 boneResolver，本单不碰。

## 验收

- window 模式：光标在窗口内移动，视线/头部平滑跟随；directive 演出期间不打架。
- global 模式：窗口隐藏时零轮询（任务管理器无周期唤醒佐证）；关闭开关零调用。
- 摸头 → 即时本地反应 + 5s 内重复点击只发一次 perceive_event；后端不可达不报错（fire-and-forget）。
- 文案全 i18n；1v1/群聊/通话三视图不回归。
