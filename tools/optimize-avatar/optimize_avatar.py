"""Reduce triángulos y textura de un avatar Mixamo (FBX) y lo exporta a GLB.

Uso (Blender en headless):
  blender -b -P tools/optimize-avatar/optimize_avatar.py -- \
      --input assets/oso/oso-sitting-idle.fbx \
      --output packages/client/public/avatars/oso.glb \
      [--tris 6000] [--texture 1024] [--quality 85]

Presupuesto: hasta 6 jugadores en mesa => 6 avatares * ~6k tris = ~36k tris de
personajes, cómodo en móvil. Subir --tris solo si se nota facetado en primer plano.
"""
import argparse
import os
import sys

import bpy

DEFAULT_TRIS = 6000
DEFAULT_TEXTURE = 1024
DEFAULT_QUALITY = 85


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--tris", type=int, default=DEFAULT_TRIS, help="triángulos objetivo")
    p.add_argument("--texture", type=int, default=DEFAULT_TEXTURE, help="lado máximo de textura (px)")
    p.add_argument("--quality", type=int, default=DEFAULT_QUALITY, help="calidad JPEG 1-100")
    return p.parse_args(argv)


def tri_count(obj):
    return sum(len(poly.vertices) - 2 for poly in obj.data.polygons)


def decimate(obj, target):
    current = tri_count(obj)
    if current <= target:
        print(f"[skip] {obj.name}: {current} <= {target}")
        return
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("Decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = target / current
    mod.use_collapse_triangulate = True
    mod.vertex_group_factor = 1.0
    # El modificador debe aplicarse antes del Armature para no romper el skinning.
    while obj.modifiers.find("Decimate") > 0:
        bpy.ops.object.modifier_move_up(modifier="Decimate")
    # Con shape keys no se puede aplicar; Mixamo no las usa.
    bpy.ops.object.modifier_apply(modifier="Decimate")
    print(f"[decimate] {obj.name}: {current} -> {tri_count(obj)} tris")


def shrink_textures(max_side):
    for img in bpy.data.images:
        if img.size[0] == 0:
            continue
        w, h = img.size
        scale = min(1.0, max_side / max(w, h))
        if scale < 1.0:
            img.scale(max(1, int(w * scale)), max(1, int(h * scale)))
            print(f"[texture] {img.name}: {w}x{h} -> {img.size[0]}x{img.size[1]}")


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.abspath(args.input))

    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        decimate(obj, args.tris)

    shrink_textures(args.texture)

    out = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_image_format="JPEG",
        export_jpeg_quality=args.quality,
        export_animations=True,
        export_skins=True,
        export_apply=False,
        export_yup=True,
    )
    print(f"[ok] {out} ({os.path.getsize(out) / 1024:.0f} KiB)")


main()
