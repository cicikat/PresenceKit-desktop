# 场景材质转换器（2026-11-08）

需求：人物已有 toon 材质转换器，场景还没有。将其泛化为共享模块并接入房间场景。

## 架构判断

- `flonMaterial.ts`：纯 three，`applyToonBindings(root, config, opt)`，按 mesh name + slot 换 `MeshToonMaterial`，uniforms in-place 不重编译——半解耦，可复用。
- `materialsConfig.ts`：纯解析/校验，可复用。
- `roomAssets.ts` 的 `loadCharacterMaterials` / `loadCharacterToonTextures`：硬编码角色目录（`read_room_material_config`/`read_room_material_map` 走 `character/`），场景路径是 `/room/scene/<file>`，需新增场景版加载器。

## 施工

1. 抽共享：`toonMaterial.ts`/`materialsConfig.ts` 保持不变只做泛化（不写能力和包接线）。
2. Rust：`read_room_material_config` / `read_room_material_map` 加 `kind=scene|character` 参数；复用现有白名单与目录围栏。
3. 前端：`roomAssets.ts` 新增 `loadSceneMaterials(sceneFile)` / `loadSceneToonTextures(...)`，走 scene 目录。
4. 接入：`useRoomScene.ts` 场景加载成功后 `applyToonBindings(roomGroup, cfg, { textures })`；失败回退原材质。
5. 光影：场景 toon 只接材质层；后处理走现有 `gradePass`（bloom/vignette/tonemapping）+ `extraLights`/`applyShadows`，不另造。

## 三面闭环

本机 room 资产/IPC 形状变化统更新 `docs/backend-integration.md`；后端管理面与手机无新增。カメラ/语音/对话链不动。

## 验收

- [x] 有场景 sidecar 时场景 mesh 被换 toon，无 sidecar 时原材质不变。
- [ ] `tsc`/`build`/`test`/`cargo check` 通过。
- [ ] 真实 Tauri 窗口场景 toon 目检，记 partial。
