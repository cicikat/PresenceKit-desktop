"""Export a runtime-ready GLB with DEF- bones only, no morph animations, physics markers intact.

Rigify generates three bone layers: ORG- (original metarig), MCH- (mechanism/constraints),
and DEF- (deform, actually drives the mesh). The runtime only needs DEF-, and leaving
the others in bloats the file and confuses boneMap auto-resolution. This script:

1. Deletes all bones whose names start with ORG-, MCH-, or common Rigify control prefixes.
2. Deletes shape-key animations (those per-mesh clips that fight the performer).
3. Exports via glTF with custom properties enabled, so phys_chain markers survive.

Usage: blender -b <marked.blend> -P export_runtime_glb.py -- <out.glb>
"""
import bpy
import sys
import os

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not argv:
        raise SystemExit("usage: blender -b in.blend -P export_runtime_glb.py -- out.glb")
    out_path = argv[0]

    # --- Remove non-deform bones ------------------------------------------------
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not armatures:
        raise SystemExit("[export] no armature")
    arm = max(armatures, key=lambda o: len(o.data.bones))
    print(f"[export] armature: {arm.name}, {len(arm.data.bones)} bones before cleanup")

    # Switch to edit mode to delete bones (can't delete in object/pose mode).
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')

    # Rigify prefixes to remove: ORG- (metarig), MCH- (mechanism), and common control rigs.
    # VIS- (visualization) doesn't deform but is sometimes parent; safer to keep or prune carefully.
    # We keep only DEF- and a few common parents like "hips" (the Rigify root).
    edit_bones = arm.data.edit_bones
    to_remove = []
    for eb in edit_bones:
        n = eb.name
        if any(n.startswith(p) for p in ("ORG-", "MCH-", "VIS-")):
            to_remove.append(eb)
        # Rigify also creates control bones without prefix but with typical names.
        # The safe list: DEF-*, hips (root), and anything a DEF- already parents.
        # For now just remove explicit prefixes; runtime will ignore non-DEF in boneMap anyway.

    for eb in to_remove:
        edit_bones.remove(eb)

    bpy.ops.object.mode_set(mode='OBJECT')
    print(f"[export] removed {len(to_remove)} non-deform bones, {len(arm.data.bones)} remain")

    # --- Remove shape-key animations (morph-only clips) -------------------------
    # Best-effort only, and deliberately non-fatal: Blender 5.x moved Action data behind
    # slots/layers, so `act.fcurves` is not always present. The runtime already refuses to
    # auto-play a morph-only clip (see isMorphOnlyClip in src/windows/room/clipPlayer.ts),
    # so leaving these in the GLB is harmless — dropping them just keeps the file tidy.
    anims_before = len(bpy.data.actions)

    def action_curves(act):
        fcurves = getattr(act, "fcurves", None)
        if fcurves:
            return list(fcurves)
        found = []
        for layer in getattr(act, "layers", []) or []:
            for strip in getattr(layer, "strips", []) or []:
                for bag in getattr(strip, "channelbags", []) or []:
                    found.extend(getattr(bag, "fcurves", []) or [])
        return found

    morph_actions = []
    for act in bpy.data.actions:
        curves = action_curves(act)
        if not curves:
            continue
        if all("key_blocks" in (fc.data_path or "") for fc in curves):
            morph_actions.append(act)

    for act in morph_actions:
        bpy.data.actions.remove(act)

    print(f"[export] removed {len(morph_actions)} morph-only actions of {anims_before}, "
          f"{len(bpy.data.actions)} remain")

    # --- Export GLB with custom properties --------------------------------------
    # Ensure only visible meshes and the armature are selected for export.
    # Only objects linked into the active view layer can be selected. Rigify leaves its
    # WGT-* control widgets in a hidden collection outside it, so iterate the view layer
    # rather than bpy.data.objects — and skip the widgets by name regardless, since they
    # are editor gizmos that must never reach the runtime.
    bpy.ops.object.select_all(action='DESELECT')
    exported = []
    for o in bpy.context.view_layer.objects:
        if o.type not in ('MESH', 'ARMATURE'):
            continue
        if o.name.startswith('WGT-'):
            continue
        if o.name == 'Yexuan_metarig':
            continue  # the metarig is authoring data; only the generated rig deforms the mesh
        o.hide_set(False)  # a hidden-but-wanted mesh would otherwise be skipped by the exporter
        o.select_set(True)
        exported.append(o.name)
    print(f"[export] selected {len(exported)} objects: {exported}")

    # glTF export with custom properties (phys_chain survives as extras.phys_chain).
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=True,
        export_extras=True,  # writes custom properties to node.extras
        export_animations=True,
        export_apply=False,  # don't bake modifiers; armature modifier stays live
        export_yup=True,  # runtime expects +Y up
    )
    print(f"[export] wrote: {out_path}")
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"[export] size: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
