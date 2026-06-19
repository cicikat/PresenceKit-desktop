# FIX-06 · 更换 chat 背景时，设置层盖在裁剪窗上方，点一下直接退出

> 前端（Emerald-client）。改动很小，根因是 z-index/定位。

## 现象

在设置里更换 chat 背景，弹出裁剪窗后，**设置窗口压在裁剪窗上方**，点裁剪窗任意处直接把设置流程关掉，走不完裁剪。

## 现状（已核对，根因）

更换背景用的是 `DreamBackgroundCropper`（`src/windows/dream/components/DreamBackgroundCropper.tsx`，标题"裁剪梦境背景 · CHAT BACKGROUND"），它从 `PreferencesPanel`（`src/windows/chat/ChatWindow.tsx` L123-124）里渲染。

层级对比：

| 元素 | 定位 / z-index | 来源 |
|---|---|---|
| Preferences 设置背板 | `position: fixed; z-index: 110` | `ChatWindow.tsx:132-134` |
| 头像裁剪 AvatarCropper | `position: fixed; z-index: 120` | `AvatarCropper.tsx:38` |
| **背景裁剪 DreamBackgroundCropper** | **`position: absolute; z-index: 40`** | `src/features/dream/DreamTokens.css` `.dream-background-cropper`（L1855-1858） |

根因：`.dream-background-cropper` 是 **z-index:40 且 position:absolute**，**低于** Preferences 设置背板（fixed, z-index:110）。于是设置背板盖在裁剪窗上面、还截走点击——点裁剪窗 = 点到了设置背板（多半触发 onClose）→ 直接退出。

对照组：头像裁剪 `AvatarCropper` 是 fixed + z-index:120（>110），所以它**没有**这个 bug。两个裁剪器层级标准不一致，正是病因。

## 实现要点

把 `.dream-background-cropper` 的层级对齐 AvatarCropper：

1. `src/features/dream/DreamTokens.css` 的 `.dream-background-cropper`：
   - `position: absolute` → **`position: fixed`**（相对视口铺满，避免被定位祖先错位）。
   - `z-index: 40` → **提到设置背板之上**（如 `120`，与 AvatarCropper 一致或更高）。
2. 确认这个 class 没有在"梦境内部"等别处被复用且依赖 z-index:40 的场景；若有，给"从设置打开背景裁剪"这一用法单独加一个更高层级的修饰类，别全局改坏梦境内的层叠。
3. 复核裁剪窗自身是否拦截背板点击（它应当 `inset:0` 铺满并吃掉点击，不让事件穿到下层设置背板）。

## 验收

- 设置 → 更换 chat 背景 → 裁剪窗在最上层，可正常拖动/缩放/点"确认导入"，全程不被设置层打断。
- 头像裁剪、梦境内其它使用该 class 的地方不回归。

## 备注

- 与 `fix-05` 同属前端，但互不相关。
- 顺带可考虑把两个裁剪器抽成同一基础层级常量，避免以后再出现"两个 cropper 层级不一致"的同类 bug（可选，非必须）。
