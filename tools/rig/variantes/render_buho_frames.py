"""Renders de fotogramas concretos del GLB del búho: blender -b --python render_buho_frames.py -- <glb> <dir>"""
import bpy, sys, os
from mathutils import Vector
glb, out = sys.argv[sys.argv.index("--")+1:][:2]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x = sc.render.resolution_y = 500
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = .95
arm.animation_data_create()
for view, d in (("frente", Vector((0, -1, 0))), ("lado", Vector((-1, 0, 0)))):
    cam.location = Vector((0, 0, .3)) + d * 5; cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    for act, fr in (("reposo", 1), ("coger_carta", 24), ("coger_carta", 58)):
        a = [x for x in bpy.data.actions if x.name.startswith(act)][0]
        arm.animation_data.action = a
        sc.frame_set(fr); sc.frame_set(fr)
        sc.render.filepath = os.path.join(out, f"buho_{act}_f{fr}_{view}.png"); bpy.ops.render.render(write_still=True)
