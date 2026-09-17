# 9.17 Native geometry 兼容迁移方案

状态：proposal / open。用户要求兼容已有仓外 Mod，本轮保留 updateBounds 及对应 IPC 的行为。
不新增 surface 能力，不偷偷把物理坐标解释为逻辑坐标。

当前 sync_bounds_locked 根据 manifest/主窗更新 physical bounds，update_design_satellite_bounds
可直接覆盖 bounds。后一次主窗事件会再次按 spec 计算，且直接覆盖未同步 content_rect。
仓内没有生产调用者不等于仓外没有；不能直接移除或返回错误。

## 分阶段迁移

1. 采集自用 Mod 的 updateBounds 使用样例，确认是跟随主窗、绝对屏幕定位、动画，还是临时 resize。
2. 设计 opt-in 新版本逻辑布局意图 API（anchor、offset、size、bleed/inset），由 Rust 统一换算。
   新版本维护 logical intent 与 physical output；JS 不写最终物理值。
3. 老 schema / API 保持原语义。若兼容 adapter 要从 physical 反算 logical，必须明确取样的 DPI、
   主窗位置与跨屏时序；不能在旧 API 内无版本地改变下一次 move/resize 的复位行为。
4. 迁移自用 Mod、回归 legacy/new 两条路径，DPI/负坐标/跨屏/睡眠/generation/主窗关闭逐项实测。
5. 只有用户确认全部旧 Mod 已迁移后，再另单删除旧物理写入口及 IPC。

当前不实现 adapter：绝对屏幕钉住和相对主窗锚定不是同一种行为，缺少自用 Mod 使用语义。
Host coordinator 的纯内部提取可独立进行，但不能借机改变旧 API、销毁时序或 geometry 算法。
后台/手机不消费此本地 API，无设置/权限/队列契约变化；后端总账仅需记录本地兼容/验收状态。
